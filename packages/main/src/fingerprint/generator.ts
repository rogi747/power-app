import {createHash} from 'crypto';
import type {Fingerprint} from '../../../shared/types/fingerprint';

/**
 * Deterministic fingerprint generator (AdsPower-shaped).
 *
 * Given the same `seed`, `generateFingerprint` returns the same fingerprint, so a
 * profile's identity is stable across regenerations unless the user explicitly
 * re-rolls. All correlated fields (OS <-> UA <-> platform <-> fonts <-> screen)
 * are derived together to stay internally consistent.
 *
 * The result is serialized and handed to the customized Chromium via
 * `--extended-parameters=<base64(JSON)>`; the app does not interpret the fields.
 */

const FP_VERSION = 1;

// --- tiny seeded PRNG (mulberry32) -----------------------------------------
function makeRng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// --- OS-correlated source tables -------------------------------------------
type OsName = Fingerprint['os'];

interface OsProfile {
  os: OsName;
  uaPlatform: string;
  chromeVersions: readonly string[];
  resolutions: readonly string[];
  pixelRatios: readonly number[];
  fonts: readonly string[];
}

const WIN_FONTS = [
  'Arial', 'Calibri', 'Cambria', 'Cambria Math', 'Comic Sans MS', 'Consolas', 'Courier',
  'Courier New', 'Georgia', 'Lucida Console', 'Lucida Sans Unicode', 'Microsoft Sans Serif',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings',
];
const MAC_FONTS = [
  'American Typewriter', 'Andale Mono', 'Arial', 'Arial Black', 'Avenir', 'Avenir Next',
  'Courier', 'Courier New', 'Geneva', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Menlo',
  'Monaco', 'Optima', 'Palatino', 'San Francisco', 'Times', 'Times New Roman', 'Verdana',
];
const LINUX_FONTS = [
  'Bitstream Vera Sans', 'Bitstream Vera Serif', 'DejaVu Sans', 'DejaVu Sans Mono',
  'DejaVu Serif', 'FreeMono', 'FreeSans', 'FreeSerif', 'Liberation Mono', 'Liberation Sans',
  'Liberation Serif', 'Nimbus Mono L', 'Ubuntu', 'Ubuntu Mono',
];

const CHROME_VERSIONS = ['122.0.0.0', '123.0.0.0', '124.0.0.0', '125.0.0.0', '126.0.0.0'] as const;

const OS_PROFILES: readonly OsProfile[] = [
  {
    os: 'Windows',
    uaPlatform: 'Windows NT 10.0; Win64; x64',
    chromeVersions: CHROME_VERSIONS,
    resolutions: ['1920,1080', '1536,864', '1366,768', '2560,1440', '1600,900'],
    pixelRatios: [1, 1.25, 1.5],
    fonts: WIN_FONTS,
  },
  {
    os: 'macOS',
    uaPlatform: 'Macintosh; Intel Mac OS X 10_15_7',
    chromeVersions: CHROME_VERSIONS,
    resolutions: ['1440,900', '1680,1050', '2560,1600', '1920,1080'],
    pixelRatios: [1, 2],
    fonts: MAC_FONTS,
  },
  {
    os: 'Linux',
    uaPlatform: 'X11; Linux x86_64',
    chromeVersions: CHROME_VERSIONS,
    resolutions: ['1920,1080', '1366,768', '1600,900'],
    pixelRatios: [1],
    fonts: LINUX_FONTS,
  },
] as const;

const LANGUAGES = ['en-US,en', 'en-GB,en', 'fr-FR,fr', 'de-DE,de', 'es-ES,es', 'pt-BR,pt'] as const;
const HARDWARE_CONCURRENCY = [4, 6, 8, 12, 16] as const;
const DEVICE_MEMORY = [4, 8, 16] as const;

/**
 * Build a complete, internally-consistent fingerprint.
 * @param seed Optional stable seed (e.g. profile_id). Random if omitted.
 */
export function generateFingerprint(seed?: string): Fingerprint {
  const realSeed = seed ?? `${Date.now()}-${Math.random()}`;
  const rng = makeRng(realSeed);

  const osp = pick(rng, OS_PROFILES);
  const chromeVersion = pick(rng, osp.chromeVersions);
  const uaVersion = chromeVersion.split('.')[0];
  const ua =
    `Mozilla/5.0 (${osp.uaPlatform}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${chromeVersion} Safari/537.36`;

  const resolution = pick(rng, osp.resolutions);

  return {
    ua,
    ua_version: uaVersion,
    os: osp.os,
    screen_resolution: resolution,
    color_depth: 24,
    pixel_ratio: pick(rng, osp.pixelRatios),
    languages: pick(rng, LANGUAGES),
    language_switch: true,
    timezone: '',
    timezone_switch: true,
    geolocation: {mode: 'ask'},
    webrtc: {mode: 'proxy'},
    webgl_image: 'noise',
    webgl_metadata: {mode: 'noise'},
    canvas: 'noise',
    audio: 'noise',
    client_rects: 'noise',
    fonts: {mode: 'custom', list: [...osp.fonts]},
    hardware_concurrency: pick(rng, HARDWARE_CONCURRENCY),
    device_memory: pick(rng, DEVICE_MEMORY),
    do_not_track: false,
    flash: false,
    media_devices: 'noise',
    speech_voices: 'noise',
    fpVersion: FP_VERSION,
  };
}

/**
 * Encode a fingerprint for the `--extended-parameters` Chromium flag.
 * Returns base64(JSON). The customized browser decodes and applies it.
 */
export function buildExtendedParameters(fp: Fingerprint): string {
  return Buffer.from(JSON.stringify(fp), 'utf-8').toString('base64');
}

/** Stable hash helper, handy for deriving seeds from arbitrary input. */
export function seedFrom(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
