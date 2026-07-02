-- =============================================================================
-- Deploy PAY.PAY_ELEMENT_SCOPE_RULES_PKG (spec + body)
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

@@PAY_ELEMENT_SCOPE_RULES_PKG_SPEC.sql
@@PAY_ELEMENT_SCOPE_RULES_PKG_BODY.sql

PROMPT PAY.PAY_ELEMENT_SCOPE_RULES_PKG deployed.
