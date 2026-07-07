-- =============================================================================
-- Deploy PAY Element Eligibility Profile Elements (full)
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

@@01_create_link_table.sql
@@02_create_sequence.sql
@@03_create_trigger.sql
@@PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG_SPEC.sql
@@PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG_BODY.sql
@@04_update_v_pay_element_elig_profiles.sql
@@10_compile_and_verify.sql
@@09_test_calls.sql

PROMPT PAY Element Eligibility Profile Elements deployment completed.
