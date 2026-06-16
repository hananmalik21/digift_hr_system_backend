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

class EnterpriseModel {
  static toListPayload(filters = {}) {
    const payload = {};
    if (filters.enterpriseId) payload.enterprise_id = filters.enterpriseId;
    if (filters.enterpriseCode) payload.enterprise_code = filters.enterpriseCode;
    if (filters.isActive !== undefined) {
      Object.assign(payload, ynActive(filters.isActive));
    }
    return payload;
  }

  static toPackagePayload(data, userId) {
    return entActorPayload(data, userId, {
      enterprise_code: data.ENTERPRISE_CODE ?? data.enterprise_code,
      enterprise_name: data.ENTERPRISE_NAME ?? data.enterprise_name,
      is_active: data.IS_ACTIVE ?? data.is_active,
      last_update_login: data.LAST_UPDATE_LOGIN ?? data.last_update_login
    });
  }

  static async findAll(filters = {}) {
    try {
      return await entListRecords('ENTERPRISES', this.toListPayload(filters));
    } catch (error) {
      throw new Error(`Failed to fetch enterprises: ${error.message}`);
    }
  }

  static async findById(enterpriseId) {
    try {
      const row = await entGetRecord('ENTERPRISES', { enterprise_id: enterpriseId });
      return row ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch enterprise: ${error.message}`);
    }
  }

  static async findByCode(enterpriseCode) {
    try {
      const rows = await entListRecords('ENTERPRISES', { enterprise_code: enterpriseCode });
      return rows[0] ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch enterprise by code: ${error.message}`);
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

  static async softDelete(enterpriseId, userId) {
    try {
      await entDeleteRecord('ENTERPRISES', {
        enterprise_id: enterpriseId,
        actor: userId || 'SYSTEM'
      });
      return true;
    } catch (error) {
      throw new Error(`Failed to delete enterprise: ${error.message}`);
    }
  }

  static async hardDelete(enterpriseId) {
    try {
      return await entDeleteRecord('ENTERPRISES', { enterprise_id: enterpriseId }, { hard: true });
    } catch (error) {
      if (error.message?.includes('referenced')) {
        const constraintError = new Error(
          'Cannot delete enterprise: This enterprise is referenced by other records in the database.'
        );
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.suggestion =
          'Use soft delete (?soft=true) to deactivate this enterprise instead of permanently deleting it.';
        throw constraintError;
      }
      throw new Error(`Failed to delete enterprise: ${error.message}`);
    }
  }
}

export default EnterpriseModel;
