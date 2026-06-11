import puppeteer from 'puppeteer';
import { PDF_OPTIONS, PUPPETEER_LAUNCH_ARGS } from './constants.js';
import { OfferPdfGenerationError } from './errors.js';

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

/**
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
export async function renderHtmlToPdf(html) {
  /** @type {import('puppeteer').Browser | undefined} */
  let browser;
  /** @type {import('puppeteer').Page | undefined} */
  let page;

  try {
    const launchOptions = {
      headless: true,
      args: PUPPETEER_LAUNCH_ARGS
    };
    const executablePath = resolveChromeExecutablePath();
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    browser = await puppeteer.launch(launchOptions);
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf(PDF_OPTIONS);
    return Buffer.from(pdf);
  } catch (err) {
    console.error('[jobOfferPdf] renderHtmlToPdf error:', err);
    throw new OfferPdfGenerationError(err);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_) {}
    }
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
  }
}
