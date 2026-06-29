import {join} from 'path';
import {ProxyDB} from '../db/proxy';
import {WindowDB} from '../db/window';
// import {getChromePath} from './device';
import {BrowserWindow} from 'electron';
import puppeteer from 'puppeteer';
import {execSync, spawn} from 'child_process';
import * as portscanner from 'portscanner';
import {sleep} from '../utils/sleep';
import SocksServer from '../proxy-server/socks-server';
import type {DB} from '../../../shared/types/db';
import {type IncomingMessage, type Server, type ServerResponse} from 'http';
import {createLogger} from '../../../shared/utils/logger';
import {WINDOW_LOGGER_LABEL} from '../constants';
import {getProxyInfo} from './prepare';
import {generateFingerprint, buildExtendedParameters} from './generator';
import type {Fingerprint} from '../../../shared/types/fingerprint';
import * as ProxyChain from 'proxy-chain';
import {getSettings} from '../utils/get-settings';
// import {randomFingerprint} from '../services/window-service';
import {bridgeMessageToUI, getMainWindow} from '../mainWindow';
import {Mutex} from 'async-mutex';
// import {presetCookie} from '../puppeteer/helpers';
import {existsSync, mkdirSync} from 'fs';
import api from '../../../shared/api/api';
import {ExtensionDB} from '../db/extension';

const mutex = new Mutex();

const logger = createLogger(WINDOW_LOGGER_LABEL);

const HOST = '127.0.0.1';

// async function connectBrowser(
//   port: number,
//   ipInfo: IP,
//   windowId: number,
//   openStartPage: boolean = true,
// ) {
//   // const windowData = await WindowDB.getById(windowId);
//   const settings = getSettings();
//   const browserURL = `http://${HOST}:${port}`;
//   const {data} = await api.get(browserURL + '/json/version');
//   if (data.webSocketDebuggerUrl) {
//     const browser = await puppeteer.connect({
//       browserWSEndpoint: data.webSocketDebuggerUrl,
//       defaultViewport: null,
//     });

//     // if (!windowData.opened_at) {
//     //   await presetCookie(windowId, browser);
//     // }
//     await WindowDB.update(windowId, {
//       status: 2,
//       port: port,
//       opened_at: db.fn.now() as unknown as string,
//     });

//     browser.on('targetcreated', async target => {
//       const newPage = await target.page();
//       if (newPage) {
//         await newPage.waitForNavigation({waitUntil: 'networkidle0'});
//         if (!settings.useLocalChrome) {
//           await modifyPageInfo(windowId, newPage, ipInfo);
//         }
//       }
//     });
//     const pages = await browser.pages();
//     const page =
//       pages.length &&
//       (pages?.[0]?.url() === 'about:blank' ||
//         !pages?.[0]?.url() ||
//         pages?.[0]?.url() === 'chrome://new-tab-page/')
//         ? pages?.[0]
//         : await browser.newPage();
//     try {
//       if (!settings.useLocalChrome) {
//         await modifyPageInfo(windowId, page, ipInfo);
//       }
//       if (getClientPort() && openStartPage) {
//         await page.goto(
//           `http://localhost:${getClientPort()}/#/start?windowId=${windowId}&serverPort=${getPort()}`,
//         );
//       }
//     } catch (error) {
//       logger.error(error);
//     }
//     return data;
//   }
// }

const getDriverPath = (windowData?: DB.Window) => {
  const settings = getSettings();

  //If the window fills in the local Chrome path, it is automatically used
  if (windowData?.localChromePath) {
    return windowData.localChromePath;
  }

  //If the window fills in the chromium path
  if (windowData?.chromiumBinPath) {
    return windowData.chromiumBinPath;
  }

  //Otherwise use global settings
  if (settings.useLocalChrome) {
    return settings.localChromePath;
  } else {
    return settings.chromiumBinPath;
  }
};

const getAvailablePort = async () => {
  for (let attempts = 0; attempts < 10; attempts++) {
    try {
      const port = await portscanner.findAPortNotInUse(9222, 40222);
      return port; //Return after successful binding
    } catch (error) {
      console.log('Port already in use, retrying...');
    }
  }
  throw new Error('Failed to find a free port after multiple attempts');
};

