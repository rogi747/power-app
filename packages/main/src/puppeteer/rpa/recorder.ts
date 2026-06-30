import {randomUUID} from 'crypto';
import type {Page} from 'puppeteer';
import type {RPA} from '../../../../shared/types/rpa';
import {createLogger} from '../../../../shared/utils/logger';
import {WINDOW_LOGGER_LABEL} from '../../constants';
import {getMainWindow} from '../../mainWindow';
import {acquireSession, releaseSession, type RpaSession} from './browser-session';

const logger = createLogger(WINDOW_LOGGER_LABEL);

interface RecorderRuntime {
  sessionId: string;
  windowId: number;
  startedAt: string;
  session: RpaSession;
  events: RPA.RecorderEvent[];
}

const activeRecorders = new Map<string, RecorderRuntime>();

const sendRecorderEvent = (event: RPA.RecorderEvent) => {
  getMainWindow()?.webContents.send('rpa-recorder-event', event);
};

const normalizeSelector = (selector?: string): string | undefined =>
  selector?.replace(/\s+/g, ' ').trim() || undefined;

const shouldKeepEvent = (events: RPA.RecorderEvent[], event: RPA.RecorderEvent): boolean => {
  const last = events[events.length - 1];
  if (!last) return true;

  // Collapse noisy input streams into the latest value for the same element.
  if (
    event.type === 'input' &&
    last.type === 'input' &&
    last.selector === event.selector &&
    last.url === event.url
  ) {
    last.value = event.value;
    last.text = event.text;
    last.timestamp = event.timestamp;
    sendRecorderEvent(last);
    return false;
  }

  // Avoid double click/submit duplicates from bubbling.
  if (
    last.type === event.type &&
    last.selector === event.selector &&
    last.url === event.url &&
    Date.parse(event.timestamp) - Date.parse(last.timestamp) < 250
  ) {
    return false;
  }

  return true;
};

const recordEvent = (runtime: RecorderRuntime, raw: Partial<RPA.RecorderEvent>) => {
  const event: RPA.RecorderEvent = {
    id: randomUUID(),
    type: raw.type ?? 'click',
    url: raw.url ?? runtime.session.page.url(),
    title: raw.title,
    selector: normalizeSelector(raw.selector),
    text: raw.text,
    value: raw.value,
    tagName: raw.tagName,
    timestamp: new Date().toISOString(),
  };

  if (!shouldKeepEvent(runtime.events, event)) return;
  runtime.events.push(event);
  sendRecorderEvent(event);
};

const recordNavigation = async (runtime: RecorderRuntime, page: Page) => {
  try {
    recordEvent(runtime, {
      type: 'navigation',
      url: page.url(),
      title: await page.title().catch(() => ''),
    });
  } catch (error) {
    logger.warn('failed to record navigation', error);
  }
};

