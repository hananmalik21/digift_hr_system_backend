-- =============================================================================
-- 09. Compile and verify PAY Element Eligibility Rules objects
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

ALTER PACKAGE PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG COMPILE;
ALTER PACKAGE PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG COMPILE BODY;

BEGIN
  FOR r IN (
    SELECT object_name, object_type, status
      FROM all_objects
     WHERE owner = 'PAY'
       AND object_name IN (
         'PAY_ELEMENT_ELG_RULES_BIU_TRG',
         'PAY_EERV_BIU_TRG',
         'PAY_ELEMENT_ELIGIBILITY_RULES_PKG',
         'V_PAY_ELEMENT_ELIGIBILITY_RULES',
         'PAY_ELEMENT_ELIGIBILITY_RULE_VALUES',
         'PAY_ELEMENT_ELIGIBILITY_RULES'
       )
     ORDER BY object_type, object_name
  ) LOOP
    IF r.status <> 'VALID' THEN
      RAISE_APPLICATION_ERROR(
        -20002,
        'Invalid object: PAY.' || r.object_name || ' (' || r.object_type || ')'
      );
    END IF;
    DBMS_OUTPUT.PUT_LINE(r.object_type || ' ' || r.object_name || ' => ' || r.status);
  END LOOP;
END;
/

SELECT object_name, object_type, status
  FROM all_objects
 WHERE owner = 'PAY'
   AND object_name IN (
     'PAY_ELEMENT_ELG_RULES_BIU_TRG',
     'PAY_EERV_BIU_TRG',
     'PAY_ELEMENT_ELIGIBILITY_RULES_PKG',
     'V_PAY_ELEMENT_ELIGIBILITY_RULES',
     'PAY_ELEMENT_ELIGIBILITY_RULE_VALUES',
     'PAY_ELEMENT_ELIGIBILITY_RULES'
   )
 ORDER BY object_type, object_name;

SELECT name, type, line, position, text
  FROM all_errors
 WHERE owner = 'PAY'
   AND name IN (
     'PAY_ELEMENT_ELG_RULES_BIU_TRG',
     'PAY_EERV_BIU_TRG',
     'PAY_ELEMENT_ELIGIBILITY_RULES_PKG',
     'V_PAY_ELEMENT_ELIGIBILITY_RULES'
   )
 ORDER BY name, sequence;

PROMPT 09_compile_and_verify.sql completed.
