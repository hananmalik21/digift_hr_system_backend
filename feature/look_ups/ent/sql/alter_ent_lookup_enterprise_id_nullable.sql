-- Migration: optional ENTERPRISE_ID on ENT lookup tables (NULL = global).
-- Run when POST /api/ent/lookup-types or /api/ent/lookup-values fails with
-- ORA-01400 (cannot insert NULL) or NOT NULL constraint on ENTERPRISE_ID.
--
-- API rule: omit enterprise_id, send null, or send "" => global row (ENTERPRISE_ID IS NULL).

ALTER TABLE ENT.ENT_LOOKUP_TYPES MODIFY (ENTERPRISE_ID NULL);
ALTER TABLE ENT.ENT_LOOKUP_VALUES MODIFY (ENTERPRISE_ID NULL);

SELECT c.constraint_name, c.constraint_type, cc.column_name, cc.position
  FROM all_constraints c
  JOIN all_cons_columns cc
    ON c.owner = cc.owner AND c.constraint_name = cc.constraint_name
 WHERE c.table_name IN ('ENT_LOOKUP_TYPES', 'ENT_LOOKUP_VALUES')
   AND c.owner = 'ENT'
   AND c.constraint_type IN ('U', 'P')
 ORDER BY c.table_name, c.constraint_name, cc.position;

-- Drop old UK constraints from step above if they conflict, then:
CREATE UNIQUE INDEX ENT.UK_ENT_LOOKUP_TYPES_SCOPE_CODE
  ON ENT.ENT_LOOKUP_TYPES (NVL(ENTERPRISE_ID, -1), TYPE_CODE);

CREATE UNIQUE INDEX ENT.UK_ENT_LOOKUP_VALUES_SCOPE_TYPE_CODE
  ON ENT.ENT_LOOKUP_VALUES (NVL(ENTERPRISE_ID, -1), LOOKUP_TYPE_ID, LOOKUP_CODE);

CREATE OR REPLACE TRIGGER ENT.TRG_ENT_LOOKUP_TYPES_SCOPE
BEFORE INSERT OR UPDATE OF ENTERPRISE_ID, TYPE_CODE ON ENT.ENT_LOOKUP_TYPES
FOR EACH ROW
DECLARE
  v_cnt       NUMBER;
  v_self_guid RAW(16);
BEGIN
  IF :NEW.TYPE_CODE IS NULL OR TRIM(:NEW.TYPE_CODE) IS NULL THEN
    RETURN;
  END IF;

  v_self_guid := CASE WHEN UPDATING THEN :NEW.LOOKUP_TYPE_GUID END;

  IF :NEW.ENTERPRISE_ID IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_cnt
      FROM ENT.ENT_LOOKUP_TYPES t
     WHERE t.ENTERPRISE_ID IS NULL
       AND UPPER(TRIM(t.TYPE_CODE)) = UPPER(TRIM(:NEW.TYPE_CODE))
       AND (v_self_guid IS NULL OR t.LOOKUP_TYPE_GUID <> v_self_guid);
    IF v_cnt > 0 THEN
      RAISE_APPLICATION_ERROR(
        -20010,
        'TYPE_CODE already exists as a global lookup type; cannot duplicate for an enterprise.'
      );
    END IF;
  ELSE
    SELECT COUNT(*)
      INTO v_cnt
      FROM ENT.ENT_LOOKUP_TYPES t
     WHERE t.ENTERPRISE_ID IS NOT NULL
       AND UPPER(TRIM(t.TYPE_CODE)) = UPPER(TRIM(:NEW.TYPE_CODE))
       AND (v_self_guid IS NULL OR t.LOOKUP_TYPE_GUID <> v_self_guid);
    IF v_cnt > 0 THEN
      RAISE_APPLICATION_ERROR(
        -20011,
        'TYPE_CODE already exists for an enterprise; cannot create as global.'
      );
    END IF;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER ENT.TRG_ENT_LOOKUP_VALUES_SCOPE
BEFORE INSERT OR UPDATE OF ENTERPRISE_ID, LOOKUP_TYPE_ID, LOOKUP_CODE ON ENT.ENT_LOOKUP_VALUES
FOR EACH ROW
DECLARE
  v_cnt       NUMBER;
  v_self_guid RAW(16);
BEGIN
  IF :NEW.LOOKUP_TYPE_ID IS NULL
     OR :NEW.LOOKUP_CODE IS NULL OR TRIM(:NEW.LOOKUP_CODE) IS NULL THEN
    RETURN;
  END IF;

  v_self_guid := CASE WHEN UPDATING THEN :NEW.LOOKUP_GUID END;

  IF :NEW.ENTERPRISE_ID IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_cnt
      FROM ENT.ENT_LOOKUP_VALUES v
     WHERE v.ENTERPRISE_ID IS NULL
       AND v.LOOKUP_TYPE_ID = :NEW.LOOKUP_TYPE_ID
       AND UPPER(TRIM(v.LOOKUP_CODE)) = UPPER(TRIM(:NEW.LOOKUP_CODE))
       AND (v_self_guid IS NULL OR v.LOOKUP_GUID <> v_self_guid);
    IF v_cnt > 0 THEN
      RAISE_APPLICATION_ERROR(
        -20012,
        'LOOKUP_CODE already exists as global for this type; cannot duplicate for an enterprise.'
      );
    END IF;
  ELSE
    SELECT COUNT(*)
      INTO v_cnt
      FROM ENT.ENT_LOOKUP_VALUES v
     WHERE v.ENTERPRISE_ID IS NOT NULL
       AND v.LOOKUP_TYPE_ID = :NEW.LOOKUP_TYPE_ID
       AND UPPER(TRIM(v.LOOKUP_CODE)) = UPPER(TRIM(:NEW.LOOKUP_CODE))
       AND (v_self_guid IS NULL OR v.LOOKUP_GUID <> v_self_guid);
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