const installRecorderScript = async (runtime: RecorderRuntime) => {
  const {page} = runtime.session;

  await page.exposeFunction('__rpaRecordEvent', (payload: Partial<RPA.RecorderEvent>) => {
    recordEvent(runtime, payload);
  });

  await page.evaluateOnNewDocument(() => {
    type RecorderWindow = Window & {
      CSS?: {escape?: (value: string) => string};
      __rpaRecordEvent?: (payload: Partial<RPA.RecorderEvent>) => void | Promise<void>;
    };

    const cssEscape = (value: string): string => {
      try {
        const css = (window as RecorderWindow).CSS;
        if (css?.escape) return css.escape(value);
      } catch {
        return value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
      }
      return value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
    };

    const selectorFor = (el: Element | null): string => {
      if (!el) return '';
      if (el.id) return `#${cssEscape(el.id)}`;

      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        const name = current.getAttribute('name');
        const type = current.getAttribute('type');
        const aria = current.getAttribute('aria-label');
        if (name) part += `[name="${name.replace(/"/g, '\\"')}"]`;
        else if (type) part += `[type="${type.replace(/"/g, '\\"')}"]`;
        else if (aria) part += `[aria-label="${aria.replace(/"/g, '\\"')}"]`;
        else {
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(x => x.tagName === current?.tagName);
            if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    };

    const elementText = (el: Element | null): string => {
      if (!el) return '';
      const text =
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.textContent ||
        '';
      return text.replace(/\s+/g, ' ').trim().slice(0, 120);
    };

    const emit = (payload: Partial<RPA.RecorderEvent>) => {
      const fn = (window as RecorderWindow).__rpaRecordEvent;
      if (typeof fn !== 'function') return;
      void fn({
        ...payload,
        url: location.href,
        title: document.title,
      });
    };

    const describe = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      return {
        selector: selectorFor(el),
        text: elementText(el),
        tagName: el?.tagName.toLowerCase(),
        value:
          input && 'value' in input
            ? String(input.value ?? '').slice(0, 500)
            : undefined,
      };
    };

    document.addEventListener(
      'click',
      event => {
        emit({type: 'click', ...describe(event.target)});
      },
      true,
    );

    document.addEventListener(
      'input',
      event => {
        emit({type: 'input', ...describe(event.target)});
      },
      true,
    );

    document.addEventListener(
      'change',
      event => {
        emit({type: 'change', ...describe(event.target)});
      },
      true,
    );

    document.addEventListener(
      'submit',
      event => {
        emit({type: 'submit', ...describe(event.target)});
      },
      true,
    );
  });

  // Install immediately for the current document too.
  await page.evaluate(() => {
    if (window.top !== window) return;
    const script = document.createElement('script');
    script.textContent = `(${(() => {
      type RecorderWindow = Window & {
        CSS?: {escape?: (value: string) => string};
        __rpaRecordEvent?: (payload: Record<string, unknown>) => void | Promise<void>;
        __rpaRecorderInstalled?: boolean;
      };

      const cssEscape = (value: string): string => {
        try {
          const css = (window as RecorderWindow).CSS;
          if (css?.escape) return css.escape(value);
        } catch {
          return value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
        }
        return value.replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
      };
      const selectorFor = (el: Element | null): string => {
        if (!el) return '';
        if (el.id) return `#${cssEscape(el.id)}`;
        const parts: string[] = [];
        let current: Element | null = el;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
          let part = current.tagName.toLowerCase();
          const name = current.getAttribute('name');
          const type = current.getAttribute('type');
          const aria = current.getAttribute('aria-label');
          if (name) part += `[name="${name.replace(/"/g, '\\"')}"]`;
          else if (type) part += `[type="${type.replace(/"/g, '\\"')}"]`;
          else if (aria) part += `[aria-label="${aria.replace(/"/g, '\\"')}"]`;
          else {
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(x => x.tagName === current?.tagName);
              if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }
          parts.unshift(part);
          current = current.parentElement;
        }
        return parts.join(' > ');
      };
      const elementText = (el: Element | null): string => {
        if (!el) return '';
        const text = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent || '';
        return text.replace(/\s+/g, ' ').trim().slice(0, 120);
      };
      const emit = (payload: Record<string, unknown>) => {
        const fn = (window as RecorderWindow).__rpaRecordEvent;
        if (typeof fn !== 'function') return;
        void fn({...payload, url: location.href, title: document.title});
      };
      const describe = (target: EventTarget | null) => {
        const el = target instanceof Element ? target : null;
        const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        return {
          selector: selectorFor(el),
          text: elementText(el),
          tagName: el?.tagName.toLowerCase(),
          value: input && 'value' in input ? String(input.value ?? '').slice(0, 500) : undefined,
        };
      };
      if ((window as RecorderWindow).__rpaRecorderInstalled) return;
      (window as RecorderWindow).__rpaRecorderInstalled = true;
      document.addEventListener('click', event => emit({type: 'click', ...describe(event.target)}), true);
      document.addEventListener('input', event => emit({type: 'input', ...describe(event.target)}), true);
      document.addEventListener('change', event => emit({type: 'change', ...describe(event.target)}), true);
      document.addEventListener('submit', event => emit({type: 'submit', ...describe(event.target)}), true);
    }).toString()})()`;
    document.documentElement.appendChild(script);
    script.remove();
  }).catch(() => undefined);

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) void recordNavigation(runtime, page);
  });
};

export const RpaRecorder = {
  async start(windowId: number): Promise<RPA.RecorderSession> {
    const existing = Array.from(activeRecorders.values()).find(r => r.windowId === windowId);
    if (existing) {
      return {
        id: existing.sessionId,
        windowId,
        startedAt: existing.startedAt,
        eventCount: existing.events.length,
      };
    }

    const session = await acquireSession(windowId);
    const runtime: RecorderRuntime = {
      sessionId: randomUUID(),
      windowId,
      startedAt: new Date().toISOString(),
      session,
      events: [],
    };
    activeRecorders.set(runtime.sessionId, runtime);
    await installRecorderScript(runtime);
    await recordNavigation(runtime, session.page);

    return {
      id: runtime.sessionId,
      windowId,
      startedAt: runtime.startedAt,
      eventCount: runtime.events.length,
    };
  },

  async stop(sessionId: string): Promise<{success: boolean; events: RPA.RecorderEvent[]}> {
    const runtime = activeRecorders.get(sessionId);
    if (!runtime) return {success: false, events: []};
    activeRecorders.delete(sessionId);
    await releaseSession(runtime.session);
    return {success: true, events: runtime.events};
  },

  events(sessionId: string): RPA.RecorderEvent[] {
    return activeRecorders.get(sessionId)?.events ?? [];
  },
};
