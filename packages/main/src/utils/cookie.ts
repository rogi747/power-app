import type {ICookie} from '../types/cookie';

/**
 * Phase 3.3 — Cookie import/export normalization.
 *
 * Accepts the three formats users commonly paste/upload and normalizes them to
 * the puppeteer `ICookie` (Protocol.Network.CookieParam) shape used by
 * `presetCookie` / CDP `Network.setCookies`:
 *   1. EditThisCookie / generic JSON array
 *   2. Netscape cookies.txt (tab-separated, with optional `#HttpOnly_` prefix)
 *   3. Raw `Cookie:` header string (`name=value; name2=value2`)
 *
 * A `defaultDomain` is used for header-string imports (which carry no domain).
 */

const toUnixSeconds = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  // Heuristic: values in ms (13 digits) -> convert to seconds.
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
};

const normalizeSameSite = (value: unknown): ICookie['sameSite'] | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const v = value.toLowerCase();
  if (v.startsWith('lax')) return 'Lax';
  if (v.startsWith('strict')) return 'Strict';
  if (v.startsWith('no') || v === 'none' || v === 'unspecified') return 'None';
  return undefined;
};

const fromJsonEntry = (raw: Record<string, unknown>): ICookie | null => {
  const name = (raw.name ?? raw.Name) as string | undefined;
  const value = (raw.value ?? raw.Value) as string | undefined;
  if (!name) {
    return null;
  }
  const cookie: ICookie = {
    name,
    value: value ?? '',
  };
  const domain = (raw.domain ?? raw.Domain ?? raw.host) as string | undefined;
  if (domain) cookie.domain = domain;
  cookie.path = (raw.path as string) ?? '/';
  if (raw.secure !== undefined) cookie.secure = Boolean(raw.secure);
  if (raw.httpOnly !== undefined) cookie.httpOnly = Boolean(raw.httpOnly);
  const sameSite = normalizeSameSite(raw.sameSite);
  if (sameSite) cookie.sameSite = sameSite;
  const expires = toUnixSeconds(raw.expirationDate ?? raw.expires ?? raw.expiry);
  if (expires !== undefined) cookie.expires = expires;
  return cookie;
};

const parseJson = (input: string): ICookie[] => {
  const data = JSON.parse(input);
  const arr = Array.isArray(data) ? data : [data];
  return arr.map(fromJsonEntry).filter((c): c is ICookie => c !== null);
};

const parseNetscape = (input: string): ICookie[] => {
  const cookies: ICookie[] = [];
  for (let line of input.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) {
      httpOnly = true;
      line = line.slice('#HttpOnly_'.length);
    } else if (line.startsWith('#')) {
      continue; // comment
    }
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [domain, , path, secure, expires, name, value] = parts;
    if (!name) continue;
    const cookie: ICookie = {
      name,
      value: value ?? '',
      domain,
      path: path || '/',
      secure: secure?.toUpperCase() === 'TRUE',
      httpOnly,
    };
    const exp = toUnixSeconds(expires);
    if (exp !== undefined) cookie.expires = exp;
    cookies.push(cookie);
  }
  return cookies;
};

const parseHeaderString = (input: string, defaultDomain?: string): ICookie[] => {
  return input
    .split(';')
    .map(pair => pair.trim())
    .filter(Boolean)
    .map(pair => {
      const idx = pair.indexOf('=');
      if (idx === -1) return null;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!name) return null;
      const cookie: ICookie = {name, value, path: '/'};
      if (defaultDomain) cookie.domain = defaultDomain;
      return cookie;
    })
    .filter((c): c is ICookie => c !== null);
};

/**
 * Detect the format and normalize to `ICookie[]`. Returns `[]` on unparseable
 * input rather than throwing, so a bad paste never crashes the import flow.
 */
export const normalizeCookies = (input: string, defaultDomain?: string): ICookie[] => {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return [];
  }
  // JSON array/object
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return parseJson(trimmed);
    } catch {
      return [];
    }
  }
  // Netscape cookies.txt (tab-delimited, 7 columns)
  if (trimmed.includes('\t') || /^#\s*Netscape/i.test(trimmed)) {
    const netscape = parseNetscape(trimmed);
    if (netscape.length) {
      return netscape;
    }
  }
  // Fallback: raw Cookie header string
  const header = trimmed.replace(/^Cookie:\s*/i, '');
  return parseHeaderString(header, defaultDomain);
};

/** Serialize live cookies (from CDP) to a pretty JSON string for export. */
export const serializeCookies = (cookies: ICookie[]): string => {
  return JSON.stringify(cookies ?? [], null, 2);
};
