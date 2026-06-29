import {registerNode} from '../registry';
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
  type: 'if',
  category: 'logic',
  execute: async (node, ctx) => {
    const {left, operator, right} = resolveParams(node.params, ctx.variables);
    const result = compare(left, String(operator || '=='), right);
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
    await new Promise(r => setTimeout(r, Number(ms) || 1000));
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
    const {value, varName} = resolveParams(node.params, ctx.variables);
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (varName) ctx.variables[String(varName)] = parsed;
    return {output: parsed};
  },
});

registerNode({
  type: 'jsonStringify',
  category: 'data',
  execute: async (node, ctx) => {
    const {value, varName} = resolveParams(node.params, ctx.variables);
    const str = JSON.stringify(value);
    if (varName) ctx.variables[String(varName)] = str;
    return {output: str};
  },
});

registerNode({
  type: 'regex',
  category: 'data',
  execute: async (node, ctx) => {
    const {input, pattern, flags, varName} = resolveParams(node.params, ctx.variables);
    const re = new RegExp(String(pattern), String(flags || ''));
    const match = String(input).match(re);
    const out = match ? (match[1] ?? match[0]) : null;
    if (varName) ctx.variables[String(varName)] = out;
    return {output: out};
  },
});

registerNode({
  type: 'random',
  category: 'data',
  execute: async (node, ctx) => {
    const {min, max, varName} = resolveParams(node.params, ctx.variables);
    const lo = Number(min) || 0;
    const hi = Number(max) || 100;
    const out = Math.floor(Math.random() * (hi - lo + 1)) + lo;
    if (varName) ctx.variables[String(varName)] = out;
    return {output: out};
  },
});

registerNode({
  type: 'uuid',
  category: 'data',
  execute: async (node, ctx) => {
    const {varName} = node.params ?? {};
    const out = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    if (varName) ctx.variables[String(varName)] = out;
    return {output: out};
  },
});
