CREATE OR REPLACE PACKAGE BODY PAY.PAY_ELEMENT_SCOPE_RULES_PKG AS

  C_SCOPE_ASSIGNMENT          CONSTANT VARCHAR2(30) := 'ASSIGNMENT';
  C_SCOPE_PAYROLL_REL         CONSTANT VARCHAR2(30) := 'PAYROLL_RELATIONSHIP';
  C_SCOPE_LEGAL_EMPLOYER      CONSTANT VARCHAR2(30) := 'LEGAL_EMPLOYER';
  C_SCOPE_ENTERPRISE          CONSTANT VARCHAR2(30) := 'ENTERPRISE';

  ---------------------------------------------------------------------------
  -- GUID helpers
  ---------------------------------------------------------------------------
  FUNCTION GUID_TO_RAW(P_GUID IN VARCHAR2, P_FIELD_NAME IN VARCHAR2 DEFAULT 'Scope Rule') RETURN RAW IS
    L_HEX VARCHAR2(32);
    L_LABEL VARCHAR2(100);
  BEGIN
    IF P_GUID IS NULL OR TRIM(P_GUID) IS NULL THEN
      RETURN NULL;
    END IF;

    L_LABEL := NVL(NULLIF(TRIM(P_FIELD_NAME), ''), 'Scope Rule');
    L_HEX := REPLACE(UPPER(TRIM(P_GUID)), '-', '');

    IF LENGTH(L_HEX) <> 32 OR NOT REGEXP_LIKE(L_HEX, '^[0-9A-F]+$') THEN
      RAISE_APPLICATION_ERROR(-20702, 'Invalid ' || L_LABEL || ' GUID format.');
    END IF;

    RETURN HEXTORAW(L_HEX);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE BETWEEN -20999 AND -20000 THEN
        RAISE;
      END IF;
      RAISE_APPLICATION_ERROR(-20702, 'Invalid ' || L_LABEL || ' GUID format.');
  END GUID_TO_RAW;

  FUNCTION RAW_TO_GUID(P_RAW IN RAW) RETURN VARCHAR2 IS
  BEGIN
    IF P_RAW IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN LOWER(RAWTOHEX(P_RAW));
  END RAW_TO_GUID;

  ---------------------------------------------------------------------------
  -- Error mapping
  ---------------------------------------------------------------------------
  FUNCTION FRIENDLY_ERROR RETURN VARCHAR2 IS
  BEGIN
    IF SQLCODE BETWEEN -20999 AND -20000 THEN
      RETURN REGEXP_REPLACE(SQLERRM, '^ORA-[0-9]+: ', '');
    END IF;

    CASE SQLCODE
      WHEN -1 THEN RETURN 'Scope rule already exists for this element.';
      WHEN -2291 THEN RETURN 'Invalid reference data.';
      WHEN -2292 THEN RETURN 'Scope rule cannot be deleted because related records exist.';
      WHEN -1400 THEN RETURN 'Required field is missing.';
      WHEN -12899 THEN RETURN 'Entered value is too long.';
      WHEN -1722 THEN RETURN 'Invalid number value.';
      WHEN -6502 THEN RETURN 'Invalid value type or length.';
      WHEN -40441 THEN RETURN 'Invalid JSON payload.';
      ELSE RETURN 'Database error: ' || SQLERRM;
    END CASE;
  END FRIENDLY_ERROR;

  ---------------------------------------------------------------------------
  -- Scope level validation
  ---------------------------------------------------------------------------
  PROCEDURE VALIDATE_SCOPE_LEVEL(P_SCOPE_LEVEL_CODE IN VARCHAR2) IS
    L_CODE VARCHAR2(30);
  BEGIN
    IF P_SCOPE_LEVEL_CODE IS NULL OR TRIM(P_SCOPE_LEVEL_CODE) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20704, 'Scope level code is required.');
    END IF;

    L_CODE := UPPER(TRIM(P_SCOPE_LEVEL_CODE));

    IF L_CODE NOT IN (
         C_SCOPE_ASSIGNMENT,
         C_SCOPE_PAYROLL_REL,
         C_SCOPE_LEGAL_EMPLOYER,
         C_SCOPE_ENTERPRISE
       ) THEN
      RAISE_APPLICATION_ERROR(
        -20713,
        'scope_level_code must be one of: ASSIGNMENT, PAYROLL_RELATIONSHIP, LEGAL_EMPLOYER, ENTERPRISE.'
      );
    END IF;
  END VALIDATE_SCOPE_LEVEL;

  ---------------------------------------------------------------------------
  -- Reference validation (only when value is provided)
  ---------------------------------------------------------------------------
  PROCEDURE VALIDATE_REFERENCES (
      P_ELEMENT_ID          IN NUMBER,
      P_PAYROLL_ID          IN NUMBER,
      P_LEGAL_EMPLOYER_ID   IN RAW,
      P_ORG_UNIT_ID         IN RAW,
      P_GRADE_ID            IN NUMBER,
      P_POSITION_ID         IN RAW
  ) IS
    L_COUNT NUMBER;
  BEGIN
    IF P_ELEMENT_ID IS NULL THEN
      RAISE_APPLICATION_ERROR(-20703, 'Element is required.');
    END IF;

    SELECT COUNT(*)
      INTO L_COUNT
      FROM PAY.PAY_ELEMENTS
     WHERE ELEMENT_ID = P_ELEMENT_ID;

    IF L_COUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20705, 'Selected element does not exist.');
    END IF;

    IF P_PAYROLL_ID IS NOT NULL THEN
      SELECT COUNT(*)
        INTO L_COUNT
        FROM PAY.PAYROLL_DEFINITIONS
       WHERE PAYROLL_ID = P_PAYROLL_ID;

      IF L_COUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20707, 'Selected payroll does not exist.');
      END IF;
    END IF;

    IF P_LEGAL_EMPLOYER_ID IS NOT NULL THEN
      SELECT COUNT(*)
        INTO L_COUNT
        FROM ENT.ORG_UNITS
       WHERE ORG_UNIT_ID = P_LEGAL_EMPLOYER_ID;

      IF L_COUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20708, 'Selected legal employer does not exist.');
      END IF;
    END IF;

    IF P_ORG_UNIT_ID IS NOT NULL THEN
      SELECT COUNT(*)
        INTO L_COUNT
        FROM ENT.ORG_UNITS
       WHERE ORG_UNIT_ID = P_ORG_UNIT_ID;

      IF L_COUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20709, 'Selected organization unit does not exist.');
      END IF;
    END IF;

    IF P_GRADE_ID IS NOT NULL THEN
      SELECT COUNT(*)
        INTO L_COUNT
        FROM ENT.GRADES
       WHERE GRADE_ID = P_GRADE_ID;

      IF L_COUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20710, 'Selected grade does not exist.');
      END IF;
    END IF;

    IF P_POSITION_ID IS NOT NULL THEN
      SELECT COUNT(*)
        INTO L_COUNT
        FROM ENT.POSITIONS
       WHERE POSITION_ID = P_POSITION_ID;

      IF L_COUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20711, 'Selected position does not exist.');
      END IF;
    END IF;
  END VALIDATE_REFERENCES;

  ---------------------------------------------------------------------------
  -- JSON helpers
  ---------------------------------------------------------------------------
  FUNCTION JSON_GUID_FROM_PAYLOAD(
      P_JSON       IN CLOB,
      P_PATH       IN VARCHAR2,
      P_FIELD_NAME IN VARCHAR2
  ) RETURN RAW IS
    L_TEXT VARCHAR2(4000);
  BEGIN
    L_TEXT := JSON_VALUE(P_JSON, P_PATH RETURNING VARCHAR2 NULL ON ERROR);
    RETURN GUID_TO_RAW(L_TEXT, P_FIELD_NAME);
  END JSON_GUID_FROM_PAYLOAD;

  ---------------------------------------------------------------------------
  -- CREATE
  ---------------------------------------------------------------------------
  PROCEDURE CREATE_SCOPE_RULE (
      P_PAYLOAD_JSON      IN  CLOB,
      P_CREATED_BY        IN  VARCHAR2,
      P_SCOPE_RULE_ID     OUT NUMBER,
      P_SCOPE_RULE_GUID   OUT VARCHAR2,
      P_STATUS            OUT VARCHAR2,
      P_MESSAGE           OUT VARCHAR2
  ) IS
    L_GUID              RAW(16) := SYS_GUID();
    L_ELEMENT_ID        NUMBER;
    L_PAYROLL_ID        NUMBER;
    L_LEGAL_EMPLOYER_ID RAW(16);
    L_ORG_UNIT_ID       RAW(16);
    L_GRADE_ID          NUMBER;
    L_POSITION_ID       RAW(16);
    L_SCOPE_LEVEL_CODE  VARCHAR2(30);
  BEGIN
    P_STATUS  := 'ERROR';
    P_MESSAGE := NULL;

    IF P_PAYLOAD_JSON IS NULL OR TRIM(P_PAYLOAD_JSON) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20712, 'Payload JSON is required.');
    END IF;

    L_ELEMENT_ID := JSON_VALUE(P_PAYLOAD_JSON, '$.element_id' RETURNING NUMBER NULL ON ERROR);
    L_SCOPE_LEVEL_CODE := JSON_VALUE(P_PAYLOAD_JSON, '$.scope_level_code' RETURNING VARCHAR2 NULL ON ERROR);
    L_PAYROLL_ID := JSON_VALUE(P_PAYLOAD_JSON, '$.payroll_id' RETURNING NUMBER NULL ON ERROR);
    L_LEGAL_EMPLOYER_ID := JSON_GUID_FROM_PAYLOAD(P_PAYLOAD_JSON, '$.legal_employer_id', 'legal_employer_id');
    L_ORG_UNIT_ID := JSON_GUID_FROM_PAYLOAD(P_PAYLOAD_JSON, '$.org_unit_id', 'org_unit_id');
    L_GRADE_ID := JSON_VALUE(P_PAYLOAD_JSON, '$.grade_id' RETURNING NUMBER NULL ON ERROR);
    L_POSITION_ID := JSON_GUID_FROM_PAYLOAD(P_PAYLOAD_JSON, '$.position_id', 'position_id');

    VALIDATE_SCOPE_LEVEL(L_SCOPE_LEVEL_CODE);

    VALIDATE_REFERENCES(
      P_ELEMENT_ID        => L_ELEMENT_ID,
      P_PAYROLL_ID        => L_PAYROLL_ID,
      P_LEGAL_EMPLOYER_ID => L_LEGAL_EMPLOYER_ID,
      P_ORG_UNIT_ID       => L_ORG_UNIT_ID,
      P_GRADE_ID          => L_GRADE_ID,
      P_POSITION_ID       => L_POSITION_ID
    );

    INSERT INTO PAY.PAY_ELEMENT_SCOPE_RULES (
        SCOPE_RULE_GUID,
        ELEMENT_ID,
        SCOPE_LEVEL_CODE,
        PAYROLL_ID,
        LEGAL_EMPLOYER_ID,
        ORG_UNIT_ID,
        GRADE_ID,
        POSITION_ID,
        CREATED_BY,
        CREATION_DATE
    )
    VALUES (
        L_GUID,
        L_ELEMENT_ID,
        UPPER(TRIM(L_SCOPE_LEVEL_CODE)),
        L_PAYROLL_ID,
        L_LEGAL_EMPLOYER_ID,
        L_ORG_UNIT_ID,
        L_GRADE_ID,
        L_POSITION_ID,
        NVL(NULLIF(TRIM(P_CREATED_BY), ''), 'SYSTEM'),
        SYSDATE
    )
    RETURNING SCOPE_RULE_ID INTO P_SCOPE_RULE_ID;

    P_SCOPE_RULE_GUID := RAW_TO_GUID(L_GUID);
    P_STATUS          := 'SUCCESS';
    P_MESSAGE         := 'Scope rule created successfully.';

  EXCEPTION
    WHEN OTHERS THEN
      P_STATUS  := 'ERROR';
      P_MESSAGE := FRIENDLY_ERROR;
  END CREATE_SCOPE_RULE;

  ---------------------------------------------------------------------------
  -- UPDATE
  ---------------------------------------------------------------------------
  PROCEDURE UPDATE_SCOPE_RULE (
      P_SCOPE_RULE_GUID   IN  VARCHAR2,
      P_PAYLOAD_JSON      IN  CLOB,
      P_UPDATED_BY        IN  VARCHAR2,
      P_STATUS            OUT VARCHAR2,
      P_MESSAGE           OUT VARCHAR2
  ) IS
    L_ID                NUMBER;
    L_GUID_RAW          RAW(16);
    L_ELEMENT_ID        NUMBER;
    L_PAYROLL_ID        NUMBER;
    L_LEGAL_EMPLOYER_ID RAW(16);
    L_ORG_UNIT_ID       RAW(16);
    L_GRADE_ID          NUMBER;
    L_POSITION_ID       RAW(16);
    L_SCOPE_LEVEL_CODE  VARCHAR2(30);
  BEGIN
    P_STATUS  := 'ERROR';
    P_MESSAGE := NULL;

    IF P_SCOPE_RULE_GUID IS NULL OR TRIM(P_SCOPE_RULE_GUID) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20701, 'Scope Rule GUID is required.');
    END IF;

    IF P_PAYLOAD_JSON IS NULL OR TRIM(P_PAYLOAD_JSON) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20712, 'Payload JSON is required.');
    END IF;

    L_GUID_RAW := GUID_TO_RAW(P_SCOPE_RULE_GUID);

    SELECT SCOPE_RULE_ID,
           ELEMENT_ID,
           SCOPE_LEVEL_CODE,
           PAYROLL_ID,
           LEGAL_EMPLOYER_ID,
           ORG_UNIT_ID,
           GRADE_ID,
           POSITION_ID
      INTO L_ID,
           L_ELEMENT_ID,
           L_SCOPE_LEVEL_CODE,
           L_PAYROLL_ID,
           L_LEGAL_EMPLOYER_ID,
           L_ORG_UNIT_ID,
           L_GRADE_ID,
           L_POSITION_ID
      FROM PAY.PAY_ELEMENT_SCOPE_RULES
     WHERE SCOPE_RULE_GUID = L_GUID_RAW;

    IF JSON_EXISTS(P_PAYLOAD_JSON, '$.scope_level_code') THEN
      L_SCOPE_LEVEL_CODE := JSON_VALUE(P_PAYLOAD_JSON, '$.scope_level_code' RETURNING VARCHAR2 NULL ON ERROR);
      VALIDATE_SCOPE_LEVEL(L_SCOPE_LEVEL_CODE);
      L_SCOPE_LEVEL_CODE := UPPER(TRIM(L_SCOPE_LEVEL_CODE));
    END IF;

    IF JSON_EXISTS(P_PAYLOAD_JSON, '$.payroll_id') THEN
      L_PAYROLL_ID := JSON_VALUE(P_PAYLOAD_JSON, '$.payroll_id' RETURNING NUMBER NULL ON ERROR);
    END IF;

    IF JSON_EXISTS(P_PAYLOAD_JSON, '$.legal_employer_id') THEN
      L_LEGAL_EMPLOYER_ID := JSON_GUID_FROM_PAYLOAD(P_PAYLOAD_JSON, '$.legal_employer_id', 'legal_employer_id');
    END IF;

    IF JSON_EXISTS(P_PAYLOAD_JSON, '$.org_unit_id') THEN
      L_ORG_UNIT_ID := JSON_GUID_FROM_PAYLOAD(P_PAYLOAD_JSON, '$.org_unit_id', 'org_unit_id');
    END IF;

    IF JSON_EXISTS(P_PAYLOAD_JSON, '$.grade_id') THEN
      L_GRADE_ID := JSON_VALUE(P_PAYLOAD_JSON, '$.grade_id' RETURNING NUMBER NULL ON ERROR);
    END IF;

    IF JSON_EXISTS(P_PAYLOAD_JSON, '$.position_id') THEN
      L_POSITION_ID := JSON_GUID_FROM_PAYLOAD(P_PAYLOAD_JSON, '$.position_id', 'position_id');
    END IF;

    VALIDATE_REFERENCES(
      P_ELEMENT_ID        => L_ELEMENT_ID,
      P_PAYROLL_ID        => L_PAYROLL_ID,
      P_LEGAL_EMPLOYER_ID => L_LEGAL_EMPLOYER_ID,
      P_ORG_UNIT_ID       => L_ORG_UNIT_ID,
      P_GRADE_ID          => L_GRADE_ID,
      P_POSITION_ID       => L_POSITION_ID
    );

    UPDATE PAY.PAY_ELEMENT_SCOPE_RULES
       SET SCOPE_LEVEL_CODE  = L_SCOPE_LEVEL_CODE,
           PAYROLL_ID        = L_PAYROLL_ID,
           LEGAL_EMPLOYER_ID = L_LEGAL_EMPLOYER_ID,
           ORG_UNIT_ID       = L_ORG_UNIT_ID,
           GRADE_ID          = L_GRADE_ID,
           POSITION_ID       = L_POSITION_ID,
           LAST_UPDATED_BY   = NVL(NULLIF(TRIM(P_UPDATED_BY), ''), 'SYSTEM'),
           LAST_UPDATE_DATE  = SYSDATE
     WHERE SCOPE_RULE_ID = L_ID;

    P_STATUS  := 'SUCCESS';
    P_MESSAGE := 'Scope rule updated successfully.';

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      P_STATUS  := 'ERROR';
      P_MESSAGE := 'Scope rule not found.';
    WHEN OTHERS THEN
      P_STATUS  := 'ERROR';
      P_MESSAGE := FRIENDLY_ERROR;
  END UPDATE_SCOPE_RULE;

  ---------------------------------------------------------------------------
  -- DELETE
  ---------------------------------------------------------------------------
  PROCEDURE DELETE_SCOPE_RULE (
      P_SCOPE_RULE_GUID   IN  VARCHAR2,
      P_DELETED_BY        IN  VARCHAR2,
      P_STATUS            OUT VARCHAR2,
      P_MESSAGE           OUT VARCHAR2
  ) IS
    L_ID       NUMBER;
    L_GUID_RAW RAW(16);
  BEGIN
    P_STATUS  := 'ERROR';
    P_MESSAGE := NULL;

    IF P_SCOPE_RULE_GUID IS NULL OR TRIM(P_SCOPE_RULE_GUID) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20701, 'Scope Rule GUID is required.');
    END IF;

    L_GUID_RAW := GUID_TO_RAW(P_SCOPE_RULE_GUID);

    SELECT SCOPE_RULE_ID
      INTO L_ID
      FROM PAY.PAY_ELEMENT_SCOPE_RULES
     WHERE SCOPE_RULE_GUID = L_GUID_RAW;

    DELETE FROM PAY.PAY_ELEMENT_SCOPE_RULES
     WHERE SCOPE_RULE_ID = L_ID;

    P_STATUS  := 'SUCCESS';
    P_MESSAGE := 'Scope rule deleted successfully.';

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      P_STATUS  := 'ERROR';
      P_MESSAGE := 'Scope rule not found.';
    WHEN OTHERS THEN
      P_STATUS  := 'ERROR';
      P_MESSAGE := FRIENDLY_ERROR;
  END DELETE_SCOPE_RULE;

END PAY_ELEMENT_SCOPE_RULES_PKG;
/
