import {
  entActorPayload,
  entCreateRecord,
  entGetRecord,
  entInvokeAction,
  entListRecords,
  entUpdateRecord,
  rethrowEntError
} from '../../shared/entModelBridge.js';
import { entInvokeWithConnection } from '../../shared/entDbClient.js';

class HrOrgHierarchyLevelModel {
  static isHex32(v) {
    return typeof v === 'string' && /^[0-9a-fA-F]{32}$/.test(v);
  }

  static normalizeHex32(v) {
    return typeof v === 'string' ? v.trim().replace(/-/g, '').toUpperCase() : v;
  }

  static normalizeStructureId(structureId) {
    if (typeof structureId === 'string' && this.isHex32(this.normalizeHex32(structureId))) {
      return this.normalizeHex32(structureId);
    }
    return structureId;
  }

  static toLevelPayload(data, userId, extra = {}) {
    const get = (upper, snake) => data[upper] !== undefined ? data[upper] : data[snake];
    return entActorPayload(data, userId, {
      ...extra,
      structure_id: this.normalizeStructureId(get('STRUCTURE_ID', 'structure_id')),
      level_number: get('LEVEL_NUMBER', 'level_number'),
      level_code: get('LEVEL_CODE', 'level_code'),
      level_name: get('LEVEL_NAME', 'level_name'),
      is_mandatory: get('IS_MANDATORY', 'is_mandatory'),
      is_active: get('IS_ACTIVE', 'is_active'),
      display_order: get('DISPLAY_ORDER', 'display_order'),
      last_update_login: get('LAST_UPDATE_LOGIN', 'last_update_login')
    });
  }

  static mapLevelsForPackage(levelsArray) {
    return levelsArray.map((level) => ({
      level_number: level.LEVEL_NUMBER ?? level.level_number,
      level_code: level.LEVEL_CODE ?? level.level_code,
      level_name: level.LEVEL_NAME ?? level.level_name,
      is_mandatory: level.IS_MANDATORY ?? level.is_mandatory,
      is_active: level.IS_ACTIVE ?? level.is_active,
      display_order: level.DISPLAY_ORDER ?? level.display_order,
      structure_level_id: level.STRUCTURE_LEVEL_ID ?? level.structure_level_id
    }));
  }

  static async findAll(filters = {}) {
    try {
      const structureId = filters.structureIdHex || filters.structureId;
      const payload = {
        ...(filters.levelId ? { level_id: filters.levelId } : {}),
        ...(structureId ? { structure_id: this.normalizeStructureId(structureId) } : {}),
        ...(filters.isActive !== undefined ? { is_active: filters.isActive ? 'Y' : 'N' } : {})
      };
      return await entListRecords('HR_ORG_HIERARCHY_LEVELS', payload);
    } catch (error) {
      throw new Error(`Failed to fetch hierarchy levels: ${error.message}`);
    }
  }

  static async findStructureWithLevels(structureIdHex) {
    const normalizedId = this.normalizeHex32(structureIdHex);
    if (!this.isHex32(normalizedId)) return null;

    const [structureRow, levels] = await Promise.all([
      entGetRecord('HR_ORG_STRUCTURES', { structure_id: normalizedId }),
      entListRecords('HR_ORG_HIERARCHY_LEVELS', { structure_id: normalizedId, is_active: 'Y' })
    ]);

    if (!structureRow) return null;

    return {
      structure: {
        structureId: structureRow.structure_id,
        isActive: structureRow.is_active,
        enterpriseId: structureRow.enterprise_id ?? null
      },
      levels
    };
  }

