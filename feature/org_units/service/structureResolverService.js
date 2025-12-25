import HrOrgStructureModel from '../../hr_org_structures/model/hrOrgStructureModel.js';
import HrOrgHierarchyLevelModel from '../../hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js';

/**
 * Structure Resolver Service
 * Resolves structure and ordered levels for dynamic hierarchy logic
 */
class StructureResolverService {
  /**
   * Resolve structure and ordered levels
   * @param {number} structureId - Structure ID
   * @param {Object} options - Options {allowDraft: boolean}
   * @returns {Promise<Object>} Resolved structure with helper methods
   */
  static async resolveStructure(structureId, options = {}) {
    const { allowDraft = false } = options;

    // Load structure
    const structure = await HrOrgStructureModel.findById(structureId);
    if (!structure) {
      const error = new Error('Structure not found');
      error.code = 'STRUCTURE_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // Validate structure is active (unless allowDraft is true)
    if (!allowDraft && structure.is_active !== 'Y') {
      const error = new Error('Structure is not active');
      error.code = 'STRUCTURE_NOT_ACTIVE';
      error.statusCode = 400;
      throw error;
    }

    // Load ordered levels (IS_ACTIVE='Y', ordered by DISPLAY_ORDER)
    const levels = await HrOrgHierarchyLevelModel.findAll({
      structureId: structureId,
      isActive: true
    });

    // Sort by DISPLAY_ORDER ASC (ignore LEVEL_NUMBER)
    const levelsOrdered = levels.sort((a, b) => {
      const orderA = a.display_order || a.DISPLAY_ORDER || 0;
      const orderB = b.display_order || b.DISPLAY_ORDER || 0;
      return orderA - orderB;
    });

    // Build level lookup map
    const levelMap = new Map();
    levelsOrdered.forEach((level, index) => {
      const levelCode = level.level_code || level.LEVEL_CODE;
      if (levelCode) {
        levelMap.set(levelCode.toUpperCase(), {
          level,
          index,
          displayOrder: level.display_order || level.DISPLAY_ORDER || 0
        });
      }
    });

    // Helper: Check if level exists
    const levelExists = (levelCode) => {
      if (!levelCode) return false;
      return levelMap.has(levelCode.toUpperCase());
    };

    // Helper: Get parent level code for a given level code
    const getParentLevelCode = (levelCode) => {
      if (!levelCode) return null;
      const levelInfo = levelMap.get(levelCode.toUpperCase());
      if (!levelInfo) return null;
      
      // If it's the first level (index 0), it's the root (no parent)
      if (levelInfo.index === 0) return null;
      
      // Return the previous level's code
      const parentLevel = levelsOrdered[levelInfo.index - 1];
      return parentLevel?.level_code || parentLevel?.LEVEL_CODE || null;
    };

    // Helper: Get root level code
    const getRootLevelCode = () => {
      if (levelsOrdered.length === 0) return null;
      return levelsOrdered[0].level_code || levelsOrdered[0].LEVEL_CODE || null;
    };

    return {
      structureRow: structure,
      levelsOrdered,
      levelExists,
      getParentLevelCode,
      getRootLevelCode
    };
  }
}

export default StructureResolverService;

