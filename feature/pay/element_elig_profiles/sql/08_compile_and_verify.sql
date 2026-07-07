-- =============================================================================
-- 08. Compile, verify, and smoke-test PAY Element Eligibility Profiles
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;
SET SERVEROUTPUT ON;

ALTER PACKAGE PAY.PAY_ELEMENT_ELIG_PROFILES_PKG COMPILE;
ALTER PACKAGE PAY.PAY_ELEMENT_ELIG_PROFILES_PKG COMPILE BODY;

PROMPT === Object status ===
SELECT object_name, object_type, status
  FROM all_objects
 WHERE owner = 'PAY'
   AND object_name IN (
       'PAY_ELEMENT_ELIG_PROFILES_PKG',
       'V_PAY_ELEMENT_ELIG_PROFILES',
       'PAY_ELEMENT_ELIG_PROFILES',
       'PAY_ELEMENT_ELIG_PROFILE_RULES',
       'PAY_EEL_PROFILES_BIU_TRG',
       'PAY_EEL_PROF_RULES_BIU_TRG'
   )
 ORDER BY object_type, object_name;

PROMPT === Compilation errors ===
SELECT name, type, line, position, text
  FROM all_errors
 WHERE owner = 'PAY'
   AND name IN (
       'PAY_ELEMENT_ELIG_PROFILES_PKG',
       'V_PAY_ELEMENT_ELIG_PROFILES',
       'PAY_EEL_PROFILES_BIU_TRG',
       'PAY_EEL_PROF_RULES_BIU_TRG'
   )
 ORDER BY name, sequence;

PROMPT 08_compile_and_verify.sql completed.
