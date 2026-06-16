-- =============================================================================
-- Deploy ENT.ORG_UNITS_PKG (spec + body)
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

@@ENT_ORG_UNITS_PKG_SPEC.sql
@@ENT_ORG_UNITS_PKG_BODY.sql

PROMPT ENT.ORG_UNITS_PKG deployed.
