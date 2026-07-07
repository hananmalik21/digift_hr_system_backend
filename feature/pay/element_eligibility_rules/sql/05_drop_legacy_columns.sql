-- =============================================================================
-- 05. Drop legacy columns from PAY.PAY_ELEMENT_ELIGIBILITY_RULES
-- Removes ELEMENT_ID and single-value criteria columns from parent table.
-- Run as PAY after migration (script 04).
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

DECLARE
  PROCEDURE drop_column_if_exists (
    p_table_name  IN VARCHAR2,
    p_column_name IN VARCHAR2
  ) IS
    l_count NUMBER;
  BEGIN
    SELECT COUNT(*)
      INTO l_count
      FROM all_tab_columns
     WHERE owner = 'PAY'
       AND table_name = p_table_name
       AND column_name = p_column_name;

    IF l_count > 0 THEN
      EXECUTE IMMEDIATE
        'ALTER TABLE PAY.' || p_table_name || ' DROP COLUMN ' || p_column_name;
      DBMS_OUTPUT.PUT_LINE('Dropped column ' || p_column_name || '.');
    END IF;
  END drop_column_if_exists;

  PROCEDURE drop_constraint_if_exists (
    p_constraint_name IN VARCHAR2
  ) IS
    l_count NUMBER;
  BEGIN
    SELECT COUNT(*)
      INTO l_count
      FROM all_constraints
     WHERE owner = 'PAY'
       AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULES'
       AND constraint_name = p_constraint_name;

    IF l_count > 0 THEN
      EXECUTE IMMEDIATE
        'ALTER TABLE PAY.PAY_ELEMENT_ELIGIBILITY_RULES DROP CONSTRAINT ' || p_constraint_name;
      DBMS_OUTPUT.PUT_LINE('Dropped constraint ' || p_constraint_name || '.');
    END IF;
  END drop_constraint_if_exists;

BEGIN
  -- Drop FK to PAY_ELEMENTS if present
  FOR c IN (
    SELECT constraint_name
      FROM all_constraints
     WHERE owner = 'PAY'
       AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULES'
       AND constraint_type = 'R'
       AND r_constraint_name IN (
         SELECT constraint_name
           FROM all_constraints
          WHERE owner = 'PAY'
            AND table_name = 'PAY_ELEMENTS'
       )
  ) LOOP
    EXECUTE IMMEDIATE
      'ALTER TABLE PAY.PAY_ELEMENT_ELIGIBILITY_RULES DROP CONSTRAINT ' || c.constraint_name;
    DBMS_OUTPUT.PUT_LINE('Dropped FK constraint ' || c.constraint_name || '.');
  END LOOP;

  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'ELEMENT_ID');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'CRITERIA_TYPE_CODE');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'CRITERIA_VALUE');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'LEGAL_EMPLOYER_ID');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'ORG_UNIT_ID');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'GRADE_ID');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'POSITION_ID');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'EMPLOYMENT_TYPE_CODE');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'LOCATION_CODE');
  drop_column_if_exists('PAY_ELEMENT_ELIGIBILITY_RULES', 'RULE_GUID');
END;
/

PROMPT 05_drop_legacy_columns.sql completed.
