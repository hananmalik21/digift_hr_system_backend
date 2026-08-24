/**
 * Enterprise request validation and query filter parsing.
 */

import { TENANT_SLUG_RE } from '../../../../utils/tenantHostname.js';
import { parseBooleanQuery, parseEnterpriseIdParam } from './enterpriseDeleteParams.js';
import { applyEnterpriseCurrencyCode, parseEnterpriseCurrencyFilter } from './enterpriseCurrency.js';

/** @param {Record<string, unknown>} [data] */
export function normalizeEnterpriseBody(data = {}) {
  const subdomainRaw = data.SUBDOMAIN_SLUG ?? data.subdomain_slug;
  const normalized = {
    ...data,
    ENTERPRISE_CODE: data.ENTERPRISE_CODE ?? data.enterprise_code,
    ENTERPRISE_NAME: data.ENTERPRISE_NAME ?? data.enterprise_name,
    IS_ACTIVE: data.IS_ACTIVE ?? data.is_active,
    LAST_UPDATE_LOGIN: data.LAST_UPDATE_LOGIN ?? data.last_update_login
  };

  if (subdomainRaw !== undefined) {
    const slug = subdomainRaw == null || String(subdomainRaw).trim() === ''
      ? null
      : String(subdomainRaw).trim().toLowerCase();
    normalized.SUBDOMAIN_SLUG = slug;
    normalized.subdomain_slug = slug;
  }

  const careerFlag = data.CAREER_PORTAL_ENABLED_FLAG ?? data.career_portal_enabled_flag;
  if (careerFlag !== undefined) {
    normalized.CAREER_PORTAL_ENABLED_FLAG = careerFlag;
    normalized.career_portal_enabled_flag = careerFlag;
  }

  return normalized;
}

/**
 * @param {Record<string, unknown>} data
 * @param {boolean} [isUpdate]
 * @returns {string[]}
 */
export function validateEnterpriseData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    if (!data.ENTERPRISE_CODE || String(data.ENTERPRISE_CODE).trim() === '') {
      errors.push('ENTERPRISE_CODE is required');
    }
    if (!data.ENTERPRISE_NAME || String(data.ENTERPRISE_NAME).trim() === '') {
      errors.push('ENTERPRISE_NAME is required');
    }
  } else {
    if (data.ENTERPRISE_CODE !== undefined && String(data.ENTERPRISE_CODE).trim() === '') {
      errors.push('ENTERPRISE_CODE cannot be empty');
    }
    if (data.ENTERPRISE_NAME !== undefined && String(data.ENTERPRISE_NAME).trim() === '') {
      errors.push('ENTERPRISE_NAME cannot be empty');
    }
  }

  if (
    data.IS_ACTIVE !== undefined
    && data.IS_ACTIVE !== true
    && data.IS_ACTIVE !== false
    && data.IS_ACTIVE !== 'Y'
    && data.IS_ACTIVE !== 'N'
  ) {
    errors.push('IS_ACTIVE must be true/false or Y/N');
  }

  if (data.SUBDOMAIN_SLUG !== undefined && data.SUBDOMAIN_SLUG !== null) {
    const slug = String(data.SUBDOMAIN_SLUG).trim().toLowerCase();
    if (!TENANT_SLUG_RE.test(slug)) {
      errors.push(
        'SUBDOMAIN_SLUG must be a lowercase DNS label (letters, digits, hyphens; 1–63 chars)'
      );
    }
  }

  if (
    data.CAREER_PORTAL_ENABLED_FLAG !== undefined
    && data.CAREER_PORTAL_ENABLED_FLAG !== true
    && data.CAREER_PORTAL_ENABLED_FLAG !== false
    && data.CAREER_PORTAL_ENABLED_FLAG !== 'Y'
    && data.CAREER_PORTAL_ENABLED_FLAG !== 'N'
  ) {
    errors.push('CAREER_PORTAL_ENABLED_FLAG must be true/false or Y/N');
  }

  applyEnterpriseCurrencyCode(data, errors, { required: !isUpdate });

  return errors;
}

/**
 * @param {import('express').Request['query']} query
 * @returns {{ filters: Record<string, unknown>, appliedFilters: Record<string, unknown>, errors: string[] }}
 */
export function parseEnterpriseListFilters(query) {
  const filters = {};
  const appliedFilters = {};
  const errors = [];

  if (query.enterprise_id) {
    try {
      filters.enterpriseId = parseEnterpriseIdParam(query.enterprise_id);
      appliedFilters.enterprise_id = filters.enterpriseId;
    } catch (err) {
      errors.push(err?.message || 'Invalid enterprise_id');
    }
  }

  if (query.enterprise_code) {
    filters.enterpriseCode = query.enterprise_code;
    appliedFilters.enterprise_code = filters.enterpriseCode;
  }

  if (query.isActive !== undefined) {
    filters.isActive = parseBooleanQuery(query.isActive);
    appliedFilters.is_active = filters.isActive;
  }

  if (query.currency_code !== undefined) {
    const parsed = parseEnterpriseCurrencyFilter(query.currency_code);
    if (!parsed.ok) {
      errors.push(parsed.error);
    } else if (parsed.value !== undefined) {
      filters.currencyCode = parsed.value;
      appliedFilters.currency_code = parsed.value;
    }
  }

  return { filters, appliedFilters, errors };
}
