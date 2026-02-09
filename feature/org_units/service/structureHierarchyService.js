import db from '../../../config/db.js';
import HrOrgHierarchyLevelModel from '../../hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js';
import OrgUnitModel from '../model/orgUnitModel.js';

/** Build a structured error for the hierarchy service (code + statusCode for controller handling). */
function hierarchyError(message, code, statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

/**
 * Structure Hierarchy Service
 * Provides dynamic parent-selection logic based on DISPLAY_ORDER from structure levels.
 * Hierarchy is determined dynamically; no hardcoded parent relationships.
 */
class StructureHierarchyService {
  /**
   * Get parent candidates for a given child level.
   * Parent level = previous level by DISPLAY_ORDER; root level has no parent.
   *
   * @param {string} structureId - Structure ID (hex32)
   * @param {string} childLevelCode - Level code (e.g. 'DIVISION', 'BUSINESS_UNIT')
   * @param {Object} options - Options
   * @param {string} [options.search] - Optional search on parent code/name
   * @param {{ page: number, pageSize: number }} [options.pagination] - Page and size (enables single-query path)
   * @param {boolean} [options.allowDraft=false] - If false, structure must be active
   * @returns {Promise<{ orgUnits: Array<{ id, name, level }>, total: number }|Array>} Paginated: { orgUnits, total }; else array of org units
   * @throws {Error} code STRUCTURE_NOT_FOUND (404), STRUCTURE_NOT_ACTIVE (400), LEVEL_NOT_IN_STRUCTURE (400)
   */
  static async getParentCandidates(structureId, childLevelCode, options = {}) {
    const { search, pagination, allowDraft = false } = options;
    const useSingleQuery = Boolean(pagination?.page && pagination?.pageSize);

    if (useSingleQuery) {
      let connection;
      try {
        connection = await db.getConnection();
        const one = await OrgUnitModel.findParentOptionsInOneQuery(
          structureId,
          childLevelCode,
          { search, pagination },
          { connection }
        );
        if (one.structExists === 0) throw hierarchyError('Structure not found', 'STRUCTURE_NOT_FOUND', 404);
        if (!allowDraft && one.isActive !== 'Y') throw hierarchyError('Structure is not active', 'STRUCTURE_NOT_ACTIVE', 400);
        if (one.childLevelFound === 0) {
          throw hierarchyError(`Level '${childLevelCode}' does not exist in structure ${structureId}`, 'LEVEL_NOT_IN_STRUCTURE', 400);
        }
        return one.parentLevelCode == null
          ? { orgUnits: [], total: 0 }
          : { orgUnits: one.orgUnits || [], total: one.total ?? 0 };
      } finally {
        if (connection?.close) {
          try { await connection.close(); } catch (_) {}
        }
      }
    }

    // No pagination: resolve structure + levels, then fetch parent options (one connection, two queries)
    let connection;
    try {
      connection = await db.getConnection();
      const structureWithLevels = await HrOrgHierarchyLevelModel.findStructureWithLevels(structureId, { connection });
      if (!structureWithLevels) throw hierarchyError('Structure not found', 'STRUCTURE_NOT_FOUND', 404);

      const { structure, levels } = structureWithLevels;

      if (!allowDraft && structure.isActive !== 'Y') throw hierarchyError('Structure is not active', 'STRUCTURE_NOT_ACTIVE', 400);

      const levelsOrdered = [...levels].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      let childLevelIndex = -1;
      for (let i = 0; i < levelsOrdered.length; i++) {
        const levelCode = levelsOrdered[i].level_code;
        if (levelCode && levelCode.toUpperCase() === childLevelCode.toUpperCase()) {
          childLevelIndex = i;
          break;
        }
      }

      if (childLevelIndex === -1) {
        throw hierarchyError(`Level '${childLevelCode}' does not exist in structure ${structureId}`, 'LEVEL_NOT_IN_STRUCTURE', 400);
      }

      if (childLevelIndex === 0) return [];

      const parentLevelCode = levelsOrdered[childLevelIndex - 1]?.level_code;
      if (!parentLevelCode) {
        throw new Error(`Could not determine parent level for '${childLevelCode}' in structure ${structureId}`);
      }

      const result = await OrgUnitModel.findParentOptions(structureId, parentLevelCode, { search, pagination, connection });

      if (pagination?.page && pagination?.pageSize) {
        return { orgUnits: result.orgUnits || [], total: result.total || 0 };
      }
      return result.orgUnits || result;
    } finally {
      if (connection?.close) {
        try { await connection.close(); } catch (_) {}
      }
    }
  }
}


export default StructureHierarchyService;

