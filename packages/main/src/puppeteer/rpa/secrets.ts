import type {RPA} from '../../../../shared/types/rpa';
import {decrypt, encrypt} from '../../utils/crypto';

const PREFIX = 'rpaenc:v1:';
const STRIPPED = '__RPA_SECRET_STRIPPED__';

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

const secretKeysForNode = (node: RPA.Node): Set<string> => {
  const keys = new Set<string>(SECRET_PARAM_KEYS[node.type] ?? []);
  for (const key of Object.keys(node.params ?? {})) {
    if (GENERIC_SECRET_KEYS.has(key)) keys.add(key);
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

export const encryptWorkflowSecrets = (workflow: RPA.Workflow): RPA.Workflow =>
  transformWorkflowSecrets(workflow, encryptSecretValue);

export const decryptWorkflowSecrets = (workflow: RPA.Workflow): RPA.Workflow =>
  transformWorkflowSecrets(workflow, decryptSecretValue);

export const stripWorkflowSecrets = (workflow: RPA.Workflow): RPA.Workflow =>
  transformWorkflowSecrets(workflow, stripSecretValue);

export const isStrippedSecret = (value: unknown): boolean => value === STRIPPED;
