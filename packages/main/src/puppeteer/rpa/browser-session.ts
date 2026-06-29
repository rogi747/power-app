import puppeteer, {type Browser, type Page} from 'puppeteer';
import {WindowDB} from '../../db/window';
import {openFingerprintWindow} from '../../fingerprint';
import api from '../../../../shared/api/api';

/**
 * Browser session helper for the RPA engine.
 *
 * CRITICAL: this does NOT create a second browser manager. It reuses the
 * project's existing launch path (openFingerprintWindow), which spawns Chrome
 * with --remote-debugging-port and records the port on the window row. We then
 * attach Puppeteer over CDP to that already-running profile, inheriting its
 * proxy, fingerprint, cookies and user-data-dir for free.
 */

const HOST = '127.0.0.1';

export interface RpaSession {
  browser: Browser;
  page: Page;
  windowId: number;
  /** True when this session attached to a profile the engine itself opened. */
  openedHere: boolean;
}

/** Connect Puppeteer to the CDP endpoint of a running profile. */
const connectByPort = async (port: number): Promise<Browser> => {
  const browserURL = `http://${HOST}:${port}`;
  const {data} = await api.get(browserURL + '/json/version');
  if (!data?.webSocketDebuggerUrl) {
    throw new Error(`No CDP websocket found on port ${port}`);
  }
  return await puppeteer.connect({
    browserWSEndpoint: data.webSocketDebuggerUrl,
    defaultViewport: null,
  });
};

/**
 * Acquire a driveable Page for the given profile/window. Opens the profile via
 * the existing lifecycle if it is not already running.
 */
export const acquireSession = async (windowId: number): Promise<RpaSession> => {
  let windowData = await WindowDB.getById(windowId);
  if (!windowData) {
    throw new Error(`Window ${windowId} not found`);
  }

  let openedHere = false;
  // status 2 === running and we have a CDP port to attach to.
  if (windowData.status !== 2 || !windowData.port) {
    await openFingerprintWindow(windowId);
    openedHere = true;
    windowData = await WindowDB.getById(windowId);
  }

  if (!windowData?.port) {
    throw new Error(`Window ${windowId} did not expose a debugging port`);
  }

  const browser = await connectByPort(windowData.port);
  const pages = await browser.pages();
  const blank = pages.find(p => {
    const url = p.url();
    return !url || url === 'about:blank' || url === 'chrome://new-tab-page/';
  });
  const page = blank ?? pages[0] ?? (await browser.newPage());

  return {browser, page, windowId, openedHere};
};

/** Detach from the browser without killing it (the profile stays open). */
export const releaseSession = async (session: RpaSession): Promise<void> => {
  try {
    await session.browser.disconnect();
  } catch {
    // best-effort; a closed browser is already "released".
  }
};
