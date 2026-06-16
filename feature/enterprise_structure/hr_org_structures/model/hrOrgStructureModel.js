import HrOrgHierarchyLevelModel from '../../hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js';
import {
  entActorPayload,
  entCreateRecord,
  entGetRecord,
  entInvokeAction,
  entListRecords,
  entUpdateRecord,
  rethrowEntError
} from '../../shared/entModelBridge.js';

class HrOrgStructureModel {
  static normalizeHex32(v) {
    return typeof v === 'string' ? v.trim().replace(/-/g, '').toUpperCase() : v;
  }

  static toListPayload(filters = {}) {
    const payload = {};
    if (filters.enterpriseId) payload.enterprise_id = Number(filters.enterpriseId);
    if (filters.structureIdHex) payload.structure_id = this.normalizeHex32(filters.structureIdHex);
    if (filters.isActive !== undefined) payload.is_active = filters.isActive ? 'Y' : 'N';
    return payload;
  }

  static toPackagePayload(data, userId) {
    const get = (upper, snake) => data[upper] !== undefined ? data[upper] : data[snake];
    const payload = entActorPayload(data, userId, {
      enterprise_id: get('ENTERPRISE_ID', 'enterprise_id'),
      structure_code: get('STRUCTURE_CODE', 'structure_code'),
      structure_name: get('STRUCTURE_NAME', 'structure_name'),
      structure_type: get('STRUCTURE_TYPE', 'structure_type'),
      description: get('DESCRIPTION', 'description'),
      is_active: get('IS_ACTIVE', 'is_active'),
      last_update_login: get('LAST_UPDATE_LOGIN', 'last_update_login')
    });

    const levels = data.levels ?? data.LEVELS;
    if (Array.isArray(levels) && levels.length > 0) {
      payload.levels = levels.map((level) => ({
        level_number: level.LEVEL_NUMBER ?? level.level_number,
        level_code: level.LEVEL_CODE ?? level.level_code,
        level_name: level.LEVEL_NAME ?? level.level_name,
        is_mandatory: level.IS_MANDATORY ?? level.is_mandatory,
        is_active: level.IS_ACTIVE ?? level.is_active,
        display_order: level.DISPLAY_ORDER ?? level.display_order,
        structure_level_id: level.STRUCTURE_LEVEL_ID ?? level.structure_level_id
      }));
    }

    return payload;
  }

  static async attachLevels(structures) {
    const structureIdsHex = structures.map((s) => s.structure_id).filter(Boolean);
    const levelsByStructureHex = await HrOrgHierarchyLevelModel.fetchLevelsForStructures(structureIdsHex);
    return structures.map((structure) => ({
      ...structure,
      levels: levelsByStructureHex[structure.structure_id] || []
    }));
  }

  static async findAll(filters = {}) {
    try {
      const rows = await entListRecords('HR_ORG_STRUCTURES', this.toListPayload(filters));
      let list = rows;

      if (filters.structureType) {
        const type = String(filters.structureType).toUpperCase();
        list = list.filter((s) => String(s.structure_type ?? '').toUpperCase() === type);
      }

      const withLevels = await this.attachLevels(list);
      const pagination = filters.pagination;

      if (pagination?.page && pagination?.pageSize) {
        const total = withLevels.length;
        const offset = (pagination.page - 1) * pagination.pageSize;
        return {
          structures: withLevels.slice(offset, offset + pagination.pageSize),
          total
        };
      }

      return withLevels;
    } catch (error) {
      throw new Error(`Failed to fetch organization structures: ${error.message}`);
    }
  }

  static async findById(structureIdHex) {
    try {
      const normalizedId = this.normalizeHex32(structureIdHex);
      const [structure, levels] = await Promise.all([
        entGetRecord('HR_ORG_STRUCTURES', { structure_id: normalizedId }),
        HrOrgHierarchyLevelModel.fetchLevelsForStructure(null, normalizedId)
      ]);
      if (!structure) return null;
      return { ...structure, levels: levels || [] };
    } catch (error) {
      throw new Error(`Failed to fetch organization structure: ${error.message}`);
    }
  }

  static async findActive(enterpriseId) {
    try {
      if (enterpriseId == null || enterpriseId === '' || isNaN(Number(enterpriseId)) || Number(enterpriseId) <= 0) {
        throw new Error('enterprise_id is required and must be a positive number');
      }
      const rows = await entListRecords('HR_ORG_STRUCTURES', {
        enterprise_id: Number(enterpriseId),
        is_active: 'Y'
      });
      return rows?.[0] ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch active organization structure: ${error.message}`);
    }
  }

  static async getActiveStructureLevels(enterpriseId) {
    try {
      const activeStructure = await this.findActive(enterpriseId);
      if (!activeStructure) return null;

      const levels = await HrOrgHierarchyLevelModel.findAll({
        structureIdHex: activeStructure.structure_id,
        isActive: true
      });

      return { ...activeStructure, levels };
    } catch (error) {
      throw new Error(`Failed to fetch active structure levels: ${error.message}`);
    }
  }

  static async create(data, userId) {
    try {
      const created = await entCreateRecord('HR_ORG_STRUCTURES', this.toPackagePayload(data, userId));
      const levels = Array.isArray(data.levels ?? data.LEVELS) && (data.levels ?? data.LEVELS).length > 0
        ? await HrOrgHierarchyLevelModel.fetchLevelsForStructure(null, created.structure_id)
        : [];
      return { ...created, levels };
    } catch (error) {
      rethrowEntError(error, 'Failed to create organization structure');
    }
  }

  static async update(structureIdHex, data, userId) {
    try {
      const normalizedId = this.normalizeHex32(structureIdHex);
      const get = (upper, snake) => data[upper] !== undefined ? data[upper] : data[snake];
      const payload = entActorPayload(data, userId, {
        structure_id: normalizedId,
        enterprise_id: get('ENTERPRISE_ID', 'enterprise_id'),
        structure_code: get('STRUCTURE_CODE', 'structure_code'),
        structure_name: get('STRUCTURE_NAME', 'structure_name'),
        structure_type: get('STRUCTURE_TYPE', 'structure_type'),
        description: get('DESCRIPTION', 'description'),
        is_active: get('IS_ACTIVE', 'is_active'),
        last_update_login: get('LAST_UPDATE_LOGIN', 'last_update_login')
      });
      return await entUpdateRecord('HR_ORG_STRUCTURES', payload);
    } catch (error) {
      rethrowEntError(error, 'Failed to update organization structure');
    }
  }

  static async getOrgStructureReferences(structureIdHex) {
    try {
      const normalizedId = this.normalizeHex32(structureIdHex);
      const result = await entInvokeAction('HR_ORG_STRUCTURES', 'GET_REFERENCES', {
        structure_id: normalizedId
      });
      const refs = Array.isArray(result?.references) ? result.references : [];
      return refs.filter((ref) => ref && Number(ref.count) > 0);
    } catch (error) {
      console.error('Error getting structure references:', error);
      return [];
    }
  }

  static async hardDelete(structureIdHex) {
    await entInvokeAction('HR_ORG_STRUCTURES', 'HARD_DELETE', {
      structure_id: this.normalizeHex32(structureIdHex)
    });
    return { success: true };
  }

  static async forceDelete(structureIdHex) {
    await entInvokeAction('HR_ORG_STRUCTURES', 'FORCE_DELETE', {
      structure_id: this.normalizeHex32(structureIdHex)
    });
    return { success: true };
  }
}

export default HrOrgStructureModel;
