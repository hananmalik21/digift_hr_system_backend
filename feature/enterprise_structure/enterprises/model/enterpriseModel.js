import {
  entActorPayload,
  entCreateRecord,
  entDeleteRecord,
  entGetRecord,
  entListRecords,
  entUpdateRecord,
  rethrowEntError
} from '../../shared/entModelBridge.js';
import { ynActive } from '../../shared/entModelHelpers.js';
import { shapeEnterpriseDeleteResult } from '../utils/enterpriseDeleteParams.js';

class EnterpriseModel {
  static toListPayload(filters = {}) {
    const payload = {};
    if (filters.enterpriseId) payload.enterprise_id = filters.enterpriseId;
    if (filters.enterpriseCode) payload.enterprise_code = filters.enterpriseCode;
    if (filters.currencyCode) payload.currency_code = filters.currencyCode;
    if (filters.isActive !== undefined) {
      Object.assign(payload, ynActive(filters.isActive));
    }
    return payload;
  }

  static toPackagePayload(data, userId) {
    const subdomainRaw = data.SUBDOMAIN_SLUG ?? data.subdomain_slug;
    const careerFlag = data.CAREER_PORTAL_ENABLED_FLAG ?? data.career_portal_enabled_flag;
    const currencyCode = data.CURRENCY_CODE ?? data.currency_code;
    return entActorPayload(data, userId, {
      enterprise_code: data.ENTERPRISE_CODE ?? data.enterprise_code,
      enterprise_name: data.ENTERPRISE_NAME ?? data.enterprise_name,
      is_active: data.IS_ACTIVE ?? data.is_active,
      last_update_login: data.LAST_UPDATE_LOGIN ?? data.last_update_login,
      ...(subdomainRaw !== undefined
        ? { subdomain_slug: subdomainRaw == null || subdomainRaw === ''
          ? null
          : String(subdomainRaw).trim().toLowerCase() }
        : {}),
      ...(careerFlag !== undefined
        ? { career_portal_enabled_flag: careerFlag }
        : {}),
      ...(currencyCode !== undefined
        ? { currency_code: currencyCode }
        : {})
    });
  }

  static async findAll(filters = {}) {
    try {
      return await entListRecords('ENTERPRISES', this.toListPayload(filters));
    } catch (error) {
      rethrowEntError(error, 'Failed to fetch enterprises');
    }
  }

  static async findById(enterpriseId) {
    try {
      const row = await entGetRecord('ENTERPRISES', { enterprise_id: enterpriseId });
      return row ?? null;
    } catch (error) {
      if (/not found/i.test(error?.message || '')) return null;
      rethrowEntError(error, 'Failed to fetch enterprise');
    }
  }

  static async findByCode(enterpriseCode) {
    try {
      const rows = await entListRecords('ENTERPRISES', { enterprise_code: enterpriseCode });
      return rows[0] ?? null;
    } catch (error) {
      rethrowEntError(error, 'Failed to fetch enterprise by code');
    }
  }

  static async create(data, userId) {
    try {
      return await entCreateRecord('ENTERPRISES', this.toPackagePayload(data, userId));
    } catch (error) {
      rethrowEntError(error, 'Failed to create enterprise');
    }
  }

  static async update(enterpriseId, data, userId) {
    try {
      return await entUpdateRecord('ENTERPRISES', {
        ...this.toPackagePayload(data, userId),
        enterprise_id: enterpriseId
      });
    } catch (error) {
      rethrowEntError(error, 'Failed to update enterprise');
    }
  }

  /**
   * Soft or hard delete via ENT_ENTERPRISES_PKG.
   * @param {number} enterpriseId
   * @param {{ actor?: string, hard?: boolean }} [options]
   */
  static async deleteEnterprise(enterpriseId, options = {}) {
    const hard = options.hard === true;
    try {
      const result = await entDeleteRecord(
        'ENTERPRISES',
        {
          enterprise_id: enterpriseId,
          actor: options.actor || 'SYSTEM'
        },
        { hard }
      );
      return shapeEnterpriseDeleteResult(enterpriseId, hard, result);
    } catch (error) {
      rethrowEntError(error, 'Failed to delete enterprise');
    }
  }

  static softDelete(enterpriseId, actor) {
    return this.deleteEnterprise(enterpriseId, { actor: actor || 'SYSTEM', hard: false });
  }

  static hardDelete(enterpriseId, actor) {
    return this.deleteEnterprise(enterpriseId, { actor: actor || 'SYSTEM', hard: true });
  }
}

export default EnterpriseModel;
