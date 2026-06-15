-- =============================================================================
-- Deploy COMP.UPDATE_COMP_SALARY_STRUCTURE_PKG (spec + body)
-- Prerequisite: COMP.CREATE_COMP_SALARY_STRUCTURE_PKG with public GET_SCOPE_ORG_UNITS_JSON
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

@@UPDATE_COMP_SALARY_STRUCTURE_PKG_SPEC.sql
@@UPDATE_COMP_SALARY_STRUCTURE_PKG_BODY.sql

PROMPT COMP.UPDATE_COMP_SALARY_STRUCTURE_PKG deployed.
