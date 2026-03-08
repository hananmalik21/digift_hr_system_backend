-------------------------------------------------------------------------------
-- Trigger: ENT.TRG_JOB_LEVEL_GRADE_RANGE
-- Table:  ENT.JOB_LEVELS
--
-- Purpose:
--   Validates MIN_GRADE_ID and MAX_GRADE_ID so that:
--   1. Both grades belong to the same family (same prefix in GRADE_NUMBER).
--   2. Max grade rank >= min grade rank (numeric suffix comparison only).
--
-- Rules:
--   GRADE_NUMBER format: prefix (e.g. P, M, EX) + numeric rank (e.g. 1, 2).
--   Does NOT convert full GRADE_NUMBER to number (avoids ORA-06502).
--
-- Performance:
--   WHEN clause fires only when both IDs are set and (on UPDATE) either changed.
--   When MIN_GRADE_ID = MAX_GRADE_ID, one SELECT and no rank comparison.
--
-- Error codes:
--   -20001: Min and max grade must belong to same grade family.
--   -20002: Max grade must be greater than or equal to min grade.
--   -20003: Invalid min or max grade ID (not found in ENT.GRADES).
--
-- Run as ENT or a user with privilege to create triggers on ENT.JOB_LEVELS.
-------------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER ENT.TRG_JOB_LEVEL_GRADE_RANGE
  BEFORE INSERT OR UPDATE OF MIN_GRADE_ID, MAX_GRADE_ID ON ENT.JOB_LEVELS
  FOR EACH ROW
  WHEN (
    NEW.MIN_GRADE_ID IS NOT NULL
    AND NEW.MAX_GRADE_ID IS NOT NULL
    AND (
      INSERTING
      OR OLD.MIN_GRADE_ID != NEW.MIN_GRADE_ID
      OR OLD.MAX_GRADE_ID != NEW.MAX_GRADE_ID
    )
  )
DECLARE
  c_err_different_family CONSTANT PLS_INTEGER := -20001;
  c_err_max_lt_min       CONSTANT PLS_INTEGER := -20002;
  c_err_grade_not_found  CONSTANT PLS_INTEGER := -20003;

  v_min_grade_number VARCHAR2(20);
  v_max_grade_number VARCHAR2(20);
  v_min_prefix       VARCHAR2(20);
  v_max_prefix       VARCHAR2(20);
  v_min_rank         NUMBER;
  v_max_rank         NUMBER;
  v_same_grade       BOOLEAN;
BEGIN
  v_same_grade := (:NEW.MIN_GRADE_ID = :NEW.MAX_GRADE_ID);

  BEGIN
    IF v_same_grade THEN
      SELECT TRIM(GRADE_NUMBER) INTO v_min_grade_number
        FROM ENT.GRADES WHERE GRADE_ID = :NEW.MIN_GRADE_ID;
      v_max_grade_number := v_min_grade_number;
    ELSE
      SELECT TRIM(gmin.GRADE_NUMBER), TRIM(gmax.GRADE_NUMBER)
        INTO v_min_grade_number, v_max_grade_number
        FROM ENT.GRADES gmin
        JOIN ENT.GRADES gmax ON gmax.GRADE_ID = :NEW.MAX_GRADE_ID
       WHERE gmin.GRADE_ID = :NEW.MIN_GRADE_ID;
    END IF;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(c_err_grade_not_found,
        'Min Grade and Max Grade must reference existing grades in ENT.GRADES');
    WHEN TOO_MANY_ROWS THEN
      RAISE_APPLICATION_ERROR(c_err_grade_not_found,
        'Invalid grade reference: duplicate or invalid grade ID');
  END;

  IF v_same_grade THEN
    RETURN;  /* Same grade: no family/rank comparison needed */
  END IF;

  v_min_prefix := UPPER(REGEXP_SUBSTR(v_min_grade_number, '^[A-Z]+'));
  v_max_prefix := UPPER(REGEXP_SUBSTR(v_max_grade_number, '^[A-Z]+'));

  IF v_min_prefix IS NULL OR v_max_prefix IS NULL OR v_min_prefix != v_max_prefix THEN
    RAISE_APPLICATION_ERROR(c_err_different_family,
      'Min Grade and Max Grade must belong to same grade family');
  END IF;

  v_min_rank := NVL(TO_NUMBER(REGEXP_SUBSTR(v_min_grade_number, '[0-9]+$')), 0);
  v_max_rank := NVL(TO_NUMBER(REGEXP_SUBSTR(v_max_grade_number, '[0-9]+$')), 0);

  IF v_max_rank < v_min_rank THEN
    RAISE_APPLICATION_ERROR(c_err_max_lt_min,
      'Max Grade must be greater than or equal to Min Grade');
  END IF;
END;
/
