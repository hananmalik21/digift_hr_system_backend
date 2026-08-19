import fs from 'fs';
import puppeteer from 'puppeteer';
import { LOG_TAG, PDF_OPTIONS, PUPPETEER_LAUNCH_ARGS } from './constants.js';
import { ensureChromeAvailable, findInstalledChromePath } from './ensureChrome.js';
import { OfferPdfGenerationError } from './errors.js';

/** @type {import('puppeteer').Browser | null} */
let sharedBrowser = null;

/** @type {Promise<import('puppeteer').Browser> | null} */
let browserLaunchPromise = null;

/**
 * Resolve Chrome path for Render/Linux without hardcoded local paths.
 * @returns {string|undefined}
 */
export function resolveChromeExecutablePath() {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv) {
    if (fs.existsSync(fromEnv)) {
      return fromEnv;
    }
    console.warn(`[${LOG_TAG}] PUPPETEER_EXECUTABLE_PATH not found: ${fromEnv}`);
  }

  const installed = findInstalledChromePath();
  if (installed) {
    return installed;
  }

  try {
    const bundled = puppeteer.executablePath();
    if (bundled && fs.existsSync(bundled)) {
      return bundled;
    }
    console.warn(`[${LOG_TAG}] Puppeteer executablePath file not found: ${bundled}`);
  } catch (err) {
    console.warn(`[${LOG_TAG}] Puppeteer executablePath failed:`, err?.message || err);
  }

  return undefined;
}

/**
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function launchPuppeteerBrowser() {
  await ensureChromeAvailable();

  const launchOptions = {
    headless: true,
    args: PUPPETEER_LAUNCH_ARGS
  };

  const executablePath = resolveChromeExecutablePath();
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  try {
    const browser = await puppeteer.launch(launchOptions);
    console.info(`[${LOG_TAG}] Browser launched`);
    return browser;
  } catch (err) {
    if (!launchOptions.executablePath) {
      console.error(`[${LOG_TAG}] Browser launch failed`, err?.message || err);
      throw err;
    }

    console.warn(
      `[${LOG_TAG}] Browser launch failed with executablePath, retrying without it:`,
      err?.message || err
    );

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: PUPPETEER_LAUNCH_ARGS
      });
      console.info(`[${LOG_TAG}] Browser launched`);
      return browser;
    } catch (retryErr) {
      console.error(`[${LOG_TAG}] Browser launch failed`, retryErr?.message || retryErr);
      throw retryErr;
    }
  }
}

/**
 * Reuse one browser process across PDF requests (avoids launch storms under load).
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function getPuppeteerBrowser() {
  if (sharedBrowser?.connected) {
    return sharedBrowser;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = launchPuppeteerBrowser()
    .then((browser) => {
      sharedBrowser = browser;
      browser.on('disconnected', () => {
        sharedBrowser = null;
        browserLaunchPromise = null;
      });
      return browser;
    })
    .finally(() => {
      browserLaunchPromise = null;
    });

  return browserLaunchPromise;
}

/**
 * Launch Chrome once at startup to verify Render/Linux compatibility.
 * Does not block server boot on failure.
 */
export async function prewarmJobOfferPdfBrowser() {
  if (process.env.JOB_OFFER_PDF_PREWARM === 'false') {
    return;
  }

  console.info(`[${LOG_TAG}] PUPPETEER_CACHE_DIR=${process.env.PUPPETEER_CACHE_DIR || '(default)'}`);

  try {
    await getPuppeteerBrowser();
    const chromePath = resolveChromeExecutablePath();
    console.info(`[${LOG_TAG}] Puppeteer browser prewarmed${chromePath ? ` (${chromePath})` : ''}`);
  } catch (err) {
    console.error(`[${LOG_TAG}] Browser prewarm failed:`, err?.message || err);
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
    const browser = await getPuppeteerBrowser();
    page = await browser.newPage();

    // Inline HTML only — no external assets; networkidle0 can hang indefinitely.
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    await page.emulateMediaType('print');

    const pdf = await page.pdf(PDF_OPTIONS);
    return Buffer.from(pdf);
  } catch (err) {
    console.error(`[${LOG_TAG}] renderHtmlToPdf error:`, err?.message || err);
    throw new OfferPdfGenerationError(err);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (closePageErr) {
        console.warn(`[${LOG_TAG}] Failed to close page:`, closePageErr?.message || closePageErr);
      }
    }
  }
}