  static async findById(levelId) {
    try {
      const row = await entGetRecord('HR_ORG_HIERARCHY_LEVELS', { level_id: levelId });
      return row ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch hierarchy level: ${error.message}`);
    }
  }

  static async create(data, userId) {
    try {
      return await entCreateRecord('HR_ORG_HIERARCHY_LEVELS', this.toLevelPayload(data, userId));
    } catch (error) {
      rethrowEntError(error, 'Failed to create hierarchy level');
    }
  }

  static async createBulk(structureIdHex, levelsArray, userId) {
    try {
      const normalizedId = this.normalizeHex32(structureIdHex);
      if (!this.isHex32(normalizedId)) {
        const validationError = new Error(`Invalid structure ID format. Expected 32-char hex string, got: ${structureIdHex}`);
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      const rows = await entInvokeAction('HR_ORG_HIERARCHY_LEVELS', 'CREATE_BULK', {
        structure_id: normalizedId,
        levels: this.mapLevelsForPackage(levelsArray),
        actor: userId || 'SYSTEM'
      });

      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      if (error?.code === 'ENT_API_ERROR') {
        if (error.message?.includes('not found')) {
          const e = new Error(error.message);
          e.code = 'NOT_FOUND';
          e.statusCode = 404;
          throw e;
        }
        if (error.message?.includes('required') || error.message?.includes('non-empty')) {
          const e = new Error(error.message);
          e.code = 'VALIDATION_ERROR';
          e.statusCode = 400;
          throw e;
        }
      }
      rethrowEntError(error, 'Failed to create hierarchy levels');
    }
  }

  static async fetchLevelsForStructure(_connection, structureId) {
    try {
      const normalizedId = this.normalizeStructureId(structureId);
      if (!normalizedId) return [];
      return await entListRecords('HR_ORG_HIERARCHY_LEVELS', { structure_id: normalizedId });
    } catch (error) {
      throw new Error(`Failed to fetch hierarchy levels: ${error.message}`);
    }
  }

  static async fetchLevelsForStructures(structureIds) {
    try {
      if (!Array.isArray(structureIds) || structureIds.length === 0) return {};

      const normalizedIds = structureIds
        .map((id) => (typeof id === 'string' ? this.normalizeHex32(id) : id))
        .filter(Boolean);

      const pairs = await Promise.all(
        normalizedIds.map(async (sid) => [sid, await entListRecords('HR_ORG_HIERARCHY_LEVELS', { structure_id: sid })])
      );

      return Object.fromEntries(pairs);
    } catch (error) {
      throw new Error(`Failed to fetch hierarchy levels: ${error.message}`);
    }
  }

  static async update(levelId, data, userId) {
    try {
      return await entUpdateRecord('HR_ORG_HIERARCHY_LEVELS', {
        ...this.toLevelPayload(data, userId),
        level_id: levelId
      });
    } catch (error) {
      rethrowEntError(error, 'Failed to update hierarchy level');
    }
  }

  static async softDelete(levelId, userId) {
    try {
      await entInvokeWithConnection('HR_ORG_HIERARCHY_LEVELS', 'DELETE', {
        level_id: levelId,
        actor: userId || 'SYSTEM',
        hard: 0
      });
      return true;
    } catch (error) {
      throw new Error(`Failed to delete hierarchy level: ${error.message}`);
    }
  }

  static async hardDelete(levelId) {
    try {
      await entInvokeWithConnection('HR_ORG_HIERARCHY_LEVELS', 'DELETE', {
        level_id: levelId,
        hard: 1
      });
      return { success: true };
    } catch (error) {
      if (error?.code === 'ENT_API_ERROR' && error.message?.includes('referenced')) {
        const constraintError = new Error('Cannot delete hierarchy level: This level is referenced by other records in the database.');
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.suggestion = 'Use soft delete (?soft=true) to deactivate this level instead of permanently deleting it.';
        throw constraintError;
      }
      throw new Error(`Failed to delete hierarchy level: ${error.message}`);
    }
  }

  static async findByEnterpriseAndStructure(enterpriseId, structureId) {
    try {
      const normalizedStructureId = this.normalizeStructureId(structureId);
      const rows = await entListRecords('HR_ORG_HIERARCHY_LEVELS', {
        enterprise_id: Number(enterpriseId),
        structure_id: normalizedStructureId
      });

      if (rows.length === 0) {
        const isValid = await entGetRecord('HR_ORG_STRUCTURES', { structure_id: normalizedStructureId });
        if (!isValid || Number(isValid.enterprise_id) !== Number(enterpriseId)) {
          const notFoundError = new Error(`Structure ${structureId} not found for enterprise ${enterpriseId}`);
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }
      }

      return rows.sort((a, b) => Number(a.level_number) - Number(b.level_number));
    } catch (error) {
      if (error.code === 'NOT_FOUND') throw error;
      throw new Error(`Failed to fetch hierarchy levels: ${error.message}`);
    }
  }

  static async reorderLevels(enterpriseId, structureId, levels, userId) {
    try {
      const rows = await entInvokeAction('HR_ORG_HIERARCHY_LEVELS', 'REORDER', {
        enterprise_id: Number(enterpriseId),
        structure_id: this.normalizeStructureId(structureId),
        levels: levels.map((level) => ({
          level_id: level.level_id ?? level.LEVEL_ID,
          order: level.order ?? level.ORDER
        })),
        actor: userId || 'SYSTEM'
      });
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      if (error?.code === 'ENT_API_ERROR') {
        if (error.message?.includes('not found')) {
          const e = new Error(error.message);
          e.code = 'NOT_FOUND';
          e.statusCode = 404;
          throw e;
        }
        if (error.message?.includes('required')) {
          const e = new Error(error.message);
          e.code = 'VALIDATION_ERROR';
          e.statusCode = 400;
          throw e;
        }
      }
      rethrowEntError(error, 'Failed to reorder hierarchy levels');
    }
  }

  static async onboardEnterpriseHierarchy(data, userId, loginId) {
    try {
      const result = await entInvokeAction('HR_ORG_HIERARCHY_LEVELS', 'ONBOARD', {
        structure: data.structure,
        hr_organization_structure_id: data.hr_organization_structure_id,
        levels: data.levels,
        actor: userId || 'SYSTEM',
        last_update_login: loginId || 'API'
      });

      const enterpriseId = result?.enterprise_id;
      const structureId = result?.structure_id;
      if (!enterpriseId || !structureId) {
        return result;
      }

      const [enterprise, org_structure, levels] = await Promise.all([
        entGetRecord('ENTERPRISES', { enterprise_id: enterpriseId }),
        entGetRecord('HR_ORG_STRUCTURES', { structure_id: structureId }),
        entListRecords('HR_ORG_HIERARCHY_LEVELS', { structure_id: structureId })
      ]);

      return { enterprise, org_structure, levels };
    } catch (error) {
      if (error?.code === 'ENT_API_ERROR') {
        if (error.message?.includes('already exists')) {
          const e = new Error(error.message);
          e.code = 'CONFLICT';
          e.statusCode = 409;
          throw e;
        }
        if (error.message?.includes('required') || error.message?.includes('must be')) {
          const e = new Error(error.message);
          e.code = 'VALIDATION_ERROR';
          e.statusCode = 400;
          throw e;
        }
      }
      rethrowEntError(error, 'Failed to onboard enterprise hierarchy');
    }
  }
}

export default HrOrgHierarchyLevelModel;
