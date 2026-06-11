import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import puppeteer from 'puppeteer';
import { LOG_TAG } from './constants.js';

const execFileAsync = promisify(execFile);

/** @type {Promise<void> | null} */
let installPromise = null;

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/**
 * @param {string} candidate
 */
function chromeBinaryExists(candidate) {
  return Boolean(candidate) && fs.existsSync(candidate);
}

/**
 * @returns {string|undefined}
 */
export function findInstalledChromePath() {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (chromeBinaryExists(fromEnv)) {
    return fromEnv;
  }

  try {
    const bundled = puppeteer.executablePath();
    if (chromeBinaryExists(bundled)) {
      return bundled;
    }
  } catch (_) {
    // Puppeteer may not have a downloaded browser yet.
  }

  return undefined;
}

/**
 * Remove a corrupt Puppeteer cache entry (folder exists but binary missing).
 */
function removeBrokenChromeCache() {
  try {
    const expected = puppeteer.executablePath();
    if (expected && !fs.existsSync(expected)) {
      const cacheRoot = path.dirname(path.dirname(path.dirname(expected)));
      if (fs.existsSync(cacheRoot) && cacheRoot.includes('puppeteer')) {
        console.warn(`[${LOG_TAG}] Removing broken Chrome cache: ${cacheRoot}`);
        fs.rmSync(cacheRoot, { recursive: true, force: true });
      }
    }
  } catch (_) {
    // Ignore — install will surface any real failure.
  }
}

async function runChromeInstall() {
  removeBrokenChromeCache();
  console.info(`[${LOG_TAG}] Chrome not found — installing via puppeteer browsers install chrome`);
  await execFileAsync('npx', ['puppeteer', 'browsers', 'install', 'chrome'], {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  console.info(`[${LOG_TAG}] Puppeteer Chrome install completed`);
}

/**
 * Ensure Puppeteer-managed Chrome exists before launch (local dev + Render build fallback).
 */
export async function ensureChromeAvailable() {
  if (findInstalledChromePath()) {
    return;
  }

  if (!installPromise) {
    installPromise = runChromeInstall().catch((err) => {
      installPromise = null;
      throw err;
    });
  }

  await installPromise;

  if (!findInstalledChromePath()) {
    throw new Error(
      'Chrome install finished but executable is still missing. Run: npx puppeteer browsers install chrome'
    );
  }
}
