import {registerNode, registerNodeAlias} from '../registry';
import {cancellableDelay} from '../cancellation';
import {resolveParams} from '../variables';

/**
 * Browser automation nodes. Each runs against the live Puppeteer Page held in
 * the execution context (which is attached to an existing profile, never a new
 * browser). Params are resolved for `{{variable}}` templates before use.
 */

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const outputKey = (params: Record<string, any>, fallback?: string): string | undefined =>
  params.output ? String(params.output) : params.varName ? String(params.varName) : fallback;

registerNode({
  type: 'navigate',
  category: 'browser',
  execute: async (node, ctx) => {
    const {url, waitUntil} = resolveParams(node.params, ctx.variables);
    await ctx.page.goto(String(url), {
      waitUntil: (waitUntil as never) || 'networkidle2',
      timeout: num(node.error?.timeout, 30000),
    });
  },
});

registerNode({
  type: 'refresh',
  category: 'browser',
  execute: async (_node, ctx) => {
    await ctx.page.reload({waitUntil: 'networkidle2'});
  },
});

registerNode({
  type: 'back',
  category: 'browser',
  execute: async (_node, ctx) => {
    await ctx.page.goBack();
  },
});

registerNode({
  type: 'forward',
  category: 'browser',
  execute: async (_node, ctx) => {
    await ctx.page.goForward();
  },
});

registerNode({
  type: 'click',
  category: 'browser',
  execute: async (node, ctx) => {
    const {selector} = resolveParams(node.params, ctx.variables);
    await ctx.page.waitForSelector(String(selector), {timeout: num(node.error?.timeout, 30000)});
    await ctx.page.click(String(selector));
  },
});

registerNode({
  type: 'doubleClick',
  category: 'browser',
  execute: async (node, ctx) => {
    const {selector} = resolveParams(node.params, ctx.variables);
    await ctx.page.waitForSelector(String(selector));
    await ctx.page.click(String(selector), {clickCount: 2});
  },
});

registerNode({
  type: 'hover',
  category: 'browser',
  execute: async (node, ctx) => {
    const {selector} = resolveParams(node.params, ctx.variables);
    await ctx.page.waitForSelector(String(selector));
    await ctx.page.hover(String(selector));
  },
});

registerNode({
  type: 'type',
  category: 'browser',
  execute: async (node, ctx) => {
    const {selector, text, delay, clear} = resolveParams(node.params, ctx.variables);
    await ctx.page.waitForSelector(String(selector));
    if (clear) {
      await ctx.page.$eval(String(selector), el => {
        (el as HTMLInputElement).value = '';
      });
    }
    await ctx.page.type(String(selector), String(text ?? ''), {delay: num(delay, 0)});
  },
});

registerNode({
  type: 'keyboardPress',
  category: 'browser',
  execute: async (node, ctx) => {
    const {key} = resolveParams(node.params, ctx.variables);
    await ctx.page.keyboard.press(key as never);
  },
});

registerNode({
  type: 'scroll',
  category: 'browser',
  execute: async (node, ctx) => {
    const {x, y} = resolveParams(node.params, ctx.variables);
    await ctx.page.evaluate(
      (sx, sy) => window.scrollBy(sx, sy),
      num(x, 0),
      num(y, 600),
    );
  },
});

registerNode({
  type: 'waitForSelector',
  category: 'browser',
  execute: async (node, ctx) => {
    const {selector, visible} = resolveParams(node.params, ctx.variables);
    await ctx.page.waitForSelector(String(selector), {
      visible: !!visible,
      timeout: num(node.error?.timeout, 30000),
    });
  },
});

registerNode({
  type: 'wait',
  category: 'browser',
  execute: async (node, ctx) => {
    const {ms} = resolveParams(node.params, ctx.variables);
    await cancellableDelay(num(ms, 1000), ctx.token);
  },
});

registerNode({
  type: 'screenshot',
  category: 'browser',
  execute: async (node, ctx) => {
    const params = resolveParams(node.params, ctx.variables);
    const buffer = await ctx.page.screenshot({
      path: params.path ? String(params.path) : undefined,
      fullPage: !!params.fullPage,
      encoding: 'base64',
    });
    const key = outputKey(params);
    if (key) ctx.variables[key] = buffer;
  },
});

registerNode({
  type: 'getText',
  category: 'browser',
  execute: async (node, ctx) => {
    const params = resolveParams(node.params, ctx.variables);
    await ctx.page.waitForSelector(String(params.selector));
    const text = await ctx.page.$eval(String(params.selector), el => el.textContent?.trim() ?? '');
    const key = outputKey(params);
    if (key) ctx.variables[key] = text;
    return {output: text};
  },
});

registerNode({
  type: 'getAttribute',
  category: 'browser',
  execute: async (node, ctx) => {
    const params = resolveParams(node.params, ctx.variables);
    const value = await ctx.page.$eval(
      String(params.selector),
      (el, attr) => el.getAttribute(attr as string),
      String(params.attribute),
    );
    const key = outputKey(params);
    if (key) ctx.variables[key] = value;
    return {output: value};
  },
});

registerNode({
  type: 'executeJS',
  category: 'browser',
  execute: async (node, ctx) => {
    const params = resolveParams(node.params, ctx.variables);
    // eslint-disable-next-line no-new-func
    const result = await ctx.page.evaluate(new Function(`return (${params.code})`) as never);
    const key = outputKey(params);
    if (key) ctx.variables[key] = result;
    return {output: result};
  },
});

// Backward compatibility for workflows created before the UI/runtime contract
// was aligned around executeJS.
registerNodeAlias('executeJavascript', 'executeJS');
