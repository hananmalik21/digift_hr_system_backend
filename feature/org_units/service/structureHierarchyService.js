import HrOrgHierarchyLevelModel from '../../hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js';
import OrgUnitModel from '../model/orgUnitModel.js';
import HrOrgStructureModel from '../../hr_org_structures/model/hrOrgStructureModel.js';

/**
 * Structure Hierarchy Service
 * Provides dynamic parent-selection logic based on DISPLAY_ORDER from structure levels.
 * NO hardcoded parent relationships - hierarchy is determined dynamically.
 */
class StructureHierarchyService {
  /**
   * Get parent candidates for a given child level
   * 
   * Parent level is determined dynamically:
   * - Parent of level X = the level with DISPLAY_ORDER = (X.display_order - 1)
   * - If X is first (display_order = 1), it is ROOT and has NO parent
   * 
   * DISPLAY_ORDER is the ONLY source of truth. LEVEL_NUMBER is ignored.
   * 
   * @param {number} structureId - Structure ID
   * @param {string} childLevelCode - The level code being created (e.g., 'DIVISION', 'BUSINESS_UNIT')
   * @param {Object} options - Optional filters {search, pagination, allowDraft}
   * @returns {Promise<Array>} Array of parent org units (empty if root level)
   * @throws {Error} LEVEL_NOT_IN_STRUCTURE if child level doesn't exist in structure
   */
  static async getParentCandidates(structureId, childLevelCode, options = {}) {
    const { search, pagination, allowDraft = false } = options;

    // Step 0: Validate structure exists
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

    // Step 1: Load active levels for the structure
    // Order by DISPLAY_ORDER ASC (ignore LEVEL_NUMBER completely)
    const levels = await HrOrgHierarchyLevelModel.findAll({
      structureId: structureId,
      isActive: true
    });

    // Sort by DISPLAY_ORDER ASC (this is the source of truth for hierarchy)
    const levelsOrdered = levels.sort((a, b) => {
      const orderA = a.display_order || a.DISPLAY_ORDER || 0;
      const orderB = b.display_order || b.DISPLAY_ORDER || 0;
      return orderA - orderB;
    });

    // Step 2: Find childLevelCode in ordered list
    let childLevelIndex = -1;
    for (let i = 0; i < levelsOrdered.length; i++) {
      const levelCode = levelsOrdered[i].level_code || levelsOrdered[i].LEVEL_CODE;
      if (levelCode && levelCode.toUpperCase() === childLevelCode.toUpperCase()) {
        childLevelIndex = i;
        break;
      }
    }

    // Step 3: If child level not found, throw error
    if (childLevelIndex === -1) {
      const error = new Error(`Level '${childLevelCode}' does not exist in structure ${structureId}`);
      error.code = 'LEVEL_NOT_IN_STRUCTURE';
      error.statusCode = 400;
      throw error;
    }

    // Step 4: If child level is first in list (root level), return empty array
    // Root level has no parent - UI should hide parent dropdown
    if (childLevelIndex === 0) {
      return [];
    }

    // Step 5: Determine parent level code dynamically
    // Parent = previous level in DISPLAY_ORDER (index - 1)
    const parentLevel = levelsOrdered[childLevelIndex - 1];
    const parentLevelCode = parentLevel?.level_code || parentLevel?.LEVEL_CODE;

    if (!parentLevelCode) {
      throw new Error(`Could not determine parent level for '${childLevelCode}' in structure ${structureId}`);
    }

    // Step 6: Fetch parent org units
    // Filter by:
    // - ORG_STRUCTURE_ID = structureId
    // - LEVEL_CODE = parentLevelCode (dynamically determined)
    // - IS_ACTIVE = 'Y' (only active org units can be parents)
    const filters = {
      search,
      pagination
    };

    const result = await OrgUnitModel.findParentOptions(structureId, parentLevelCode, filters);

    // Return result with total count if paginated, otherwise return array
    // This allows the controller to handle pagination metadata correctly
    if (pagination && pagination.page && pagination.pageSize) {
      return {
        orgUnits: result.orgUnits || [],
        total: result.total || 0
      };
    }
    
    // Non-paginated: return array directly
    return result.orgUnits || result;
  }
}

export default StructureHierarchyService;