const waitForChromeReady = async (chromePort: number, id: number, maxAttempts = 30) => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      //Try to connect to CDP
      const response = await api.get(`http://${HOST}:${chromePort}/json/version`, {
        timeout: 1000,
      });
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      logger.error('连接失败', (error as Error).message);
      //Connection failed, keep waiting
    }

    attempts++;
    await sleep(0.5);
  }

  throw new Error('Chrome instance failed to start within the timeout period');
};

export async function openFingerprintWindow(id: number, headless = false) {
  const release = await mutex.acquire();
  try {
    const windowData = await WindowDB.getById(id);

    //Check if the window is already open
    if (windowData.status === 2 && windowData.port) {
      logger.info(`Window ${id} is already running on port ${windowData.port}`);
      try {
        const browserURL = `http://${HOST}:${windowData.port}`;
        const {data} = await api.get(browserURL + '/json/version');

        //If the browser information can be successfully obtained, the window is still available.
        if (data) {
          logger.info(`Window ${id} is already running on port ${windowData.port}`);
          //Get the browser instance and bring the window to the front
          const browser = await puppeteer.connect({
            browserWSEndpoint: data.webSocketDebuggerUrl,
            defaultViewport: null,
          });
          const pages = await browser.pages();
          if (pages.length > 0) {
            await pages[0].bringToFront();
            //Cancel connection
            await browser.disconnect();
          }
          return {
            ...data,
          };
        }
      } catch (error) {
        //If the acquisition fails, it means that although the window is marked open, it is actually closed.
        logger.warn(`Window ${id} marked as running but not accessible, will reopen`);
        await WindowDB.update(id, {
          ...windowData,
          status: 1,
          port: null,
          pid: null,
        });
      }
    }

    const extensionData = await ExtensionDB.getExtensionsByWindowId(id);
    const proxyData = await ProxyDB.getById(windowData.proxy_id);
    const proxyType = proxyData?.proxy_type?.toLowerCase();
    const settings = getSettings();

    const cachePath = settings.profileCachePath;

    const win = BrowserWindow.getAllWindows()[0];
    //Prefer window-level Chrome settings, otherwise use global settings
    //If the window has localChromePath filled in, use local Chrome mode
    const useLocalChrome = windowData?.localChromePath
      ? true
      : (windowData.useLocalChrome ?? settings.useLocalChrome);
    const windowDataDir = join(
      cachePath,
      windowData?.localChromePath ? 'chrome' : useLocalChrome ? 'chrome' : 'chromium',
      windowData.profile_id,
    );
    logger.info(
      `Opening window with profile_id: ${windowData.profile_id}, userDataDir: ${windowDataDir}`,
    );

    //Make sure the directory exists and has the correct permissions set
    if (!existsSync(windowDataDir)) {
      try {
        mkdirSync(windowDataDir, {recursive: true, mode: 0o755});
      } catch (error) {
        logger.error(`Failed to create directory: ${error}`);
        return null;
      }
    }

    //Make sure the directory has the correct permissions
    const isMac = process.platform === 'darwin';
    if (isMac) {
      try {
        execSync(`chmod -R 755 "${windowDataDir}"`);
      } catch (error) {
        logger.error(`Failed to set permissions: ${error}`);
        return null;
      }
    }

    const driverPath = getDriverPath(windowData);
    let ipInfo = {timeZone: '', ip: '', ll: [], country: ''};
    if (windowData.proxy_id && proxyData.ip) {
      ipInfo = await getProxyInfo(proxyData);
      if (!ipInfo?.ip) {
        logger.error('ipInfo is empty');
      }
    }

    //Resolve fingerprint: parse the persisted JSON, or generate-and-persist on
    //first open (backward-compat for profiles created before the fingerprint
    //engine landed). The seed is the profile_id so re-generation is stable.
    let fingerprint: Fingerprint | undefined;
    if (!useLocalChrome) {
      const raw = windowData.fingerprint;
      let parsed: Fingerprint | undefined;
      if (raw && raw !== '{}') {
        try {
          parsed = JSON.parse(raw) as Fingerprint;
        } catch (error) {
          logger.warn(`Window ${id} has invalid fingerprint JSON, regenerating: ${error}`);
        }
      }
      if (parsed && parsed.fpVersion) {
        fingerprint = parsed;
      } else {
        fingerprint = generateFingerprint(windowData.profile_id);
        await WindowDB.update(id, {
          ...windowData,
          ua: fingerprint.ua,
          fingerprint: JSON.stringify(fingerprint),
        });
        logger.info(`Window ${id} fingerprint generated and persisted`);
      }
    }

    if (driverPath) {
      const chromePort = await getAvailablePort();
      let finalProxy;
      let proxyServer: Server<typeof IncomingMessage, typeof ServerResponse> | ProxyChain.Server;
      if (proxyData && proxyType === 'socks5' && proxyData.proxy) {
        const proxyInstance = await createSocksProxy(proxyData);
        finalProxy = proxyInstance.proxyUrl;
        proxyServer = proxyInstance.proxyServer;
      } else if (proxyData && proxyType === 'http' && proxyData.proxy) {
        const proxyInstance = await createHttpProxy(proxyData);
        finalProxy = proxyInstance.proxyUrl;
        proxyServer = proxyInstance.proxyServer;
      }

      const isMac = process.platform === 'darwin';
      const launchParamter = useLocalChrome
        ? [
            `--remote-debugging-port=${chromePort}`,
            `--user-data-dir=${windowDataDir}`,
            '--no-first-run',
          ]
        : [
            //Mac specific parameters
            ...(isMac ? ['--args'] : []),

            ...(fingerprint
              ? [`--extended-parameters=${buildExtendedParameters(fingerprint)}`]
              : []),
            '--force-color-profile=srgb',
            '--no-first-run',
            '--no-default-browser-check',
            '--metrics-recording-only',
            '--disable-background-mode',
            `--remote-debugging-port=${chromePort}`,
            `--user-data-dir=${windowDataDir}`,
            ...(fingerprint?.ua ? [`--user-agent=${fingerprint.ua}`] : []),
            '--unhandled-rejections=strict',

            //Mac-specific security parameters
            ...(isMac ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
          ];

      if (finalProxy) {
        launchParamter.push(`--proxy-server=${finalProxy}`);
      }
      if (ipInfo?.timeZone && !settings.useLocalChrome) {
        launchParamter.push(`--timezone=${ipInfo.timeZone}`);
        launchParamter.push(`--tz=${ipInfo.timeZone}`);
      }
      if (extensionData.length > 0) {
        launchParamter.push(`--load-extension=${extensionData.map(e => e.path).join(',')}`);
      }
      if (headless) {
        launchParamter.push('--headless=new'); //Use the new headless mode
        if (!isMac) {
          launchParamter.push('--disable-gpu'); //This parameter is not required on Mac
        }
      } else {
        launchParamter.push('--new-window');
      }

      //Add user-defined startup parameters
      if (settings.chromeLaunchArgs) {
        const customArgs = settings.chromeLaunchArgs
          .split('\n')
          .map(arg => arg.trim())
          .filter(arg => arg.length > 0 && !arg.startsWith('#'));
        launchParamter.push(...customArgs);
        logger.info(`Added ${customArgs.length} custom launch args`);
      }

      //Add debugging parameters (if needed)
      if (process.env.NODE_ENV === 'development') {
        // launchParamter.push(
        //   '--enable-logging',
        //   '--v=1',
        //   '--enable-blink-features=IdleDetection',
        // );
      }
      // const iconPath = await generateChromeIcon(windowDataDir, id);

      let chromeInstance;
      try {
        // if (isMac) {
        //   chromeInstance = spawn(driverPath, launchParamter);
        // } else {
        //   try {
        //     const shortcutPath = path.join(windowDataDir, `chrome-${windowData.id}.lnk`);
        //     await createShortcutWithIcon(driverPath, launchParamter, iconPath, shortcutPath);
        //     console.log('shortcutPath', shortcutPath);
        //     console.log('driverPath', driverPath);
        //     chromeInstance = spawn('cmd.exe', ['/c', 'start', '', shortcutPath]);
        //     console.log('chromeInstance', chromeInstance);
        //   } catch (error) {
        //     logger.error(error);
        //     chromeInstance = spawn(driverPath, launchParamter);
        //   }
        // }
        logger.info(`Launching Chrome: ${driverPath} ${launchParamter.join(' ')}`);
        chromeInstance = spawn(driverPath, launchParamter);
      } catch (error) {
        logger.error(error);
      }
      if (!chromeInstance) {
        return;
      }
      await sleep(1);
      win.webContents.send('window-opened', id);
      chromeInstance.stdout.on('data', _chunk => {
        // const str = _chunk.toString();
        // console.error('stderr: ', str);
      });
      //This place needs to monitor stderr, otherwise some websites will freeze.
      chromeInstance.stderr.on('data', _chunk => {
        // const str = _chunk.toString();
        // console.error('stderr: ', str);
      });

      chromeInstance.on('close', async () => {
        logger.info(`Chrome process exited at port ${chromePort}, closed time: ${new Date()}`);
        logger.info(`Chrome user-data-dir: ${windowDataDir}`);
        logger.info(`Chrome PID was: ${chromeInstance.pid}`);
        if (proxyType === 'socks5') {
          (proxyServer as Server<typeof IncomingMessage, typeof ServerResponse>)?.close(() => {
            logger.info('Socks5 Proxy server was closed.');
          });
        } else if (proxyType === 'http') {
          (proxyServer as ProxyChain.Server).close(true, () => {
            logger.info('Http Proxy server was closed.');
          });
        }
        await closeFingerprintWindow(id, false);
      });

      await waitForChromeReady(chromePort, id, 30);

      try {
        const browserURL = `http://${HOST}:${chromePort}`;
        const {data} = await api.get(browserURL + '/json/version');

        const now = new Date().toISOString();
        logger.info(`Updating window ${windowData.id} with opened_at: ${now}`);
        const updateResult = await WindowDB.update(windowData.id, {
          ...windowData,
          status: 2,
          pid: chromeInstance.pid,
          port: chromePort,
          opened_at: now,
        });
        if (!updateResult.success) {
          logger.error(`Failed to update window: ${updateResult.message}`);
        } else {
          logger.info(`Window ${windowData.id} opened_at updated successfully`);
        }
        return {
          ...data,
        };
      } catch (error) {
        logger.error('open window failed', error);

        //Check if process exists and terminate
        if (chromeInstance.pid) {
          try {
            if (process.platform === 'win32') {
              try {
                //Use chcp 65001 to set the console code page to UTF-8
                execSync('chcp 65001', {stdio: 'ignore'});

                //Check if the process exists
                execSync(`tasklist /FI "PID eq ${chromeInstance.pid}" /NH /FO CSV`, {
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'ignore'],
                });

                //The process exists, terminate it
                execSync(`taskkill /PID ${chromeInstance.pid} /F /T`, {
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'ignore'],
                });

                logger.info(`Successfully terminated process ${chromeInstance.pid}`);
              } catch (err) {
                if ((err as {status: number}).status === 128) {
                  logger.info(`Process ${chromeInstance.pid} does not exist`);
                } else {
                  throw err;
                }
              }
            } else {
              //Handling of Unix systems remains unchanged
              try {
                process.kill(chromeInstance.pid, 0);
                execSync(`kill -9 ${chromeInstance.pid}`);
              } catch (err) {
                logger.info(`Process ${chromeInstance.pid} does not exist`);
              }
            }
          } catch (killError) {
            logger.error(`Failed to kill process ${chromeInstance.pid}:`, killError);
          }
        }
        await closeFingerprintWindow(id, true);
        return null;
      }
    } else {
      bridgeMessageToUI({
        type: 'error',
        text: 'Driver path is empty',
      });
      logger.error('Driver path is empty');
      return null;
    }
  } finally {
    release();
  }
}

