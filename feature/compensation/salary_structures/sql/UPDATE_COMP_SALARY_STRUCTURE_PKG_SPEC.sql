-- =============================================================================
-- COMP.UPDATE_COMP_SALARY_STRUCTURE_PKG — package specification
-- Aligns with CREATE_COMP_SALARY_STRUCTURE_PKG (employment types + org hierarchy).
-- Deploy: @UPDATE_COMP_SALARY_STRUCTURE_PKG_SPEC.sql then @UPDATE_COMP_SALARY_STRUCTURE_PKG_BODY.sql
-- Prerequisite: COMP.CREATE_COMP_SALARY_STRUCTURE_PKG.GET_SCOPE_ORG_UNITS_JSON must be PUBLIC.
-- =============================================================================

CREATE OR REPLACE PACKAGE COMP.UPDATE_COMP_SALARY_STRUCTURE_PKG AS

  PROCEDURE UPDATE_SALARY_STRUCTURE (
    P_STRUCTURE_GUID               IN RAW,
    P_STRUCTURE_CODE               IN VARCHAR2                    DEFAULT NULL,
    P_STRUCTURE_NAME               IN VARCHAR2                    DEFAULT NULL,
    P_STRUCTURE_TYPE_CODE          IN VARCHAR2                    DEFAULT NULL,
    P_CURRENCY_CODE                IN VARCHAR2                    DEFAULT NULL,
    P_COUNTRY_ID                   IN NUMBER                      DEFAULT NULL,
    P_ENTERPRISE_ID                IN NUMBER                      DEFAULT NULL,
    P_DESCRIPTION                  IN VARCHAR2                    DEFAULT NULL,
    P_STATUS                       IN VARCHAR2                    DEFAULT NULL,
    P_ACTIVE_FLAG                  IN CHAR                        DEFAULT NULL,
    P_EFFECTIVE_FROM               IN DATE                        DEFAULT NULL,
    P_EFFECTIVE_TO                 IN DATE                        DEFAULT NULL,
    P_ENABLE_PAYROLL_INTEGRATION   IN CHAR                        DEFAULT NULL,
    P_AUTO_CALC_COMPONENTS         IN CHAR                        DEFAULT NULL,
    P_ENABLE_VERSION_CONTROL       IN CHAR                        DEFAULT NULL,
    P_REQUIRE_MULTI_APPROVAL       IN CHAR                        DEFAULT NULL,
    P_ENABLE_AUDIT_LOGGING         IN CHAR                        DEFAULT NULL,
    P_ALLOW_MANUAL_OVERRIDE        IN CHAR                        DEFAULT NULL,
    P_COST_CENTER_CODE             IN VARCHAR2                    DEFAULT NULL,
    P_FIN_EFFECTIVE_FROM           IN DATE                        DEFAULT NULL,
    P_FIN_EFFECTIVE_TO             IN DATE                        DEFAULT NULL,
    P_ANNUAL_BUDGET_AMOUNT         IN NUMBER                      DEFAULT NULL,
    P_COUNTRY_CODE                 IN VARCHAR2                    DEFAULT NULL,
    P_COMPONENTS_JSON              IN CLOB                        DEFAULT NULL,
    P_BUSINESS_UNITS_JSON          IN CLOB                        DEFAULT NULL,
    P_EMPLOYMENT_TYPES_JSON        IN CLOB                        DEFAULT NULL,
    P_JOB_FAMILIES_JSON            IN CLOB                        DEFAULT NULL,
    P_POSITIONS_JSON               IN CLOB                        DEFAULT NULL,
    P_GRADE_RANGES_JSON            IN CLOB                        DEFAULT NULL,
    P_UPDATED_BY                   IN VARCHAR2                    DEFAULT NULL
  );

END UPDATE_COMP_SALARY_STRUCTURE_PKG;
/
