-- =============================================================================
-- ENT.POSITIONS: STEP_NOS_JSON (multi-step grades) + IS JSON constraint
-- Adds support for multiple grade steps per position while keeping STEP_NO
-- for backward compatibility. Idempotent: safe to run multiple times.
-- =============================================================================

-- 1) Column (skip if already present)
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

-- 2) Backfill from legacy STEP_NO when JSON column is null
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

-- 3) Optional CHECK: valid JSON only (skip if constraint already exists)
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
