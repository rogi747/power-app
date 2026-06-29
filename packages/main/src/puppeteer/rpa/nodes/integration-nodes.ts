import {registerNode} from '../registry';
import {resolveParams} from '../variables';

/**
 * Integration / plugin nodes.
 *
 * These call external services over HTTPS. They use the runtime global `fetch`
 * (available in modern Electron/Node 18+), so no extra HTTP dependency is
 * pulled in. API keys are passed through node params; the renderer is expected
 * to store them encrypted (preload/node-crypto) and inject them at run time.
 *
 * Every node writes its result back into the variable bag under the key given
 * by `params.output` (default mirrors the node type), so downstream nodes can
 * read it via `{{output.path}}`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setOutput = (ctx: {variables: Record<string, any>}, key: string, value: unknown) => {
  ctx.variables[key] = value;
};

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                     */
/* -------------------------------------------------------------------------- */
registerNode({
  type: 'openai',
  category: 'integration',
  execute: async (node, ctx) => {
    const p = resolveParams(node.params, ctx.variables);
    const apiKey = String(p.apiKey || '');
    const model = String(p.model || 'gpt-4o-mini');
    const prompt = String(p.prompt || '');
    const system = p.system ? String(p.system) : undefined;
    const outputKey = String(p.output || 'openai');

    const messages: {role: string; content: string}[] = [];
    if (system) messages.push({role: 'system', content: system});
    messages.push({role: 'user', content: prompt});

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: p.temperature != null ? Number(p.temperature) : 0.7,
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    setOutput(ctx, outputKey, {text, raw: data});
  },
});

/* -------------------------------------------------------------------------- */
/* Google Sheets (via API key or service-account bearer token)               */
/* -------------------------------------------------------------------------- */
registerNode({
  type: 'googleSheetsRead',
  category: 'integration',
  execute: async (node, ctx) => {
    const p = resolveParams(node.params, ctx.variables);
    const spreadsheetId = String(p.spreadsheetId || '');
    const range = String(p.range || 'Sheet1');
    const accessToken = p.accessToken ? String(p.accessToken) : '';
    const apiKey = p.apiKey ? String(p.apiKey) : '';
    const outputKey = String(p.output || 'sheet');

    let url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}`;
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    else if (apiKey) url += `?key=${apiKey}`;

    const res = await fetch(url, {headers});
    if (!res.ok) {
      throw new Error(`Google Sheets read failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const values: string[][] = data?.values ?? [];
    // Expose both the raw matrix and a cell map (A1 -> value) for {{sheet.A1}}.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells: Record<string, any> = {values, rows: values};
    values.forEach((row, r) => {
      row.forEach((cell, c) => {
        const col = String.fromCharCode(65 + c);
        cells[`${col}${r + 1}`] = cell;
      });
    });
    setOutput(ctx, outputKey, cells);
  },
});

registerNode({
  type: 'googleSheetsAppend',
  category: 'integration',
  execute: async (node, ctx) => {
    const p = resolveParams(node.params, ctx.variables);
    const spreadsheetId = String(p.spreadsheetId || '');
    const range = String(p.range || 'Sheet1');
    const accessToken = String(p.accessToken || '');
    const outputKey = String(p.output || 'sheetAppend');
    // values may arrive as a 2D array or a single row.
    let rows = p.values;
    if (!Array.isArray(rows)) rows = [[rows]];
    else if (!Array.isArray(rows[0])) rows = [rows];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}:append?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({values: rows}),
    });
    if (!res.ok) {
      throw new Error(`Google Sheets append failed (${res.status}): ${await res.text()}`);
    }
    setOutput(ctx, outputKey, await res.json());
  },
});

/* -------------------------------------------------------------------------- */
/* Generic REST / HTTP request                                               */
/* -------------------------------------------------------------------------- */
registerNode({
  type: 'httpRequest',
  category: 'integration',
  execute: async (node, ctx) => {
    const p = resolveParams(node.params, ctx.variables);
    const url = String(p.url || '');
    const method = String(p.method || 'GET').toUpperCase();
    const outputKey = String(p.output || 'http');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let headers: Record<string, string> = {};
    if (p.headers && typeof p.headers === 'object') headers = p.headers;
    else if (typeof p.headers === 'string' && p.headers.trim()) {
      try {
        headers = JSON.parse(p.headers);
      } catch {
        headers = {};
      }
    }

    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD' && p.body != null) {
      body = typeof p.body === 'string' ? p.body : JSON.stringify(p.body);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const res = await fetch(url, {method, headers, body});
    const contentType = res.headers.get('content-type') || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    if (contentType.includes('application/json')) data = await res.json();
    else data = await res.text();
    setOutput(ctx, outputKey, {status: res.status, ok: res.ok, data});
  },
});

/* -------------------------------------------------------------------------- */
/* 2Captcha — solve image / reCAPTCHA challenges                             */
/* -------------------------------------------------------------------------- */
registerNode({
  type: 'solveCaptcha',
  category: 'integration',
  execute: async (node, ctx) => {
    const p = resolveParams(node.params, ctx.variables);
    const apiKey = String(p.apiKey || '');
    const type = String(p.type || 'recaptcha'); // 'recaptcha' | 'image'
    const outputKey = String(p.output || 'captcha');

    // Submit the task.
    const submit = new URLSearchParams({key: apiKey, json: '1'});
    if (type === 'recaptcha') {
      submit.set('method', 'userrecaptcha');
      submit.set('googlekey', String(p.siteKey || ''));
      submit.set('pageurl', String(p.pageUrl || ctx.page.url()));
    } else {
      submit.set('method', 'base64');
      submit.set('body', String(p.imageBase64 || ''));
    }
    const inRes = await fetch(`https://2captcha.com/in.php?${submit.toString()}`);
    const inData = await inRes.json();
    if (inData.status !== 1) {
      throw new Error(`2Captcha submit failed: ${inData.request}`);
    }
    const captchaId = inData.request;

    // Poll for the result (up to ~120s).
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await fetch(
        `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`,
      );
      const pollData = await poll.json();
      if (pollData.status === 1) {
        setOutput(ctx, outputKey, {token: pollData.request, id: captchaId});
        return;
      }
      if (pollData.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha error: ${pollData.request}`);
      }
    }
    throw new Error('2Captcha timed out waiting for a solution.');
  },
});
