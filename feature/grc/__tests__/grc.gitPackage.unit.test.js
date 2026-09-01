import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { GRC_GIT_PACKAGE_MOUNT, mountGrcGitPackage } from '../grc.gitPackage.js';

test('GRC git package mounts at /api/grc without throwing', () => {
  assert.equal(GRC_GIT_PACKAGE_MOUNT, '/api/grc');
  const app = express();
  assert.doesNotThrow(() => mountGrcGitPackage(app));
});

test('mountGrcGitPackage rejects a missing app', () => {
  assert.throws(() => mountGrcGitPackage(null), /Express app/);
});
