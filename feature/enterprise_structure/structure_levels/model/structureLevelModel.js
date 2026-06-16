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

class StructureLevelModel {
  static toListPayload(filters = {}) {
    const payload = {};
    if (filters.levelId) payload.level_id = filters.levelId;
    if (filters.levelCode) payload.level_code = filters.levelCode;
    if (filters.isActive !== undefined) {
      Object.assign(payload, ynActive(filters.isActive));
    }
    return payload;
  }

  static toPackagePayload(data, userId) {
    return entActorPayload(data, userId, {
      level_code: data.LEVEL_CODE ?? data.level_code,
      level_name: data.LEVEL_NAME ?? data.level_name,
      is_mandatory: data.IS_MANDATORY ?? data.is_mandatory,
      is_active: data.IS_ACTIVE ?? data.is_active,
      last_update_login: data.LAST_UPDATE_LOGIN ?? data.last_update_login
    });
  }

  static async findAll(filters = {}) {
    try {
      return await entListRecords('STRUCTURE_LEVELS', this.toListPayload(filters));
    } catch (error) {
      throw new Error(`Failed to fetch structure levels: ${error.message}`);
    }
  }

  static async findById(levelId) {
    try {
      const row = await entGetRecord('STRUCTURE_LEVELS', { level_id: levelId });
      return row ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch structure level: ${error.message}`);
    }
  }

  static async create(data, userId) {
    try {
      return await entCreateRecord('STRUCTURE_LEVELS', this.toPackagePayload(data, userId));
    } catch (error) {
      rethrowEntError(error, 'Failed to create structure level');
    }
  }

  static async update(levelId, data, userId) {
    try {
      return await entUpdateRecord('STRUCTURE_LEVELS', {
        ...this.toPackagePayload(data, userId),
        level_id: levelId
      });
    } catch (error) {
      rethrowEntError(error, 'Failed to update structure level');
    }
  }

  static async softDelete(levelId, userId) {
    try {
      return await entDeleteRecord('STRUCTURE_LEVELS', {
        level_id: levelId,
        actor: userId || 'SYSTEM'
      });
    } catch (error) {
      throw new Error(`Failed to delete structure level: ${error.message}`);
    }
  }

  static async hardDelete(levelId) {
    try {
      return await entDeleteRecord('STRUCTURE_LEVELS', { level_id: levelId }, { hard: true });
    } catch (error) {
      throw new Error(`Failed to delete structure level: ${error.message}`);
    }
  }
}

export default StructureLevelModel;
