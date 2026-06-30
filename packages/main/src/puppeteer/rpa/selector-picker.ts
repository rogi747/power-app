import {randomUUID} from 'crypto';
import type {RPA} from '../../../../shared/types/rpa';
import {createLogger} from '../../../../shared/utils/logger';
import {WINDOW_LOGGER_LABEL} from '../../constants';
import {acquireSession, releaseSession} from './browser-session';

const logger = createLogger(WINDOW_LOGGER_LABEL);

interface BrowserPickPayload {
  selector: string;
  url: string;
  title?: string;
  text?: string;
  value?: string;
  tagName?: string;
}

const PICK_TIMEOUT = 60000;

const functionName = (): string => `__rpaPickSelector_${randomUUID().replace(/-/g, '')}`;

export const pickSelector = async (
  windowId: number,
  timeoutMs = PICK_TIMEOUT,
): Promise<RPA.SelectorPickResult> => {
  const session = await acquireSession(windowId);
  const {page} = session;
  const pickFunction = functionName();

  try {
    const resultPromise = new Promise<RPA.SelectorPickResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Selector picker timed out.'));
      }, timeoutMs);

      void page.exposeFunction(pickFunction, (payload: BrowserPickPayload) => {
        clearTimeout(timer);
        resolve({
          selector: payload.selector,
          url: payload.url,
          title: payload.title,
          text: payload.text,
          value: payload.value,
          tagName: payload.tagName,
          timestamp: new Date().toISOString(),
        });
      });
    });

    await page.evaluate((fnName: string) => {
      interface PickerPayload {
        selector: string;
        url: string;
        title?: string;
        text?: string;
        value?: string;
        tagName?: string;
      }

      type PickerWindow = Window & Record<string, (payload: PickerPayload) => void | Promise<void>>;

      const fallbackEscape = (value: string): string =>
        value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);

      const cssEscape = (value: string): string => {
        const css = window.CSS as {escape?: (input: string) => string} | undefined;
        return css?.escape ? css.escape(value) : fallbackEscape(value);
      };

      const quoteAttr = (value: string): string => value.replace(/"/g, '\\"');

      const selectorFor = (el: Element | null): string => {
        if (!el) return '';
        if (el.id) return `#${cssEscape(el.id)}`;

        const dataTest = el.getAttribute('data-testid') || el.getAttribute('data-test');
        if (dataTest) return `[data-testid="${quoteAttr(dataTest)}"]`;

        const parts: string[] = [];
        let current: Element | null = el;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
          let part = current.tagName.toLowerCase();
          const name = current.getAttribute('name');
          const type = current.getAttribute('type');
          const aria = current.getAttribute('aria-label');
          const role = current.getAttribute('role');

          if (current.id) {
            part = `#${cssEscape(current.id)}`;
            parts.unshift(part);
            break;
          }
          if (name) part += `[name="${quoteAttr(name)}"]`;
          else if (type) part += `[type="${quoteAttr(type)}"]`;
          else if (aria) part += `[aria-label="${quoteAttr(aria)}"]`;
          else if (role) part += `[role="${quoteAttr(role)}"]`;
          else {
            const parent = current.parentElement;
            if (parent) {
              const sameTag = Array.from(parent.children).filter(
                child => child.tagName === current?.tagName,
              );
              if (sameTag.length > 1) {
                part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
              }
            }
          }

          parts.unshift(part);
          current = current.parentElement;
        }

        return parts.join(' > ');
      };

      const elementText = (el: Element): string => {
        const text =
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.textContent ||
          '';
        return text.replace(/\s+/g, ' ').trim().slice(0, 200);
      };

      const createOverlay = () => {
        const overlay = document.createElement('div');
        overlay.id = '__rpa_selector_picker_overlay';
        overlay.style.position = 'fixed';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '2147483647';
        overlay.style.border = '2px solid #2563eb';
        overlay.style.background = 'rgba(37, 99, 235, 0.12)';
        overlay.style.borderRadius = '4px';
        overlay.style.display = 'none';
        document.documentElement.appendChild(overlay);
        return overlay;
      };

      const createHint = () => {
        const hint = document.createElement('div');
        hint.id = '__rpa_selector_picker_hint';
        hint.textContent = 'RPA Picker: click an element to capture selector. Press Esc to cancel.';
        hint.style.position = 'fixed';
        hint.style.left = '12px';
        hint.style.top = '12px';
        hint.style.zIndex = '2147483647';
        hint.style.background = '#0f172a';
        hint.style.color = '#fff';
        hint.style.padding = '8px 10px';
        hint.style.borderRadius = '8px';
        hint.style.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        hint.style.boxShadow = '0 8px 24px rgba(15,23,42,0.24)';
        document.documentElement.appendChild(hint);
        return hint;
      };

      const oldOverlay = document.getElementById('__rpa_selector_picker_overlay');
      const oldHint = document.getElementById('__rpa_selector_picker_hint');
      oldOverlay?.remove();
      oldHint?.remove();

      const overlay = createOverlay();
      const hint = createHint();
      let active: Element | null = null;
      let done = false;

      const cleanup = () => {
        document.removeEventListener('mousemove', onMouseMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        hint.remove();
      };

      const updateOverlay = (target: Element) => {
        const rect = target.getBoundingClientRect();
        overlay.style.display = rect.width > 0 && rect.height > 0 ? 'block' : 'none';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
      };

      function onMouseMove(event: MouseEvent) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target === overlay || target === hint) return;
        active = target;
        updateOverlay(target);
      }

      function onClick(event: MouseEvent) {
        if (done) return;
        const target = active ?? (event.target instanceof Element ? event.target : null);
        if (!target || target === overlay || target === hint) return;
        done = true;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const input = target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const payload: PickerPayload = {
          selector: selectorFor(target),
          url: location.href,
          title: document.title,
          text: elementText(target),
          tagName: target.tagName.toLowerCase(),
          value: 'value' in input ? String(input.value ?? '').slice(0, 500) : undefined,
        };
        cleanup();
        void (window as unknown as PickerWindow)[fnName](payload);
      }

      function onKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        done = true;
        cleanup();
      }

      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeyDown, true);
    }, pickFunction);

    return await resultPromise;
  } catch (error) {
    logger.warn('selector picker failed', error);
    throw error;
  } finally {
    await releaseSession(session);
  }
};
