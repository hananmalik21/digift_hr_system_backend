import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../../../utils/errors/index.js';
import {
  clearEnterpriseResolveCache,
  shapeResolvedEnterprise,
  toPublicEnterpriseContext
} from '../service/resolveEnterpriseBySubdomain.js';

test('shapeResolvedEnterprise maps package payload', () => {
  const shaped = shapeResolvedEnterprise(
    {
      enterprise_id: 28,
      enterprise_code: 'ABC_TRADING',
      enterprise_name: 'ABC Trading Company',
      currency_code: 'KWD',
      subdomain_slug: 'abc-trading',
      is_active: 'Y',
      career_portal_enabled_flag: 'Y',
      main_application_url: 'https://abc-trading.app.digifyhr.com/#/login',
      career_portal_url: 'https://abc-trading.careers.digifyhr.com/',
      portal_type: 'MAIN'
    },
    'MAIN'
  );

  assert.equal(shaped.enterpriseId, 28);
  assert.equal(shaped.enterpriseCode, 'ABC_TRADING');
  assert.equal(shaped.currencyCode, 'KWD');
  assert.equal(shaped.subdomainSlug, 'abc-trading');
  assert.equal(shaped.portalType, 'MAIN');
  assert.equal(shaped.isActive, true);
  assert.equal(shaped.careerPortalEnabled, true);
});

test('toPublicEnterpriseContext maps resolved enterprise to API response', () => {
  const shaped = shapeResolvedEnterprise(
    {
      enterprise_id: 3,
      enterprise_code: 'DIGIFY_SOLUTIONS_LLC',
      enterprise_name: 'Digify Solutions LLC',
      currency_code: 'KWD',
      subdomain_slug: 'digify-solutions-llc',
      portal_type: 'MAIN'
    },
    'MAIN'
  );

  assert.deepEqual(toPublicEnterpriseContext(shaped), {
    enterprise_id: 3,
    enterprise_code: 'DIGIFY_SOLUTIONS_LLC',
    enterprise_name: 'Digify Solutions LLC',
    currency_code: 'KWD',
    subdomain_slug: 'digify-solutions-llc',
    portal_type: 'MAIN',
    main_application_url: null,
    career_portal_url: null
  });
});

test('shapeResolvedEnterprise returns null without enterprise_id', () => {
  assert.equal(shapeResolvedEnterprise({ enterprise_code: 'X' }, 'MAIN'), null);
});

test('clearEnterpriseResolveCache is safe', () => {
  clearEnterpriseResolveCache();
  assert.ok(true);
});

test('AppError tenant codes use expected HTTP statuses', () => {
  const notFound = new AppError('Enterprise not found or inactive.', 404, 'ENTERPRISE_NOT_FOUND');
  assert.equal(notFound.statusCode, 404);
  const mismatch = new AppError('Your session does not belong to this enterprise.', 403, 'ENTERPRISE_CONTEXT_MISMATCH');
  assert.equal(mismatch.statusCode, 403);
});
