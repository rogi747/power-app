/**
 * Variable interpolation for RPA node params.
 *
 * Supports `{{name}}` and dotted paths like `{{sheet.A1}}` / `{{openai.text}}`.
 * A standalone template (`"{{user}}"`) returns the raw typed value so numbers,
 * arrays and objects survive; an embedded template (`"Hi {{user}}"`) is
 * stringified into the surrounding text.
 */

const TEMPLATE = /\{\{\s*([\w.[\]]+)\s*\}\}/g;
const STANDALONE = /^\{\{\s*([\w.[\]]+)\s*\}\}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPath = (obj: Record<string, any>, path: string): any => {
  const parts = path.replace(/\[(\w+)\]/g, '.$1').split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
};

/** Resolve a single value, recursing into objects and arrays. */
export const resolveValue = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  if (typeof value === 'string') {
    const standalone = value.match(STANDALONE);
    if (standalone) {
      const resolved = getPath(variables, standalone[1]);
      return resolved === undefined ? '' : resolved;
    }
    return value.replace(TEMPLATE, (_, path) => {
      const resolved = getPath(variables, path);
      if (resolved === undefined || resolved === null) return '';
      return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveValue(v, variables));
  }
  if (value && typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveValue(v, variables);
    }
    return out;
  }
  return value;
};

/** Resolve every param of a node against the current variable bag. */
export const resolveParams = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any> | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> => {
  if (!params) return {};
  return resolveValue(params, variables);
};
