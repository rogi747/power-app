// types/fingerprint.d.ts
// Fingerprint schema mirroring AdsPower's `fingerprint_config`.
// The app generates this JSON per profile and passes it to a customized
// Chromium via `--extended-parameters=<base64(JSON)>`. The app itself does
// NOT interpret the fields at runtime; the (later plugged-in) browser reads them.

export type FpMode = 'noise' | 'block' | 'real' | 'custom';

export interface FingerprintGeolocation {
  /** 'ask' | 'allow' | 'block' | 'custom' */
  mode: 'ask' | 'allow' | 'block' | 'custom';
  lat?: number;
  lon?: number;
  accuracy?: number;
}

export interface FingerprintWebRTC {
  /** 'forward' | 'proxy' | 'local' | 'disabled' */
  mode: 'forward' | 'proxy' | 'local' | 'disabled';
}

export interface FingerprintWebGLMetadata {
  mode: FpMode;
  vendor?: string;
  renderer?: string;
}

export interface FingerprintFonts {
  mode: FpMode;
  list: string[];
}

export interface Fingerprint {
  ua: string;
  ua_version: string;
  os: 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS';
  screen_resolution: string; // e.g. "1920,1080"
  color_depth: number;
  pixel_ratio: number;
  languages: string; // e.g. "en-US,en"
  language_switch: boolean; // sync languages with proxy IP
  timezone: string; // e.g. "America/New_York" ('' => follow proxy IP)
  timezone_switch: boolean; // sync timezone with proxy IP
  geolocation: FingerprintGeolocation;
  webrtc: FingerprintWebRTC;
  webgl_image: FpMode;
  webgl_metadata: FingerprintWebGLMetadata;
  canvas: FpMode;
  audio: FpMode;
  client_rects: FpMode;
  fonts: FingerprintFonts;
  hardware_concurrency: number;
  device_memory: number;
  do_not_track: boolean;
  flash: boolean;
  media_devices: FpMode;
  speech_voices: FpMode;
  /** AdsPower fingerprint protocol version */
  fpVersion: number;
}
