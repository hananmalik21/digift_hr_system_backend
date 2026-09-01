import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  mountEnterprisePackage,
  mountEnterpriseCatchAllRoutes
} from '../enterprise.gitPackage.js';

test('Enterprise git package mounts prefix-safe routes without throwing', () => {
  const app = express();
  assert.doesNotThrow(() => mountEnterprisePackage(app));
});

test('Enterprise catch-all mounts without throwing', () => {
  const app = express();
  assert.doesNotThrow(() => mountEnterpriseCatchAllRoutes(app));
});

test('mount functions reject a missing app', () => {
  assert.throws(() => mountEnterprisePackage(null), /Express app/);
  assert.throws(() => mountEnterpriseCatchAllRoutes(null), /Express app/);
});
