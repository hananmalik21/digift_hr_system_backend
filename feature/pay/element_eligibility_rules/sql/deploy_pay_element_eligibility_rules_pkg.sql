-- =============================================================================
-- Deploy PAY Element Eligibility Rules (full upgrade)
-- Run scripts in order as PAY schema owner.
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

PROMPT === 01 Alter parent table ===
@@01_alter_pay_element_eligibility_rules_table.sql

PROMPT === 02 Create child table ===
@@02_create_pay_element_eligibility_rule_values.sql

PROMPT === 03 Create child sequence/triggers ===
@@03_create_pay_element_eligibility_rule_values_seq_trg.sql

PROMPT === 04 Migrate legacy criteria ===
@@04_migrate_legacy_criteria_to_values.sql

PROMPT === 05 Drop legacy columns ===
@@05_drop_legacy_columns.sql

PROMPT === 06 Parent sequence/trigger ===
@@06_create_pay_element_eligibility_rules_parent_seq_trg.sql

PROMPT === 06 Package spec ===
@@PAY_ELEMENT_ELIGIBILITY_RULES_PKG_SPEC.sql

PROMPT === 07 Package body ===
@@PAY_ELEMENT_ELIGIBILITY_RULES_PKG_BODY.sql

PROMPT === 08 Recreate GET view ===
@@create_pay_v_pay_element_eligibility_rules.sql

PROMPT === 09 Compile and verify ===
@@09_compile_and_verify.sql

PROMPT PAY Element Eligibility Rules deployment completed.
