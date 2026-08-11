import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TENANT_SLUG_RE,
  extractTenantFromHostname,
  getEffectiveHostname,
  normalizeHostname
} from '../../../../utils/tenantHostname.js';
import {
  getHostnameEnterpriseId,
  resolveRequestEnterpriseId
} from '../../../../utils/requestEnterprise.js';
import { AppError } from '../../../../utils/errors/index.js';

const DOMAINS = {
  mainAppBaseDomain: 'app.digifyhr.com',
  careerPortalBaseDomain: 'careers.digifyhr.com',
  portalType: 'MAIN',
  devEnterpriseSlug: null
};

test('normalizeHostname lowercases, strips port and trailing dot', () => {
  assert.equal(normalizeHostname('ABC-Trading.App.DigifyHR.com:443.'), 'abc-trading.app.digifyhr.com');
});

test('normalizeHostname uses first X-Forwarded-Host value', () => {
  assert.equal(
    normalizeHostname('abc-trading.app.digifyhr.com, proxy.internal'),
    'abc-trading.app.digifyhr.com'
  );
});

test('valid main hostname extracts tenant slug', () => {
  const r = extractTenantFromHostname('abc-trading.app.digifyhr.com', DOMAINS);
  assert.equal(r.kind, 'tenant');
  assert.equal(r.subdomainSlug, 'abc-trading');
  assert.equal(r.inferredPortalType, 'MAIN');
});

test('valid career hostname extracts tenant slug', () => {
  const r = extractTenantFromHostname('abc-trading.careers.digifyhr.com', DOMAINS);
  assert.equal(r.kind, 'tenant');
  assert.equal(r.subdomainSlug, 'abc-trading');
  assert.equal(r.inferredPortalType, 'CAREER');
});

test('uppercase hostname normalizes', () => {
  const r = extractTenantFromHostname('ABC-TRADING.APP.DIGIFYHR.COM', DOMAINS);
  assert.equal(r.kind, 'tenant');
  assert.equal(r.subdomainSlug, 'abc-trading');
});

test('hostname with port in local-style host still extracts when domain matches', () => {
  const r = extractTenantFromHostname('abc-trading.app.digifyhr.com:3000', DOMAINS);
  assert.equal(r.kind, 'tenant');
  assert.equal(r.subdomainSlug, 'abc-trading');
});

test('base main hostname has no tenant slug', () => {
  const r = extractTenantFromHostname('app.digifyhr.com', DOMAINS);
  assert.equal(r.kind, 'base');
  assert.equal(r.subdomainSlug, null);
});

test('base career hostname has no tenant slug', () => {
  const r = extractTenantFromHostname('careers.digifyhr.com', DOMAINS);
  assert.equal(r.kind, 'base');
  assert.equal(r.subdomainSlug, null);
});

test('does not treat app or careers as tenant slug', () => {
  assert.equal(extractTenantFromHostname('app.digifyhr.com', DOMAINS).subdomainSlug, null);
  assert.equal(extractTenantFromHostname('careers.digifyhr.com', DOMAINS).subdomainSlug, null);
});

test('invalid tenant characters rejected', () => {
  const r = extractTenantFromHostname('ABC_Trading.app.digifyhr.com', DOMAINS);
  assert.equal(r.kind, 'invalid');
});

test('nested subdomain rejected', () => {
  const r = extractTenantFromHostname('a.b.app.digifyhr.com', DOMAINS);
  assert.equal(r.kind, 'invalid');
});

test('TENANT_SLUG_RE accepts valid labels', () => {
  assert.equal(TENANT_SLUG_RE.test('abc-trading'), true);
  assert.equal(TENANT_SLUG_RE.test('a'), true);
  assert.equal(TENANT_SLUG_RE.test('-abc'), false);
  assert.equal(TENANT_SLUG_RE.test('abc-'), false);
});

test('getEffectiveHostname ignores X-Forwarded-Host when trust proxy disabled', () => {
  const req = {
    hostname: 'app.digifyhr.com',
    headers: {
      host: 'app.digifyhr.com',
      'x-forwarded-host': 'evil.app.digifyhr.com'
    }
  };
  assert.equal(getEffectiveHostname(req, { trustProxy: false }), 'app.digifyhr.com');
});

test('getEffectiveHostname uses X-Forwarded-Host when trust proxy enabled', () => {
  const req = {
    hostname: 'app.digifyhr.com',
    headers: {
      host: 'app.digifyhr.com',
      'x-forwarded-host': 'abc-trading.app.digifyhr.com, other'
    }
  };
  assert.equal(getEffectiveHostname(req, { trustProxy: 1 }), 'abc-trading.app.digifyhr.com');
});

test('resolveRequestEnterpriseId prefers hostname over client', () => {
  const req = { enterprise: Object.freeze({ enterpriseId: 28 }) };
  assert.equal(
    resolveRequestEnterpriseId(req, { clientRaw: 28, required: true }),
    28
  );
});

test('resolveRequestEnterpriseId rejects conflicting client enterprise_id', () => {
  const req = { enterprise: Object.freeze({ enterpriseId: 28 }) };
  assert.throws(
    () => resolveRequestEnterpriseId(req, { clientRaw: 99, required: true }),
    (err) => err instanceof AppError && err.code === 'ENTERPRISE_CONTEXT_MISMATCH'
  );
});

test('resolveRequestEnterpriseId requires tenant when no host/jwt/client', () => {
  assert.throws(
    () => resolveRequestEnterpriseId({}, { required: true }),
    (err) => err instanceof AppError && err.code === 'TENANT_REQUIRED'
  );
});

test('getHostnameEnterpriseId reads frozen req.enterprise', () => {
  const req = { enterprise: Object.freeze({ enterpriseId: 28 }) };
  assert.equal(getHostnameEnterpriseId(req), 28);
});

test('JWT fallback used on base domain', () => {
  const req = { user: { enterprise_id: 12 } };
  assert.equal(resolveRequestEnterpriseId(req, { required: true }), 12);
});
