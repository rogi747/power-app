/* eslint-disable */
// @ts-nocheck

import puppeteer from 'puppeteer';
import {openProfile} from './demo/profiles.js';
export async function createBrowser(wsEndpoint) {
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: null,
  });
  return browser;
}

//Helper function: random wait time
async function randomWait(min, max) {
  const waitTime = Math.floor(Math.random() * (max - min + 1) + min);
  await new Promise(resolve => setTimeout(resolve, waitTime));
}

//Main automation script functions
export async function autoScript(browser) {
  try {
  } catch (error) {
    console.error('自动化脚本执行出错:', error);
  }
}

(async () => {
  const openResult = await openProfile(77);
  console.log(openResult);
  const browser = await createBrowser(openResult.browser.webSocketDebuggerUrl);
  await autoScript(browser);
  // await browser.close(); // Only if you want to close the external Chrome instance.
})();
