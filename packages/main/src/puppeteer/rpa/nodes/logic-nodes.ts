import {registerNode} from '../registry';
import {cancellableDelay} from '../cancellation';
import {resolveParams, resolveValue} from '../variables';

/**
 * Logic, variable and data-transform nodes. These do not touch the browser;
 * they steer control flow and manipulate the variable bag.
 *
 * Branching/looping containers (if / loop) only emit control signals here; the
 * engine owns the actual traversal so that nesting and break/continue work
 * uniformly. See engine.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const outputKey = (params: Record<string, any>, fallback?: string): string | undefined =>
  params.output ? String(params.output) : params.varName ? String(params.varName) : fallback;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inputValue = (params: Record<string, any>): any =>
  params.input !== undefined ? params.input : params.value;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const compare = (a: any, op: string, b: any): boolean => {
  switch (op) {
    case '==':
      return a == b; // eslint-disable-line eqeqeq
    case '!=':
      return a != b; // eslint-disable-line eqeqeq
    case '>':
      return Number(a) > Number(b);
    case '<':
      return Number(a) < Number(b);
    case '>=':
      return Number(a) >= Number(b);
    case '<=':
      return Number(a) <= Number(b);
    case 'contains':
      return String(a).includes(String(b));
    case 'startsWith':
      return String(a).startsWith(String(b));
    case 'isEmpty':
      return a === undefined || a === null || a === '';
    case 'isNotEmpty':
      return !(a === undefined || a === null || a === '');
    default:
      return Boolean(a);
  }
};

registerNode({
  type: 'start',
  category: 'logic',
  execute: async () => undefined,
});

registerNode({
  type: 'end',
  category: 'logic',
  execute: async () => ({end: true}),
});

registerNode({
  type: 'if',
  category: 'logic',
  execute: async (node, ctx) => {
    const {left, operator, op, right} = resolveParams(node.params, ctx.variables);
    const result = compare(left, String(operator ?? op ?? '=='), right);
    return {branch: result ? 'true' : 'false'};
  },
});

registerNode({
  type: 'setVariable',
  category: 'variable',
  execute: async (node, ctx) => {
    const {name, value} = node.params ?? {};
    if (name) ctx.variables[String(name)] = resolveValue(value, ctx.variables);
  },
});

registerNode({
  type: 'getVariable',
  category: 'variable',
  execute: async (node, ctx) => {
    const {name} = node.params ?? {};
    return {output: ctx.variables[String(name)]};
  },
});

registerNode({
  type: 'delay',
  category: 'logic',
  execute: async (node, ctx) => {
    const {ms} = resolveParams(node.params, ctx.variables);
    await cancellableDelay(Number(ms) || 1000, ctx.token);
  },
});

registerNode({
  type: 'break',
  category: 'logic',
  execute: async () => ({break: true}),
});

registerNode({
  type: 'continue',
  category: 'logic',
  execute: async () => ({continue: true}),
});

// ---- Data transforms ------------------------------------------------------

registerNode({
  type: 'jsonParse',
  category: 'data',
  execute: async (node, ctx) => {
    const params = resolveParams(node.params, ctx.variables);
    const value = inputValue(params);
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const key = outputKey(params);
    if (key) ctx.variables[key] = parsed;
    return {output: parsed};
  },
});

registerNode({
  type: 'jsonStringify',
  category: 'data',
  execute: async (node, ctx) => {
    const params = resolveParams(node.params, ctx.variables);
    const str = JSON.stringify(inputValue(params));
    const key = outputKey(params);
    if (key) ctx.variables[key] = str;
    return {output: str};
  },
});

registerNode({
  type: 'regex',
  category: 'data',
  execute: async (node, ctx) => {
    const params = resolveParams(node.params, ctx.variables);
    const re = new RegExp(String(params.pattern), String(params.flags || ''));
    const match = String(params.input ?? '').match(re);
    const out = match ? (match[1] ?? match[0]) : null;
    const key = outputKey(params);
    if (key) ctx.variables[key] = out;
    return {output: out};
  },
});

registerNode({
  type: 'random',
  category: 'data',
  execute: async (node, ctx) => {
    const params = resolveParams(node.params, ctx.variables);
    const lo = Number(params.min) || 0;
    const hi = Number(params.max) || 100;
    const out = Math.floor(Math.random() * (hi - lo + 1)) + lo;
    const key = outputKey(params);
    if (key) ctx.variables[key] = out;
    return {output: out};
  },
});

registerNode({
  type: 'uuid',
  category: 'data',
  execute: async (node, ctx) => {
    const params = node.params ?? {};
    const out = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    const key = outputKey(params);
    if (key) ctx.variables[key] = out;
    return {output: out};
  },
});
