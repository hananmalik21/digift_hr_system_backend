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

test('default Security hook is kept unless an explicit function is passed', async () => {
  const { resolveOnEnterpriseProvisioned } = await import('../enterprise.gitPackage.js');
  const { provisionEnterpriseAdminOnEnterpriseCreate } = await import('../../security/security.facade.js');
  const custom = async () => ({ ok: true });

  assert.equal(resolveOnEnterpriseProvisioned(), provisionEnterpriseAdminOnEnterpriseCreate);
  assert.equal(resolveOnEnterpriseProvisioned({}), provisionEnterpriseAdminOnEnterpriseCreate);
  assert.equal(
    resolveOnEnterpriseProvisioned({ onEnterpriseProvisioned: undefined }),
    provisionEnterpriseAdminOnEnterpriseCreate
  );
  assert.equal(
    resolveOnEnterpriseProvisioned({ onEnterpriseProvisioned: null }),
    provisionEnterpriseAdminOnEnterpriseCreate
  );
  assert.equal(
    resolveOnEnterpriseProvisioned({ onEnterpriseProvisioned: custom }),
    custom
  );
});
