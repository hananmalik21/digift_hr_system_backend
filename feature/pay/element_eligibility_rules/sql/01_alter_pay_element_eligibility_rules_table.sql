-- =============================================================================
-- 01. Alter PAY.PAY_ELEMENT_ELIGIBILITY_RULES
-- - Add ENTERPRISE_ID (NOT NULL)
-- - Prepare for removal of ELEMENT_ID and single-value criteria columns
-- Run as PAY (or schema owner).
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

-- -----------------------------------------------------------------------------
-- Add ENTERPRISE_ID when missing
-- -----------------------------------------------------------------------------
DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO l_count
    FROM all_tab_columns
   WHERE owner = 'PAY'
     AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULES'
     AND column_name = 'ENTERPRISE_ID';

  IF l_count = 0 THEN
    EXECUTE IMMEDIATE '
      ALTER TABLE PAY.PAY_ELEMENT_ELIGIBILITY_RULES
      ADD (ENTERPRISE_ID NUMBER)';
    DBMS_OUTPUT.PUT_LINE('Added ENTERPRISE_ID column.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('ENTERPRISE_ID already exists.');
  END IF;
END;
/

-- -----------------------------------------------------------------------------
-- Backfill ENTERPRISE_ID from PAY_ELEMENTS when ELEMENT_ID still exists
-- -----------------------------------------------------------------------------
DECLARE
  l_element_col NUMBER;
  l_null_count  NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO l_element_col
    FROM all_tab_columns
   WHERE owner = 'PAY'
     AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULES'
     AND column_name = 'ELEMENT_ID';

  IF l_element_col > 0 THEN
    EXECUTE IMMEDIATE '
      UPDATE PAY.PAY_ELEMENT_ELIGIBILITY_RULES R
         SET R.ENTERPRISE_ID = (
               SELECT E.ENTERPRISE_ID
                 FROM PAY.PAY_ELEMENTS E
                WHERE E.ELEMENT_ID = R.ELEMENT_ID
             )
       WHERE R.ENTERPRISE_ID IS NULL
         AND R.ELEMENT_ID IS NOT NULL';

    EXECUTE IMMEDIATE '
      SELECT COUNT(*)
        FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES
       WHERE ENTERPRISE_ID IS NULL'
      INTO l_null_count;

    IF l_null_count > 0 THEN
      RAISE_APPLICATION_ERROR(
        -20001,
        'Cannot set ENTERPRISE_ID NOT NULL: ' || l_null_count || ' rule row(s) have no enterprise.'
      );
    END IF;

    DBMS_OUTPUT.PUT_LINE('Backfilled ENTERPRISE_ID from ELEMENT_ID.');
  END IF;
END;
/

-- -----------------------------------------------------------------------------
-- Enforce NOT NULL on ENTERPRISE_ID
-- -----------------------------------------------------------------------------
DECLARE
  l_nullable VARCHAR2(1);
BEGIN
  SELECT nullable
    INTO l_nullable
    FROM all_tab_columns
   WHERE owner = 'PAY'
     AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULES'
     AND column_name = 'ENTERPRISE_ID';

  IF l_nullable = 'Y' THEN
    EXECUTE IMMEDIATE '
      ALTER TABLE PAY.PAY_ELEMENT_ELIGIBILITY_RULES
      MODIFY (ENTERPRISE_ID NUMBER NOT NULL)';
    DBMS_OUTPUT.PUT_LINE('ENTERPRISE_ID set to NOT NULL.');
  END IF;
END;
/

-- -----------------------------------------------------------------------------
-- FK to ENT.ENTERPRISES (create if missing)
-- -----------------------------------------------------------------------------
DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO l_count
    FROM all_constraints
   WHERE owner = 'PAY'
     AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULES'
     AND constraint_name = 'PAY_EER_ENTERPRISE_FK';

  IF l_count = 0 THEN
    EXECUTE IMMEDIATE '
      ALTER TABLE PAY.PAY_ELEMENT_ELIGIBILITY_RULES
      ADD CONSTRAINT PAY_EER_ENTERPRISE_FK
      FOREIGN KEY (ENTERPRISE_ID)
      REFERENCES ENT.ENTERPRISES (ENTERPRISE_ID)';
    DBMS_OUTPUT.PUT_LINE('Added PAY_EER_ENTERPRISE_FK.');
  END IF;
END;
/

PROMPT 01_alter_pay_element_eligibility_rules_table.sql completed.
