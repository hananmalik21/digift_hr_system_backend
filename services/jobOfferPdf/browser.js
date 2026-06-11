import puppeteer from 'puppeteer';
import { LOG_TAG, PDF_OPTIONS, PUPPETEER_LAUNCH_ARGS, SET_CONTENT_OPTIONS } from './constants.js';
import { OfferPdfGenerationError } from './errors.js';

/** @type {import('puppeteer').Browser | null} */
let browserInstance = null;

/** @type {Promise<import('puppeteer').Browser> | null} */
let browserLaunchPromise = null;

function resolveChromeExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  if (process.platform === 'linux') {
    return '/usr/bin/google-chrome';
  }
  return undefined;
}

function buildLaunchOptions() {
  const launchOptions = {
    headless: true,
    args: PUPPETEER_LAUNCH_ARGS
  };
  const executablePath = resolveChromeExecutablePath();
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  return launchOptions;
}

/**
 * @param {import('puppeteer').Browser} browser
 */
function attachBrowserLifecycleHandlers(browser) {
  browser.on('disconnected', () => {
    browserInstance = null;
    browserLaunchPromise = null;
  });
}

async function launchBrowser() {
  const browser = await puppeteer.launch(buildLaunchOptions());
  attachBrowserLifecycleHandlers(browser);
  return browser;
}

/**
 * Reuse a single headless browser across PDF requests.
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function getPdfBrowser() {
  if (browserInstance?.isConnected()) {
    return browserInstance;
  }

  if (!browserLaunchPromise) {
    browserLaunchPromise = launchBrowser()
      .then((browser) => {
        browserInstance = browser;
        return browser;
      })
      .catch((err) => {
        browserLaunchPromise = null;
        throw err;
      });
  }

  return browserLaunchPromise;
}

export function shouldPrewarmPdfBrowser() {
  return process.env.JOB_OFFER_PDF_PREWARM !== 'false';
}

export async function prewarmPdfBrowser() {
  if (!shouldPrewarmPdfBrowser()) return;

  try {
    await getPdfBrowser();
    console.info(`[${LOG_TAG}] Puppeteer browser prewarmed`);
  } catch (err) {
    console.warn(`[${LOG_TAG}] Browser prewarm skipped:`, err?.message || err);
  }
}

export async function closePdfBrowser() {
  browserLaunchPromise = null;
  if (!browserInstance) return;

  try {
    await browserInstance.close();
  } catch (_) {
    // Browser may already be closed after a crash/disconnect.
  } finally {
    browserInstance = null;
  }
}

/**
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
export async function renderHtmlToPdf(html) {
  /** @type {import('puppeteer').Page | undefined} */
  let page;

  try {
    const browser = await getPdfBrowser();
    page = await browser.newPage();

    await page.setJavaScriptEnabled(false);
    await page.setContent(html, SET_CONTENT_OPTIONS);
    const pdf = await page.pdf(PDF_OPTIONS);
    return Buffer.from(pdf);
  } catch (err) {
    console.error(`[${LOG_TAG}] renderHtmlToPdf error:`, err);
    throw new OfferPdfGenerationError(err);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_) {}
    }
  }
}
