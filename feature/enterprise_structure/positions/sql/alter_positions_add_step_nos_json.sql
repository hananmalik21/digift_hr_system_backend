-- Adds support for multiple grade steps per position while keeping STEP_NO for backward compatibility.
-- Safe to run multiple times.
DECLARE
  v_column_exists NUMBER := 0;
BEGIN
  SELECT COUNT(*)
    INTO v_column_exists
    FROM ALL_TAB_COLUMNS
   WHERE OWNER = 'ENT'
     AND TABLE_NAME = 'POSITIONS'
     AND COLUMN_NAME = 'STEP_NOS_JSON';

  IF v_column_exists = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE ENT.POSITIONS ADD (STEP_NOS_JSON CLOB)';
  END IF;
END;
/

BEGIN
  UPDATE ENT.POSITIONS
     SET STEP_NOS_JSON = CASE
       WHEN STEP_NO IS NULL THEN '[]'
       ELSE '[' || TO_CHAR(STEP_NO) || ']'
     END
   WHERE STEP_NOS_JSON IS NULL;
  COMMIT;
END;
/

DECLARE
  v_constraint_exists NUMBER := 0;
BEGIN
  SELECT COUNT(*)
    INTO v_constraint_exists
    FROM ALL_CONSTRAINTS
   WHERE OWNER = 'ENT'
     AND TABLE_NAME = 'POSITIONS'
     AND CONSTRAINT_NAME = 'POS_STEP_NOS_JSON_IS_JSON';

  IF v_constraint_exists = 0 THEN
    EXECUTE IMMEDIATE '
      ALTER TABLE ENT.POSITIONS
      ADD CONSTRAINT POS_STEP_NOS_JSON_IS_JSON
      CHECK (STEP_NOS_JSON IS JSON)
    ';
  END IF;
END;
/
