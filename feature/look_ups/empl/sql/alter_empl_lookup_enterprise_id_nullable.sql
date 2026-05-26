-- Migration: optional ENTERPRISE_ID on EMPL lookup tables (NULL = global).
-- Run when POST /api/empl/lookup-types or /api/empl/lookup-values fails with
-- ORA-01400 (cannot insert NULL) or NOT NULL constraint on ENTERPRISE_ID.
--
-- API rule: omit enterprise_id, send null, or send "" => global row (ENTERPRISE_ID IS NULL).

-- ---------------------------------------------------------------------------
-- 1) Allow NULL on ENTERPRISE_ID
-- ---------------------------------------------------------------------------
ALTER TABLE EMPL.EMPL_LOOKUP_TYPES MODIFY (ENTERPRISE_ID NULL);
ALTER TABLE EMPL.EMPL_LOOKUP_VALUES MODIFY (ENTERPRISE_ID NULL);

-- ---------------------------------------------------------------------------
-- 2) Inspect existing unique constraints (adjust DROP names from your DB)
-- ---------------------------------------------------------------------------
SELECT c.constraint_name, c.constraint_type, cc.column_name, cc.position
  FROM all_constraints c
  JOIN all_cons_columns cc
    ON c.owner = cc.owner AND c.constraint_name = cc.constraint_name
 WHERE c.table_name IN ('EMPL_LOOKUP_TYPES', 'EMPL_LOOKUP_VALUES')
   AND c.owner = 'EMPL'
   AND c.constraint_type IN ('U', 'P')
 ORDER BY c.table_name, c.constraint_name, cc.position;

-- ---------------------------------------------------------------------------
-- 3) EMPL_LOOKUP_TYPES — scope-aware uniqueness on TYPE_CODE
--    Drop old UK that ignores NULL enterprise (or TYPE_CODE-only), then add:
-- ---------------------------------------------------------------------------
-- Example (replace UK_EMPL_LOOKUP_TYPES_* with name from step 2):
-- ALTER TABLE EMPL.EMPL_LOOKUP_TYPES DROP CONSTRAINT UK_EMPL_LOOKUP_TYPES_ENT_CODE;

CREATE UNIQUE INDEX EMPL.UK_EMPL_LOOKUP_TYPES_SCOPE_CODE
  ON EMPL.EMPL_LOOKUP_TYPES (NVL(ENTERPRISE_ID, -1), TYPE_CODE);

-- ---------------------------------------------------------------------------
-- 4) EMPL_LOOKUP_VALUES — scope-aware uniqueness on LOOKUP_TYPE + LOOKUP_CODE
-- ---------------------------------------------------------------------------
-- Example:
-- ALTER TABLE EMPL.EMPL_LOOKUP_VALUES DROP CONSTRAINT UK_EMPL_LOOKUP_VALUES_*;

CREATE UNIQUE INDEX EMPL.UK_EMPL_LOOKUP_VALUES_SCOPE_TYPE_CODE
  ON EMPL.EMPL_LOOKUP_VALUES (NVL(ENTERPRISE_ID, -1), LOOKUP_TYPE, LOOKUP_CODE);

-- ---------------------------------------------------------------------------
-- 5) Cross-scope rules (DB enforcement)
--    - Global code exists  => cannot create same code for any enterprise
--    - Enterprise code exists => cannot create same code as global
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER EMPL.TRG_EMPL_LOOKUP_TYPES_SCOPE
BEFORE INSERT OR UPDATE OF ENTERPRISE_ID, TYPE_CODE ON EMPL.EMPL_LOOKUP_TYPES
FOR EACH ROW
DECLARE
  v_cnt NUMBER;
BEGIN
  IF :NEW.TYPE_CODE IS NULL OR TRIM(:NEW.TYPE_CODE) IS NULL THEN
    RETURN;
  END IF;

  IF :NEW.ENTERPRISE_ID IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_cnt
      FROM EMPL.EMPL_LOOKUP_TYPES t
     WHERE t.ENTERPRISE_ID IS NULL
       AND UPPER(TRIM(t.TYPE_CODE)) = UPPER(TRIM(:NEW.TYPE_CODE))
       AND (INSERTING OR t.LOOKUP_TYPE_GUID <> :NEW.LOOKUP_TYPE_GUID);
    IF v_cnt > 0 THEN
      RAISE_APPLICATION_ERROR(
        -20010,
        'TYPE_CODE already exists as a global lookup type; cannot duplicate for an enterprise.'
      );
    END IF;
  ELSE
    SELECT COUNT(*)
      INTO v_cnt
      FROM EMPL.EMPL_LOOKUP_TYPES t
     WHERE t.ENTERPRISE_ID IS NOT NULL
       AND UPPER(TRIM(t.TYPE_CODE)) = UPPER(TRIM(:NEW.TYPE_CODE))
       AND (INSERTING OR t.LOOKUP_TYPE_GUID <> :NEW.LOOKUP_TYPE_GUID);
    IF v_cnt > 0 THEN
      RAISE_APPLICATION_ERROR(
        -20011,
        'TYPE_CODE already exists for an enterprise; cannot create as global.'
      );
    END IF;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER EMPL.TRG_EMPL_LOOKUP_VALUES_SCOPE
BEFORE INSERT OR UPDATE OF ENTERPRISE_ID, LOOKUP_TYPE, LOOKUP_CODE ON EMPL.EMPL_LOOKUP_VALUES
FOR EACH ROW
DECLARE
  v_cnt NUMBER;
BEGIN
  IF :NEW.LOOKUP_TYPE IS NULL OR TRIM(:NEW.LOOKUP_TYPE) IS NULL
     OR :NEW.LOOKUP_CODE IS NULL OR TRIM(:NEW.LOOKUP_CODE) IS NULL THEN
    RETURN;
  END IF;

  IF :NEW.ENTERPRISE_ID IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_cnt
      FROM EMPL.EMPL_LOOKUP_VALUES v
     WHERE v.ENTERPRISE_ID IS NULL
       AND UPPER(TRIM(v.LOOKUP_TYPE)) = UPPER(TRIM(:NEW.LOOKUP_TYPE))
       AND UPPER(TRIM(v.LOOKUP_CODE)) = UPPER(TRIM(:NEW.LOOKUP_CODE))
       AND (INSERTING OR v.LOOKUP_GUID <> :NEW.LOOKUP_GUID);
    IF v_cnt > 0 THEN
      RAISE_APPLICATION_ERROR(
        -20012,
        'LOOKUP_CODE already exists as global for this type; cannot duplicate for an enterprise.'
      );
    END IF;
  ELSE
    SELECT COUNT(*)
      INTO v_cnt
      FROM EMPL.EMPL_LOOKUP_VALUES v
     WHERE v.ENTERPRISE_ID IS NOT NULL
       AND UPPER(TRIM(v.LOOKUP_TYPE)) = UPPER(TRIM(:NEW.LOOKUP_TYPE))
       AND UPPER(TRIM(v.LOOKUP_CODE)) = UPPER(TRIM(:NEW.LOOKUP_CODE))
       AND (INSERTING OR v.LOOKUP_GUID <> :NEW.LOOKUP_GUID);
    IF v_cnt > 0 THEN
      RAISE_APPLICATION_ERROR(
        -20013,
        'LOOKUP_CODE already exists for an enterprise; cannot create as global for this type.'
      );
    END IF;
  END IF;
END;
/

COMMIT;
