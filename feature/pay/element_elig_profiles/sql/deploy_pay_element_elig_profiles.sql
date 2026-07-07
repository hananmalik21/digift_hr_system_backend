-- =============================================================================
-- Deploy PAY Element Eligibility Profiles (full)
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

@@01_drop_previous_implementation.sql
@@02_create_parent_profile_table.sql
@@03_create_child_profile_rules_table.sql
@@04_create_sequences_and_triggers.sql
@@PAY_ELEMENT_ELIG_PROFILES_PKG_SPEC.sql
@@PAY_ELEMENT_ELIG_PROFILES_PKG_BODY.sql
@@create_pay_v_pay_element_elig_profiles.sql
@@08_compile_and_verify.sql
@@09_test_calls.sql

PROMPT PAY Element Eligibility Profiles deployment completed.
