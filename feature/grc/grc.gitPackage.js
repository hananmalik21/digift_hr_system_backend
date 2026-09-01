/**
 * GitHub GRC package adapter.
 *
 * `/api/grc/*` is served by npm package `digify-hr-grc-backend`.
 */
import { createGrcRouter, initGrcPackage, closeGrcPackage } from 'digify-hr-grc-backend';

export const GRC_GIT_PACKAGE_MOUNT = '/api/grc';

export function mountGrcGitPackage(app) {
  if (app == null || typeof app.use !== 'function') {
    throw new Error('mountGrcGitPackage requires an Express app');
  }
  app.use(GRC_GIT_PACKAGE_MOUNT, createGrcRouter());
}

export { initGrcPackage, closeGrcPackage };