async function createHttpProxy(proxyData: DB.Proxy) {
  const listenPort = await portscanner.findAPortNotInUse(30000, 40000);
  const [httpHost, httpPort, username, password] = proxyData.proxy!.split(':');

  const oldProxyUrl = `http://${username}:${password}@${httpHost}:${httpPort}`;
  const newProxyUrl = await ProxyChain.anonymizeProxy({
    url: oldProxyUrl,
    port: listenPort,
  });
  const proxyServer = new ProxyChain.Server({
    port: listenPort,
  });

  return {
    proxyServer,
    proxyUrl: newProxyUrl,
  };
}

async function createSocksProxy(proxyData: DB.Proxy) {
  const listenHost = HOST;
  const listenPort = await portscanner.findAPortNotInUse(30000, 40000);
  const [socksHost, socksPort, socksUsername, socksPassword] = proxyData.proxy!.split(':');

  const proxyServer = SocksServer({
    listenHost,
    listenPort,
    socksHost,
    socksPort: +socksPort,
    socksUsername,
    socksPassword,
  });

  //Add more error handling
  proxyServer.on('error', err => {
    logger.error('Socks server error:', err);
  });

  proxyServer.on('connect:error', err => {
    logger.error('Socks connect error:', err);
  });

  proxyServer.on('request:error', err => {
    logger.error('Socks request error:', err);
  });

  //Add connection close handling
  proxyServer.on('close', () => {
    logger.info('Socks server closed');
  });

  return {
    proxyServer,
    proxyUrl: `http://${listenHost}:${listenPort}`,
  };
}

