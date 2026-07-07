-- =============================================================================
-- 10. Compile and verify PAY Element Eligibility Profile Elements
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;
SET SERVEROUTPUT ON;

ALTER PACKAGE PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG COMPILE;
ALTER PACKAGE PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG COMPILE BODY;

PROMPT === SHOW ERRORS PACKAGE ===
SHOW ERRORS PACKAGE PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG;

PROMPT === SHOW ERRORS PACKAGE BODY ===
SHOW ERRORS PACKAGE BODY PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG;

PROMPT === Object status ===
SELECT object_name, object_type, status
  FROM all_objects
 WHERE owner = 'PAY'
   AND object_name IN (
       'PAY_ELEMENT_ELIG_PROFILE_ELEMENTS',
       'PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG',
       'PAY_EEL_PROF_ELEMS_BIU_TRG',
       'V_PAY_ELEMENT_ELIG_PROFILES'
   )
 ORDER BY object_type, object_name;

PROMPT === Compilation errors ===
SELECT name, type, line, position, text
  FROM all_errors
 WHERE owner = 'PAY'
   AND name IN (
       'PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG',
       'PAY_EEL_PROF_ELEMS_BIU_TRG',
       'V_PAY_ELEMENT_ELIG_PROFILES'
   )
 ORDER BY name, sequence;

DECLARE
    l_invalid_count NUMBER;
BEGIN
    SELECT COUNT(*)
      INTO l_invalid_count
      FROM all_objects
     WHERE owner = 'PAY'
       AND object_name IN (
           'PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG',
           'PAY_EEL_PROF_ELEMS_BIU_TRG',
           'V_PAY_ELEMENT_ELIG_PROFILES'
       )
       AND status <> 'VALID';

    IF l_invalid_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20030, l_invalid_count || ' PAY object(s) are still INVALID.');
    END IF;

    DBMS_OUTPUT.PUT_LINE('All target objects are VALID.');
END;
/

PROMPT 10_compile_and_verify.sql completed.
