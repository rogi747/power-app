// Node catalog for the Process Builder.
//
// This describes every node the UI can place: its label, category, default
// params, and the form fields shown in the property panel. The runtime
// executors live in main (puppeteer/rpa/nodes/*); the `type` strings here MUST
// match the registered executor types exactly.

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'json';

export interface NodeField {
  key: string;
  label: string;
  type: FieldType;
  options?: {label: string; value: string}[];
  placeholder?: string;
  /** Mark fields holding secrets so the UI can mask + encrypt them. */
  secret?: boolean;
}

export interface NodeSpec {
  type: string;
  label: string;
  category: 'browser' | 'logic' | 'data' | 'variable' | 'integration';
  icon: string; // iconify name
  description: string;
  fields: NodeField[];
  /** Source handles this node exposes (default: a single unnamed output). */
  outputs?: {id: string; label: string}[];
}

export const NODE_CATALOG: NodeSpec[] = [
  // ---- Browser ------------------------------------------------------------
  {
    type: 'navigate',
    label: 'Go to URL',
    category: 'browser',
    icon: 'mdi:web',
    description: 'Open a page in the profile.',
    fields: [
      {key: 'url', label: 'URL', type: 'text', placeholder: 'https://example.com'},
      {
        key: 'waitUntil',
        label: 'Wait until',
        type: 'select',
        options: [
          {label: 'Network idle', value: 'networkidle2'},
          {label: 'DOM loaded', value: 'domcontentloaded'},
          {label: 'Load', value: 'load'},
        ],
      },
    ],
  },
  {
    type: 'click',
    label: 'Click',
    category: 'browser',
    icon: 'mdi:cursor-default-click',
    description: 'Click an element by selector.',
    fields: [{key: 'selector', label: 'Selector', type: 'text', placeholder: '#submit'}],
  },
  {
    type: 'type',
    label: 'Type text',
    category: 'browser',
    icon: 'mdi:keyboard',
    description: 'Type into an input.',
    fields: [
      {key: 'selector', label: 'Selector', type: 'text', placeholder: 'input[name=q]'},
      {key: 'text', label: 'Text', type: 'text', placeholder: 'Hello {{name}}'},
      {key: 'clear', label: 'Clear first', type: 'boolean'},
      {key: 'delay', label: 'Key delay (ms)', type: 'number', placeholder: '0'},
    ],
  },
  {
    type: 'waitForSelector',
    label: 'Wait for element',
    category: 'browser',
    icon: 'mdi:timer-sand',
    description: 'Pause until an element appears.',
    fields: [
      {key: 'selector', label: 'Selector', type: 'text'},
      {key: 'visible', label: 'Must be visible', type: 'boolean'},
    ],
  },
  {
    type: 'getText',
    label: 'Get text',
    category: 'browser',
    icon: 'mdi:text-box-search',
    description: 'Read an element\'s text into a variable.',
    fields: [
      {key: 'selector', label: 'Selector', type: 'text'},
      {key: 'output', label: 'Save to variable', type: 'text', placeholder: 'result'},
    ],
  },
  {
    type: 'getAttribute',
    label: 'Get attribute',
    category: 'browser',
    icon: 'mdi:tag-text-outline',
    description: 'Read an element attribute into a variable.',
    fields: [
      {key: 'selector', label: 'Selector', type: 'text'},
      {key: 'attribute', label: 'Attribute', type: 'text', placeholder: 'href'},
      {key: 'output', label: 'Save to variable', type: 'text', placeholder: 'attr'},
    ],
  },
  {
    type: 'screenshot',
    label: 'Screenshot',
    category: 'browser',
    icon: 'mdi:camera',
    description: 'Capture the page.',
    fields: [
      {key: 'path', label: 'File path', type: 'text', placeholder: 'shot.png'},
      {key: 'fullPage', label: 'Full page', type: 'boolean'},
      {key: 'output', label: 'Save base64 to variable', type: 'text', placeholder: 'screenshot'},
    ],
  },
  {
    type: 'executeJS',
    label: 'Run JavaScript',
    category: 'browser',
    icon: 'mdi:language-javascript',
    description: 'Evaluate code in the page.',
    fields: [
      {key: 'code', label: 'Code', type: 'textarea', placeholder: 'document.title'},
      {key: 'output', label: 'Save result to', type: 'text'},
    ],
  },
  {
    type: 'scroll',
    label: 'Scroll',
    category: 'browser',
    icon: 'mdi:mouse-move-down',
    description: 'Scroll the page.',
    fields: [
      {key: 'x', label: 'Scroll X (px)', type: 'number', placeholder: '0'},
      {key: 'y', label: 'Scroll Y (px)', type: 'number', placeholder: '600'},
    ],
  },

  // ---- Logic --------------------------------------------------------------
  {
    type: 'start',
    label: 'Start',
    category: 'logic',
    icon: 'mdi:play-circle-outline',
    description: 'Workflow entry point.',
    fields: [],
  },
  {
    type: 'end',
    label: 'End',
    category: 'logic',
    icon: 'mdi:stop-circle-outline',
    description: 'Stop the workflow successfully.',
    fields: [],
    outputs: [],
  },
  {
    type: 'if',
    label: 'If / Else',
    category: 'logic',
    icon: 'mdi:call-split',
    description: 'Branch on a condition.',
    fields: [
      {key: 'left', label: 'Left value', type: 'text', placeholder: '{{count}}'},
      {
        key: 'operator',
        label: 'Operator',
        type: 'select',
        options: [
          {label: '==', value: '=='},
          {label: '!=', value: '!='},
          {label: '>', value: '>'},
          {label: '<', value: '<'},
          {label: '>=', value: '>='},
          {label: '<=', value: '<='},
          {label: 'contains', value: 'contains'},
          {label: 'starts with', value: 'startsWith'},
          {label: 'is empty', value: 'isEmpty'},
          {label: 'is not empty', value: 'isNotEmpty'},
        ],
      },
      {key: 'right', label: 'Right value', type: 'text'},
    ],
    outputs: [
      {id: 'true', label: 'True'},
      {id: 'false', label: 'False'},
    ],
  },
  {
    type: 'loop',
    label: 'Loop',
    category: 'logic',
    icon: 'mdi:repeat',
    description: 'Repeat the body for each item / N times.',
    fields: [
      {key: 'count', label: 'Repeat count', type: 'number'},
      {key: 'items', label: 'Items (variable)', type: 'text', placeholder: '{{rows}}'},
      {key: 'itemVar', label: 'Current item →', type: 'text', placeholder: 'item'},
      {key: 'indexVar', label: 'Current index →', type: 'text', placeholder: 'i'},
    ],
    outputs: [
      {id: 'loopBody', label: 'Each'},
      {id: 'default', label: 'Done'},
    ],
  },
  {
    type: 'delay',
    label: 'Delay',
    category: 'logic',
    icon: 'mdi:timer-outline',
    description: 'Wait for a number of milliseconds.',
    fields: [{key: 'ms', label: 'Milliseconds', type: 'number', placeholder: '1000'}],
  },

  // ---- Variable / data ----------------------------------------------------
  {
    type: 'setVariable',
    label: 'Set variable',
    category: 'variable',
    icon: 'mdi:variable',
    description: 'Assign a value to a variable.',
    fields: [
      {key: 'name', label: 'Name', type: 'text'},
      {key: 'value', label: 'Value', type: 'text'},
    ],
  },
  {
    type: 'jsonParse',
    label: 'Parse JSON',
    category: 'data',
    icon: 'mdi:code-json',
    description: 'Parse a JSON string into a variable.',
    fields: [
      {key: 'input', label: 'JSON string', type: 'text'},
      {key: 'output', label: 'Save to', type: 'text'},
    ],
  },
  {
    type: 'jsonStringify',
    label: 'Stringify JSON',
    category: 'data',
    icon: 'mdi:code-json',
    description: 'Convert a value/object into JSON text.',
    fields: [
      {key: 'input', label: 'Value', type: 'text', placeholder: '{{data}}'},
      {key: 'output', label: 'Save to', type: 'text'},
    ],
  },
  {
    type: 'regex',
    label: 'Regex extract',
    category: 'data',
    icon: 'mdi:regex',
    description: 'Extract a match from text.',
    fields: [
      {key: 'input', label: 'Input', type: 'text'},
      {key: 'pattern', label: 'Pattern', type: 'text'},
      {key: 'flags', label: 'Flags', type: 'text', placeholder: 'i'},
      {key: 'output', label: 'Save to', type: 'text'},
    ],
  },
  {
    type: 'random',
    label: 'Random number',
    category: 'data',
    icon: 'mdi:dice-multiple-outline',
    description: 'Generate a random integer.',
    fields: [
      {key: 'min', label: 'Min', type: 'number', placeholder: '0'},
      {key: 'max', label: 'Max', type: 'number', placeholder: '100'},
      {key: 'output', label: 'Save to', type: 'text', placeholder: 'random'},
    ],
  },
  {
    type: 'uuid',
    label: 'UUID',
    category: 'data',
    icon: 'mdi:identifier',
    description: 'Generate a UUID-like value.',
    fields: [{key: 'output', label: 'Save to', type: 'text', placeholder: 'uuid'}],
  },

  // ---- Integrations -------------------------------------------------------
  {
    type: 'openai',
    label: 'OpenAI',
    category: 'integration',
    icon: 'simple-icons:openai',
    description: 'Send a prompt to OpenAI and capture the reply.',
    fields: [
      {key: 'apiKey', label: 'API key', type: 'text', secret: true},
      {key: 'model', label: 'Model', type: 'text', placeholder: 'gpt-4o-mini'},
      {key: 'system', label: 'System prompt', type: 'textarea'},
      {key: 'prompt', label: 'Prompt', type: 'textarea'},
      {key: 'output', label: 'Save reply to', type: 'text', placeholder: 'openai'},
    ],
  },
  {
    type: 'googleSheetsRead',
    label: 'Sheets: Read',
    category: 'integration',
    icon: 'mdi:google-spreadsheet',
    description: 'Read a range from a Google Sheet.',
    fields: [
      {key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text'},
      {key: 'range', label: 'Range', type: 'text', placeholder: 'Sheet1!A1:C10'},
      {key: 'accessToken', label: 'Access token', type: 'text', secret: true},
      {key: 'apiKey', label: 'API key (read-only)', type: 'text', secret: true},
      {key: 'output', label: 'Save to', type: 'text', placeholder: 'sheet'},
    ],
  },
  {
    type: 'googleSheetsAppend',
    label: 'Sheets: Append',
    category: 'integration',
    icon: 'mdi:google-spreadsheet',
    description: 'Append a row to a Google Sheet.',
    fields: [
      {key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text'},
      {key: 'range', label: 'Range', type: 'text', placeholder: 'Sheet1'},
      {key: 'accessToken', label: 'Access token', type: 'text', secret: true},
      {key: 'values', label: 'Values (variable / JSON)', type: 'text'},
      {key: 'output', label: 'Save response to', type: 'text', placeholder: 'sheetAppend'},
    ],
  },
  {
    type: 'httpRequest',
    label: 'HTTP request',
    category: 'integration',
    icon: 'mdi:api',
    description: 'Call any REST endpoint.',
    fields: [
      {key: 'url', label: 'URL', type: 'text'},
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({label: m, value: m})),
      },
      {key: 'headers', label: 'Headers (JSON)', type: 'textarea'},
      {key: 'body', label: 'Body', type: 'textarea'},
      {key: 'output', label: 'Save response to', type: 'text', placeholder: 'http'},
    ],
  },
  {
    type: 'solveCaptcha',
    label: '2Captcha',
    category: 'integration',
    icon: 'mdi:robot-confused',
    description: 'Solve a captcha via 2Captcha.',
    fields: [
      {key: 'apiKey', label: '2Captcha key', type: 'text', secret: true},
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          {label: 'reCAPTCHA', value: 'recaptcha'},
          {label: 'Image', value: 'image'},
        ],
      },
      {key: 'siteKey', label: 'Site key', type: 'text'},
      {key: 'pageUrl', label: 'Page URL', type: 'text'},
      {key: 'imageBase64', label: 'Image base64', type: 'textarea'},
      {key: 'output', label: 'Save token to', type: 'text', placeholder: 'captcha'},
    ],
  },
];

export const CATEGORY_LABELS: Record<NodeSpec['category'], string> = {
  browser: 'Browser',
  logic: 'Logic',
  data: 'Data',
  variable: 'Variables',
  integration: 'Integrations',
};

export const CATEGORY_COLORS: Record<NodeSpec['category'], string> = {
  browser: '#2f80ed',
  logic: '#9b51e0',
  data: '#219653',
  variable: '#f2994a',
  integration: '#eb5757',
};

export const getSpec = (type: string): NodeSpec | undefined =>
  NODE_CATALOG.find(n => n.type === type);
