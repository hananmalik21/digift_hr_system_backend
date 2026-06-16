/**
 * ENT read views — single source for enterprise management list/get SQL.
 */
export const ENT_VIEWS = Object.freeze({
  enterprises: 'ENT.V_ENTERPRISES',
  structureLevels: 'ENT.V_STRUCTURE_LEVELS',
  hrOrgStructures: 'ENT.V_HR_ORG_STRUCTURES',
  hrOrgHierarchyLevels: 'ENT.V_HR_ORG_HIERARCHY_LEVELS',
  orgUnits: 'ENT.V_ORG_UNITS',
  jobFamilies: 'ENT.V_JOB_FAMILIES',
  grades: 'ENT.V_GRADES',
  jobLevels: 'ENT.V_JOB_LEVELS',
  positions: 'ENT.V_POSITIONS',
  enterpriseStats: 'ENT.V_ENTERPRISE_STATS',
  workforceStats: 'ENT.V_WORKFORCE_STATS',
  activeStructureLevelStats: 'ENT.V_ACTIVE_STRUCTURE_LEVEL_STATS'
});
