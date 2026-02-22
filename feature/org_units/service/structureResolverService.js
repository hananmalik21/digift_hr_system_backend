import HrOrgStructureModel from '../../hr_org_structures/model/hrOrgStructureModel.js';
import HrOrgHierarchyLevelModel from '../../hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js';

/**
 * Build resolver return shape from levels array (shared by resolveStructure and resolveStructureLight).
 */
function buildResolverShape(structureRow, levelsOrdered) {
  const levelMap = new Map();
  levelsOrdered.forEach((level, index) => {
    const levelCode = level.level_code ?? level.LEVEL_CODE;
    if (levelCode) {
      levelMap.set(levelCode.toUpperCase(), {
        level,
        index,
        displayOrder: level.display_order ?? level.DISPLAY_ORDER ?? 0
      });
    }
  });
  const levelExists = (levelCode) => (levelCode ? levelMap.has(levelCode.toUpperCase()) : false);
  const getParentLevelCode = (levelCode) => {
    if (!levelCode) return null;
    const levelInfo = levelMap.get(levelCode.toUpperCase());
    if (!levelInfo) return null;
    if (levelInfo.index === 0) return null;
    const parentLevel = levelsOrdered[levelInfo.index - 1];
    return parentLevel?.level_code ?? parentLevel?.LEVEL_CODE ?? null;
  };
  const getRootLevelCode = () =>
    levelsOrdered.length === 0 ? null : (levelsOrdered[0].level_code ?? levelsOrdered[0].LEVEL_CODE ?? null);
  return {
    structureRow,
    levelsOrdered,
    levelExists,
    getParentLevelCode,
    getRootLevelCode
  };
}

/**
 * Structure Resolver Service
 * Resolves structure and ordered levels for dynamic hierarchy logic.
 */
class StructureResolverService {
  /**
   * Resolve structure and ordered levels (full structure row). Two round-trips via findById.
   * Use resolveStructureLight for GET org-units / GET levels when full structure row is not needed.
   *
   * @param {string} structureId - Structure ID (hex32)
   * @param {Object} [options] - Options
   * @param {boolean} [options.allowDraft=false] - If true, allow inactive structure
   * @returns {Promise<{ structureRow: Object, levelsOrdered: Array, levelExists: Function, getParentLevelCode: Function, getRootLevelCode: Function }>}
   */
  static async resolveStructure(structureId, options = {}) {
    const { allowDraft = false } = options;

    const structure = await HrOrgStructureModel.findById(structureId);
    if (!structure) {
      const error = new Error('Structure not found');
      error.code = 'STRUCTURE_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    if (!allowDraft && structure.is_active !== 'Y') {
      const error = new Error('Structure is not active');
      error.code = 'STRUCTURE_NOT_ACTIVE';
      error.statusCode = 400;
      throw error;
    }

    // findById already returns structure.levels (from fetchLevelsForStructure); use it to avoid a second round-trip
    const levels = Array.isArray(structure.levels) ? structure.levels : [];
    const levelsOrdered = [...levels].sort((a, b) => {
      const orderA = a.display_order ?? a.DISPLAY_ORDER ?? 0;
      const orderB = b.display_order ?? b.DISPLAY_ORDER ?? 0;
      return orderA - orderB;
    });
    return buildResolverShape(structure, levelsOrdered);
  }

  /**
   * Resolve structure (minimal) and levels in one round-trip. For GET org-units and GET levels.
   * Uses findStructureWithLevels; structureRow is { structureId, isActive } only.
   *
   * @param {string} structureId - Structure ID (hex32)
   * @param {Object} [options] - Options
   * @param {boolean} [options.allowDraft=false] - If true, allow inactive structure
   * @param {Object} [options.connection] - Reuse this DB connection
   * @returns {Promise<{ structureRow: Object, levelsOrdered: Array, levelExists: Function, getParentLevelCode: Function, getRootLevelCode: Function }>}
   */
  static async resolveStructureLight(structureId, options = {}) {
    const { allowDraft = false, connection } = options;
    const structureWithLevels = await HrOrgHierarchyLevelModel.findStructureWithLevels(structureId, connection ? { connection } : {});
    if (!structureWithLevels) {
      const error = new Error('Structure not found');
      error.code = 'STRUCTURE_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }
    const { structure, levels } = structureWithLevels;
    if (!allowDraft && structure.isActive !== 'Y') {
      const error = new Error('Structure is not active');
      error.code = 'STRUCTURE_NOT_ACTIVE';
      error.statusCode = 400;
      throw error;
    }
    const levelsOrdered = [...levels].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const structureRow = {
      structureId: structure.structureId,
      isActive: structure.isActive,
      enterprise_id: structure.enterpriseId ?? structure.enterprise_id ?? null
    };
    return buildResolverShape(structureRow, levelsOrdered);
  }
}

export default StructureResolverService;