export async function resetWindowStatus(id: number) {
  const window = await WindowDB.getById(id);
  await WindowDB.update(id, {...window, status: 1, port: null, pid: null});
}

export async function closeFingerprintWindow(id: number, force = false) {
  const window = await WindowDB.getById(id);
  const port = window.port;
  if (force && port) {
    try {
      const browserURL = `http://${HOST}:${port}`;
      const {data} = await api.get(browserURL + '/json/version');
      const browser = await puppeteer.connect({
        browserWSEndpoint: data.webSocketDebuggerUrl,
        defaultViewport: null,
      });
      logger.info('close browser', browserURL);
      await browser?.close();
    } catch (error) {
      logger.error(error);
    }
  }
  await WindowDB.update(id, {...window, status: 1, port: null, pid: null});
  const win = getMainWindow();
  if (win) {
    win.webContents.send('window-closed', id);
  }
}

/**
* Focus and bring the specified window to the front
 */
export async function focusFingerprintWindow(id: number) {
  const windowData = await WindowDB.getById(id);

  if (!windowData || windowData.status !== 2 || !windowData.port) {
    logger.warn(`Window ${id} is not running, cannot focus`);
    return {success: false, message: 'Window is not running'};
  }

  try {
    const browserURL = `http://${HOST}:${windowData.port}`;
    const {data} = await api.get(browserURL + '/json/version');

    if (data) {
      const browser = await puppeteer.connect({
        browserWSEndpoint: data.webSocketDebuggerUrl,
        defaultViewport: null,
      });
      const pages = await browser.pages();
      if (pages.length > 0) {
        const page = pages[0];

        //First use bringToFront to basically stick to the top
        await page.bringToFront();

        //Try using CDP to minimize and restore (more forced to stay on top)
        try {
          const client = await page.createCDPSession();
          const {windowId} = await client.send('Browser.getWindowForTarget', {
            targetId: (page.target() as {_targetId: string})._targetId,
          });

          //Minimize first and then restore
          await client.send('Browser.setWindowBounds', {
            windowId,
            bounds: {windowState: 'minimized'},
          });
          await new Promise(resolve => setTimeout(resolve, 100));
          await client.send('Browser.setWindowBounds', {
            windowId,
            bounds: {windowState: 'normal'},
          });

          await client.detach();
        } catch (cdpError) {
          //CDP failure is not affected, continue to use bringToFront
          logger.warn(`CDP focus failed, using basic bringToFront: ${cdpError}`);
        }

        logger.info(`Window ${id} focused and brought to top`);
      }
      await browser.disconnect();
      return {success: true};
    }
  } catch (error) {
    logger.error(`Failed to focus window ${id}:`, error);
    return {success: false, message: String(error)};
  }

  return {success: false, message: 'Window not accessible'};
}

export default {
  openFingerprintWindow,

  closeFingerprintWindow,

  focusFingerprintWindow,
};
