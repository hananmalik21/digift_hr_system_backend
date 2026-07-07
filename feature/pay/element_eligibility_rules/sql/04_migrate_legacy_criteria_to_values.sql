-- =============================================================================
-- 04. Migrate legacy single-value criteria from parent to child table
-- Safe to re-run: skips rows already migrated (UK on rule + type + value).
-- Run as PAY after scripts 01-03.
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

DECLARE
  l_has_criteria_type NUMBER;
  l_has_criteria_value NUMBER;
  l_migrated          NUMBER := 0;
BEGIN
  SELECT COUNT(*)
    INTO l_has_criteria_type
    FROM all_tab_columns
   WHERE owner = 'PAY'
     AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULES'
     AND column_name = 'CRITERIA_TYPE_CODE';

  SELECT COUNT(*)
    INTO l_has_criteria_value
    FROM all_tab_columns
   WHERE owner = 'PAY'
     AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULES'
     AND column_name = 'CRITERIA_VALUE';

  IF l_has_criteria_type = 0 OR l_has_criteria_value = 0 THEN
    DBMS_OUTPUT.PUT_LINE('Legacy criteria columns not found on parent. Migration skipped.');
    RETURN;
  END IF;

  INSERT INTO PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES (
    ELIGIBILITY_RULE_ID,
    CRITERIA_TYPE_CODE,
    CRITERIA_VALUE,
    LEGAL_EMPLOYER_ID,
    ORG_UNIT_ID,
    GRADE_ID,
    POSITION_ID,
    EMPLOYMENT_TYPE_CODE,
    LOCATION_CODE,
    CREATED_BY,
    CREATION_DATE,
    LAST_UPDATED_BY,
    LAST_UPDATE_DATE
  )
  SELECT
    R.ELIGIBILITY_RULE_ID,
    UPPER(TRIM(R.CRITERIA_TYPE_CODE)),
    CASE
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'GRADE'
        THEN TO_CHAR(R.GRADE_ID)
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'POSITION'
        THEN RAWTOHEX(R.POSITION_ID)
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) IN ('LEGAL_EMPLOYER', 'BUSINESS_UNIT', 'DEPARTMENT')
        THEN RAWTOHEX(R.ORG_UNIT_ID)
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'EMPLOYMENT_TYPE'
        THEN R.EMPLOYMENT_TYPE_CODE
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'LOCATION'
        THEN R.LOCATION_CODE
      ELSE R.CRITERIA_VALUE
    END,
    CASE
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'LEGAL_EMPLOYER' THEN R.LEGAL_EMPLOYER_ID
      ELSE NULL
    END,
    CASE
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) IN ('BUSINESS_UNIT', 'DEPARTMENT') THEN R.ORG_UNIT_ID
      ELSE NULL
    END,
    CASE
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'GRADE' THEN R.GRADE_ID
      ELSE NULL
    END,
    CASE
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'POSITION' THEN R.POSITION_ID
      ELSE NULL
    END,
    CASE
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'EMPLOYMENT_TYPE' THEN R.EMPLOYMENT_TYPE_CODE
      ELSE NULL
    END,
    CASE
      WHEN UPPER(TRIM(R.CRITERIA_TYPE_CODE)) = 'LOCATION' THEN R.LOCATION_CODE
      ELSE NULL
    END,
    R.CREATED_BY,
    NVL(R.CREATION_DATE, SYSDATE),
    R.LAST_UPDATED_BY,
    NVL(R.LAST_UPDATE_DATE, SYSDATE)
  FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES R
  WHERE R.CRITERIA_TYPE_CODE IS NOT NULL
    AND (
      R.CRITERIA_VALUE IS NOT NULL
      OR R.GRADE_ID IS NOT NULL
      OR R.POSITION_ID IS NOT NULL
      OR R.ORG_UNIT_ID IS NOT NULL
      OR R.LEGAL_EMPLOYER_ID IS NOT NULL
      OR R.EMPLOYMENT_TYPE_CODE IS NOT NULL
      OR R.LOCATION_CODE IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
        FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES V
       WHERE V.ELIGIBILITY_RULE_ID = R.ELIGIBILITY_RULE_ID
    );

  l_migrated := SQL%ROWCOUNT;
  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Migrated ' || l_migrated || ' legacy criteria row(s) to child table.');
END;
/

PROMPT 04_migrate_legacy_criteria_to_values.sql completed.
