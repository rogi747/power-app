import type {RPA} from '../types/rpa';

export type RpaValidationLevel = 'error' | 'warning';

export interface RpaValidationIssue {
  level: RpaValidationLevel;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface RpaValidationResult {
  valid: boolean;
  issues: RpaValidationIssue[];
}

interface NodeValidationSpec {
  required?: string[];
  /** Alternative field names accepted by older workflows / UI versions. */
  aliases?: Record<string, string[]>;
  maxOutgoing?: number;
}

export const RPA_NODE_SPECS: Record<string, NodeValidationSpec> = {
  start: {maxOutgoing: 1},
  end: {maxOutgoing: 0},
  navigate: {required: ['url']},
  refresh: {},
  back: {},
  forward: {},
  click: {required: ['selector']},
  doubleClick: {required: ['selector']},
  hover: {required: ['selector']},
  type: {required: ['selector']},
  keyboardPress: {required: ['key']},
  scroll: {},
  waitForSelector: {required: ['selector']},
  wait: {required: ['ms']},
  delay: {required: ['ms']},
  screenshot: {},
  getText: {required: ['selector'], aliases: {output: ['varName']}},
  getAttribute: {required: ['selector', 'attribute'], aliases: {output: ['varName']}},
  executeJS: {required: ['code'], aliases: {output: ['varName']}},
  executeJavascript: {required: ['code'], aliases: {output: ['varName']}},
  if: {aliases: {operator: ['op']}},
  loop: {},
  setVariable: {required: ['name']},
  getVariable: {required: ['name']},
  break: {},
  continue: {},
  jsonParse: {required: ['input'], aliases: {input: ['value'], output: ['varName']}},
  jsonStringify: {required: ['input'], aliases: {input: ['value'], output: ['varName']}},
  regex: {required: ['input', 'pattern'], aliases: {output: ['varName']}},
  random: {aliases: {output: ['varName']}},
  uuid: {aliases: {output: ['varName']}},
  openai: {required: ['apiKey', 'prompt']},
  googleSheetsRead: {required: ['spreadsheetId', 'range']},
  googleSheetsAppend: {required: ['spreadsheetId', 'range', 'accessToken', 'values']},
  httpRequest: {required: ['url']},
  solveCaptcha: {required: ['apiKey', 'type']},
};

const hasValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const hasParam = (
  params: Record<string, unknown> | undefined,
  key: string,
  aliases: Record<string, string[]> = {},
): boolean => {
  if (!params) return false;
  if (hasValue(params[key])) return true;
  return (aliases[key] ?? []).some(alias => hasValue(params[alias]));
};

const addIssue = (
  issues: RpaValidationIssue[],
  level: RpaValidationLevel,
  message: string,
  extra?: Pick<RpaValidationIssue, 'nodeId' | 'edgeId'>,
) => {
  issues.push({level, message, ...extra});
};

export const validateWorkflow = (workflow?: RPA.Workflow | null): RpaValidationResult => {
  const issues: RpaValidationIssue[] = [];

  if (!workflow) {
    addIssue(issues, 'error', 'Workflow definition is missing.');
    return {valid: false, issues};
  }

  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];

  if (nodes.length === 0) {
    addIssue(issues, 'error', 'Workflow has no nodes. Add a Start node and at least one action.');
    return {valid: false, issues};
  }

  const nodeById = new Map<string, RPA.Node>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, RPA.Edge[]>();
  const edgeKeys = new Set<string>();

  for (const node of nodes) {
    if (!node.id) {
      addIssue(issues, 'error', 'A node is missing its id.');
      continue;
    }
    if (nodeById.has(node.id)) {
      addIssue(issues, 'error', `Duplicate node id: ${node.id}.`, {nodeId: node.id});
    }
    nodeById.set(node.id, node);

    const spec = RPA_NODE_SPECS[node.type];
    if (!spec) {
      addIssue(issues, 'error', `Unknown node type: ${node.type}.`, {nodeId: node.id});
      continue;
    }

    for (const field of spec.required ?? []) {
      if (!hasParam(node.params, field, spec.aliases)) {
        addIssue(issues, 'error', `Node "${node.label || node.type}" is missing required field "${field}".`, {
          nodeId: node.id,
        });
      }
    }
  }

  for (const edge of edges) {
    if (!edge.id) {
      addIssue(issues, 'error', 'An edge is missing its id.');
    }
    if (!nodeById.has(edge.source)) {
      addIssue(issues, 'error', `Edge source node does not exist: ${edge.source}.`, {edgeId: edge.id});
    }
    if (!nodeById.has(edge.target)) {
      addIssue(issues, 'error', `Edge target node does not exist: ${edge.target}.`, {edgeId: edge.id});
    }
    if (edge.source === edge.target) {
      addIssue(issues, 'error', 'A node cannot connect to itself.', {edgeId: edge.id, nodeId: edge.source});
    }

    const key = `${edge.source}:${edge.sourceHandle ?? ''}:${edge.target}:${edge.targetHandle ?? ''}`;
    if (edgeKeys.has(key)) {
      addIssue(issues, 'warning', 'Duplicate edge detected.', {edgeId: edge.id});
    }
    edgeKeys.add(key);

    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    const out = outgoing.get(edge.source) ?? [];
    out.push(edge);
    outgoing.set(edge.source, out);
  }

  const startNodes = nodes.filter(n => n.type === 'start');
  if (startNodes.length === 0) {
    const implicitStarts = nodes.filter(n => !n.isGroup && (incoming.get(n.id) ?? 0) === 0);
    if (implicitStarts.length === 0) {
      addIssue(issues, 'error', 'Workflow has no start node.');
    } else if (implicitStarts.length > 1) {
      addIssue(issues, 'warning', 'Workflow has multiple implicit start nodes. Add one explicit Start node.');
    }
  } else if (startNodes.length > 1) {
    addIssue(issues, 'error', 'Workflow can only contain one Start node.');
  }

  for (const node of nodes) {
    const spec = RPA_NODE_SPECS[node.type];
    const out = outgoing.get(node.id) ?? [];
    if (spec?.maxOutgoing !== undefined && out.length > spec.maxOutgoing) {
      addIssue(
        issues,
        spec.maxOutgoing === 0 ? 'error' : 'warning',
        `Node "${node.label || node.type}" has too many outgoing connections.`,
        {nodeId: node.id},
      );
    }
    if (node.type !== 'start' && node.type !== 'end' && (incoming.get(node.id) ?? 0) === 0) {
      addIssue(issues, 'warning', `Node "${node.label || node.type}" is not connected to the workflow.`, {
        nodeId: node.id,
      });
    }
  }

  for (const node of nodes.filter(n => n.type === 'loop')) {
    const out = outgoing.get(node.id) ?? [];
    if (!out.some(e => e.sourceHandle === 'loopBody')) {
      addIssue(issues, 'error', `Loop node "${node.label || node.type}" has no loop body connection.`, {
        nodeId: node.id,
      });
    }
  }

  return {valid: !issues.some(i => i.level === 'error'), issues};
};

export const firstValidationMessage = (result: RpaValidationResult): string =>
  result.issues[0]?.message ?? 'Workflow validation failed.';
