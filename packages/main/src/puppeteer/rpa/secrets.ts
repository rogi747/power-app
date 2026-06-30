import type {RPA} from '../../../../shared/types/rpa';
import {decrypt, encrypt} from '../../utils/crypto';

const PREFIX = 'rpaenc:v1:';
const STRIPPED = '__RPA_SECRET_STRIPPED__';
const MASK = '***REDACTED***';

const SECRET_PARAM_KEYS: Record<string, string[]> = {
  openai: ['apiKey'],
  googleSheetsRead: ['accessToken', 'apiKey'],
  googleSheetsAppend: ['accessToken'],
  solveCaptcha: ['apiKey'],
};

const GENERIC_SECRET_KEYS = new Set([
  'apiKey',
  'accessToken',
  'refreshToken',
  'token',
  'password',
  'secret',
  'clientSecret',
]);

const cloneWorkflow = (workflow: RPA.Workflow): RPA.Workflow =>
  JSON.parse(JSON.stringify(workflow)) as RPA.Workflow;

const isEncrypted = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(PREFIX);

const encryptSecretValue = (value: unknown): unknown => {
  if (value === STRIPPED) return '';
  if (value === undefined || value === null || value === '') return value;
  if (isEncrypted(value)) return value;
  return `${PREFIX}${encrypt(String(value))}`;
};

const decryptSecretValue = (value: unknown): unknown => {
  if (!isEncrypted(value)) return value;
  return decrypt(value.slice(PREFIX.length));
};

const stripSecretValue = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return value;
  return STRIPPED;
};

const isGenericSecretKey = (key: string): boolean => {
  const normalized = key.replace(/[-_\s]/g, '').toLowerCase();
  return [...GENERIC_SECRET_KEYS].some(secretKey =>
    normalized === secretKey.toLowerCase() || normalized.includes(secretKey.toLowerCase()),
  );
};

const secretKeysForNode = (node: RPA.Node): Set<string> => {
  const keys = new Set<string>(SECRET_PARAM_KEYS[node.type] ?? []);
  for (const key of Object.keys(node.params ?? {})) {
    if (isGenericSecretKey(key)) keys.add(key);
  }
  return keys;
};

const transformWorkflowSecrets = (
  workflow: RPA.Workflow,
  transform: (value: unknown) => unknown,
): RPA.Workflow => {
  const next = cloneWorkflow(workflow);

  for (const node of next.nodes ?? []) {
    if (!node.params) continue;
    for (const key of secretKeysForNode(node)) {
      if (Object.prototype.hasOwnProperty.call(node.params, key)) {
        node.params[key] = transform(node.params[key]);
      }
    }
  }

  for (const variable of next.variables ?? []) {
    if (variable.secret && Object.prototype.hasOwnProperty.call(variable, 'value')) {
      variable.value = transform(variable.value);
    }
  }

  return next;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const valueToMask = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value);
  // Very short strings create too many false positives in normal logs.
  if (text.length < 4 || text === STRIPPED || text === MASK) return null;
  return text;
};

const collectSecretValues = (
  workflow: RPA.Workflow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runtimeVariables?: Record<string, any>,
): string[] => {
  const values = new Set<string>();
  const secretVariableNames = new Set<string>();

  for (const node of workflow.nodes ?? []) {
    const params = node.params ?? {};
    for (const key of secretKeysForNode(node)) {
      const value = valueToMask(params[key]);
      if (value) values.add(value);
    }
  }

  for (const variable of workflow.variables ?? []) {
    if (variable.secret) {
      secretVariableNames.add(variable.name);
      const value = valueToMask(variable.value);
      if (value) values.add(value);
    }
  }

  for (const [key, value] of Object.entries(runtimeVariables ?? {})) {
    if (!isGenericSecretKey(key) && !secretVariableNames.has(key)) continue;
    const secretValue = valueToMask(value);
    if (secretValue) values.add(secretValue);
  }

  return [...values].sort((a, b) => b.length - a.length);
};

export const maskSensitiveText = (value: unknown, secretValues: string[] = []): string | undefined => {
  if (value === undefined || value === null) return undefined;
  let text = String(value);

  for (const secret of secretValues) {
    text = text.replace(new RegExp(escapeRegExp(secret), 'g'), MASK);
  }

  // Also catch common key/value forms even when the actual value was not in the
  // workflow document, e.g. errors emitted by HTTP clients.
  text = text
    .replace(/((?:api[-_\s]?key|access[-_\s]?token|refresh[-_\s]?token|client[-_\s]?secret|password|secret|token)\s*[:=]\s*)([^\s,;&]+)/gi, `$1${MASK}`)
    .replace(/((?:api[-_\s]?key|access[-_\s]?token|refresh[-_\s]?token|client[-_\s]?secret|password|secret|token)"\s*:\s*")([^"]+)/gi, `$1${MASK}`)
    .replace(/(authorization\s*[:=]\s*bearer\s+)([^\s,;&]+)/gi, `$1${MASK}`);

  return text;
};

export const createTaskLogMasker = (
  workflow: RPA.Workflow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runtimeVariables?: Record<string, any>,
): ((entry: RPA.TaskLog) => RPA.TaskLog) => {
  const secretValues = collectSecretValues(workflow, runtimeVariables);
  return (entry: RPA.TaskLog): RPA.TaskLog => ({
    ...entry,
    message: maskSensitiveText(entry.message, secretValues),
    stack: maskSensitiveText(entry.stack, secretValues),
  });
};

export const encryptWorkflowSecrets = (workflow: RPA.Workflow): RPA.Workflow =>
  transformWorkflowSecrets(workflow, encryptSecretValue);

export const decryptWorkflowSecrets = (workflow: RPA.Workflow): RPA.Workflow =>
  transformWorkflowSecrets(workflow, decryptSecretValue);

export const stripWorkflowSecrets = (workflow: RPA.Workflow): RPA.Workflow =>
  transformWorkflowSecrets(workflow, stripSecretValue);

export const isStrippedSecret = (value: unknown): boolean => value === STRIPPED;
