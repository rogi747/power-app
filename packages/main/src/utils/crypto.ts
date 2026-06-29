import {randomBytes, createCipheriv, createDecipheriv} from 'crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {join, dirname} from 'path';
import {app} from 'electron';

/**
 * Lightweight credential encryption using AES-256-GCM (Node built-in crypto).
 *
 * The symmetric key is generated on first use and persisted (hex) in the app
 * config directory. This protects credentials from casual inspection of the
 * SQLite database. NOTE: because the key lives on the same disk as the data, an
 * attacker with filesystem access can still decrypt — this is "light" encryption
 * by design (see docs/decisions.md [Phase 3]).
 */

const KEY_FILE_PATH = join(app.getPath('userData'), 'chrome-power-secret.key');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce recommended for GCM
const KEY_LENGTH = 32; // 256-bit key

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  try {
    if (existsSync(KEY_FILE_PATH)) {
      const hex = readFileSync(KEY_FILE_PATH, 'utf-8').trim();
      const buf = Buffer.from(hex, 'hex');
      if (buf.length === KEY_LENGTH) {
        cachedKey = buf;
        return cachedKey;
      }
    }
  } catch {
    // fall through to regenerate
  }

  const key = randomBytes(KEY_LENGTH);
  const dir = dirname(KEY_FILE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, {recursive: true});
  }
  writeFileSync(KEY_FILE_PATH, key.toString('hex'), {encoding: 'utf-8'});
  cachedKey = key;
  return cachedKey;
}

/**
 * Encrypt a UTF-8 string. Output format (base64): iv | authTag | ciphertext.
 * Empty / nullish input returns an empty string (no-op) so callers can store
 * optional fields without special-casing.
 */
export function encrypt(plain?: string | null): string {
  if (!plain) {
    return '';
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a string produced by {@link encrypt}. Returns an empty string for
 * empty input and is tolerant of malformed/legacy plaintext values (returns the
 * raw input) so a corrupt row never crashes the read path.
 */
export function decrypt(payload?: string | null): string {
  if (!payload) {
    return '';
  }
  try {
    const key = getKey();
    const data = Buffer.from(payload, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = data.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    // Not a valid encrypted payload (e.g. legacy plaintext) — return as-is.
    return payload;
  }
}
