import {registerNode} from '../registry';
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
    await new Promise(r => setTimeout(r, num(ms, 1000)));
  },
});

registerNode({
  type: 'screenshot',
  category: 'browser',
  execute: async (node, ctx) => {
    const {path, fullPage, varName} = resolveParams(node.params, ctx.variables);
    const buffer = await ctx.page.screenshot({
      path: path ? String(path) : undefined,
      fullPage: !!fullPage,
      encoding: 'base64',
    });
    if (varName) ctx.variables[String(varName)] = buffer;
  },
});

registerNode({
  type: 'getText',
  category: 'browser',
  execute: async (node, ctx) => {
    const {selector, varName} = resolveParams(node.params, ctx.variables);
    await ctx.page.waitForSelector(String(selector));
    const text = await ctx.page.$eval(String(selector), el => el.textContent?.trim() ?? '');
    if (varName) ctx.variables[String(varName)] = text;
    return {output: text};
  },
});

registerNode({
  type: 'getAttribute',
  category: 'browser',
  execute: async (node, ctx) => {
    const {selector, attribute, varName} = resolveParams(node.params, ctx.variables);
    const value = await ctx.page.$eval(
      String(selector),
      (el, attr) => el.getAttribute(attr as string),
      String(attribute),
    );
    if (varName) ctx.variables[String(varName)] = value;
    return {output: value};
  },
});

registerNode({
  type: 'executeJavascript',
  category: 'browser',
  execute: async (node, ctx) => {
    const {code, varName} = resolveParams(node.params, ctx.variables);
    // eslint-disable-next-line no-new-func
    const result = await ctx.page.evaluate(new Function(`return (${code})`) as never);
    if (varName) ctx.variables[String(varName)] = result;
    return {output: result};
  },
});
