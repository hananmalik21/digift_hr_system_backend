-- =============================================================================
-- ENT.ORG_UNITS_PKG — specification
-- =============================================================================
-- Org unit read/export operations for ENT.ORG_UNITS (structure-centric).
--
-- Deploy (as ENT or with ENT schema access):
--   @deploy_ent_org_units_pkg.sql
--
-- Node: feature/enterprise_structure/org_units/service/orgUnitExportDbService.js
-- =============================================================================

CREATE OR REPLACE PACKAGE ENT.ORG_UNITS_PKG AS

  /**
   * Export org units as JSON for Excel generation in Node.
   *
   * p_org_structure_id_hex  32-char hex GUID for ENT.HR_ORG_STRUCTURES.STRUCTURE_ID
   * p_level_code            Optional level filter (e.g. COMPANY). NULL = all active levels.
   * p_parent_org_unit_id_hex Optional parent filter (requires p_level_code).
   * p_is_active             Optional Y/N filter.
   * p_search                Optional case-insensitive search on code / name EN / name AR.
   * p_allow_draft           1 = allow inactive structure (default). 0 = structure must be active.
   *
   * p_result_json OUT shape:
   * {
   *   "structure_name": "...",
   *   "row_count": 12,
   *   "sheets": [
   *     { "name": "COMPANY", "org_units": [ { ... } ] }
   *   ]
   * }
   *
   * p_status  S = success, E = business/validation error (see p_message)
   * Raises RAISE_APPLICATION_ERROR for unexpected failures — see ENT_ORG_UNITS_PKG_ERRORS.md
   */
  PROCEDURE EXPORT_ORG_UNITS(
    p_org_structure_id_hex   IN  VARCHAR2,
    p_level_code             IN  VARCHAR2 DEFAULT NULL,
    p_parent_org_unit_id_hex IN  VARCHAR2 DEFAULT NULL,
    p_is_active              IN  CHAR     DEFAULT NULL,
    p_search                 IN  VARCHAR2 DEFAULT NULL,
    p_allow_draft            IN  NUMBER   DEFAULT 1,
    p_status                 OUT VARCHAR2,
    p_message                OUT VARCHAR2,
    p_result_json            OUT CLOB
  );

  /** LIST / GET / CREATE / UPDATE / DELETE — JSON gateway for org unit CRUD */
  PROCEDURE INVOKE(
    p_action       IN  VARCHAR2,
    p_payload_json IN  CLOB,
    p_result_json  OUT CLOB,
    p_status       OUT VARCHAR2,
    p_message      OUT VARCHAR2
  );

END ORG_UNITS_PKG;
/
