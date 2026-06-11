-- FNDSEC.FNDSEC_ADMIN_SEED_PKG - platform admin seeding / provisioning (DB-centric)
-- Run as FNDSEC.
--
-- ENSURE_PLATFORM_ADMIN       - create or normalize enterprise_admin for one tenant
-- SEED_PLATFORM_ADMINS        - ensure enterprise_admin for the configured seed enterprise
-- BACKFILL_ENTERPRISE_ADMINS  - optional; requires SELECT on ENT.ENTERPRISES (see grants below).
--                               Node backfill (npm run seed:admins:backfill) is preferred and does not need this grant.
--
-- Password hashing stays in the API tier (Argon2). Pass password_hash in input JSON.

CREATE OR REPLACE EDITIONABLE PACKAGE "FNDSEC"."FNDSEC_ADMIN_SEED_PKG" AS

  PROCEDURE ENSURE_PLATFORM_ADMIN (
      P_INPUT_JSON   IN  CLOB,
      P_SUCCESS      OUT VARCHAR2,
      P_MESSAGE      OUT VARCHAR2,
      P_CREATED      OUT VARCHAR2,
      P_USER_GUID    OUT VARCHAR2
  );

  PROCEDURE SEED_PLATFORM_ADMINS (
      P_INPUT_JSON   IN  CLOB,
      P_SUCCESS      OUT VARCHAR2,
      P_MESSAGE      OUT VARCHAR2,
      P_RESULT_JSON  OUT CLOB
  );

  PROCEDURE BACKFILL_ENTERPRISE_ADMINS (
      P_INPUT_JSON   IN  CLOB,
      P_SUCCESS      OUT VARCHAR2,
      P_MESSAGE      OUT VARCHAR2,
      P_RESULT_JSON  OUT CLOB
  );

END FNDSEC_ADMIN_SEED_PKG;
/

CREATE OR REPLACE EDITIONABLE PACKAGE BODY "FNDSEC"."FNDSEC_ADMIN_SEED_PKG" AS

  FUNCTION MSG_INDICATES_SUCCESS(P_MESSAGE IN VARCHAR2) RETURN BOOLEAN IS
  BEGIN
    RETURN REGEXP_LIKE(NVL(P_MESSAGE, ''), 'successfully', 'i');
  END;

  FUNCTION NORMALIZE_GUID_HEX(P_GUID IN VARCHAR2) RETURN VARCHAR2 IS
    L_HEX VARCHAR2(128);
  BEGIN
    IF P_GUID IS NULL THEN
      RETURN NULL;
    END IF;
    L_HEX := LOWER(REPLACE(TRIM(P_GUID), '-', ''));
    IF LENGTH(L_HEX) = 32 AND REGEXP_LIKE(L_HEX, '^[0-9a-f]{32}$') THEN
      RETURN L_HEX;
    END IF;
    RETURN NULL;
  END;

  FUNCTION JSON_BOOL(P_JSON IN CLOB, P_PATH IN VARCHAR2, P_DEFAULT IN BOOLEAN) RETURN BOOLEAN IS
    L_VAL VARCHAR2(10);
  BEGIN
    L_VAL := LOWER(TRIM(JSON_VALUE(P_JSON, P_PATH)));
    IF L_VAL IS NULL THEN
      RETURN P_DEFAULT;
    END IF;
    IF L_VAL IN ('true', '1', 'yes', 'y') THEN
      RETURN TRUE;
    END IF;
    IF L_VAL IN ('false', '0', 'no', 'n') THEN
      RETURN FALSE;
    END IF;
    RETURN P_DEFAULT;
  END;

  FUNCTION BOOL_TO_JSON(P_FLAG IN BOOLEAN) RETURN VARCHAR2 IS
  BEGIN
    IF P_FLAG THEN
      RETURN 'true';
    END IF;
    RETURN 'false';
  END;

  FUNCTION RESOLVE_ENTERPRISE_ADMIN_EMAIL(
      P_INPUT_JSON         IN CLOB,
      P_ENTERPRISE_ID      IN NUMBER,
      P_SEED_ENTERPRISE_ID IN NUMBER
  ) RETURN VARCHAR2 IS
    L_EMAIL VARCHAR2(320);
  BEGIN
    IF P_ENTERPRISE_ID = P_SEED_ENTERPRISE_ID THEN
      L_EMAIL := TRIM(JSON_VALUE(P_INPUT_JSON, '$.enterprise_admin.user.primary_email'));
      IF L_EMAIL IS NULL THEN
        L_EMAIL := TRIM(JSON_VALUE(P_INPUT_JSON, '$.user.primary_email'));
      END IF;
      IF L_EMAIL IS NOT NULL THEN
        RETURN L_EMAIL;
      END IF;
    END IF;
    RETURN 'enterprise_admin+' || TO_CHAR(P_ENTERPRISE_ID) || '@localhost.local';
  END;

  FUNCTION JSON_PROFILE_VALUE(
      P_INPUT_JSON IN CLOB,
      P_ADMIN_TYPE IN VARCHAR2,
      P_FIELD      IN VARCHAR2
  ) RETURN VARCHAR2 IS
    L_PATH VARCHAR2(200);
    L_VAL  VARCHAR2(4000);
  BEGIN
    L_PATH := '$.' || P_ADMIN_TYPE || '.user.' || P_FIELD;
    L_VAL := TRIM(JSON_VALUE(P_INPUT_JSON, L_PATH));
    IF L_VAL IS NOT NULL THEN
      RETURN L_VAL;
    END IF;
    RETURN TRIM(JSON_VALUE(P_INPUT_JSON, '$.user.' || P_FIELD));
  END;

  PROCEDURE RESOLVE_ADMIN_PROFILE(
      P_INPUT_JSON         IN CLOB,
      P_ADMIN_TYPE         IN VARCHAR2,
      P_ENTERPRISE_ID      IN NUMBER,
      P_SEED_ENTERPRISE_ID IN NUMBER,
      P_USER_CODE          OUT VARCHAR2,
      P_USERNAME           OUT VARCHAR2,
      P_PRIMARY_EMAIL      OUT VARCHAR2,
      P_FIRST_NAME         OUT VARCHAR2,
      P_LAST_NAME          OUT VARCHAR2
  ) IS
    L_TYPE VARCHAR2(30) := LOWER(TRIM(P_ADMIN_TYPE));
  BEGIN
    IF L_TYPE = 'enterprise_admin' THEN
      P_USER_CODE     := NVL(JSON_PROFILE_VALUE(P_INPUT_JSON, 'enterprise_admin', 'user_code'), 'enterprise_admin');
      P_USERNAME      := NVL(JSON_PROFILE_VALUE(P_INPUT_JSON, 'enterprise_admin', 'username'), 'enterprise_admin');
      P_PRIMARY_EMAIL := RESOLVE_ENTERPRISE_ADMIN_EMAIL(P_INPUT_JSON, P_ENTERPRISE_ID, P_SEED_ENTERPRISE_ID);
      P_FIRST_NAME    := NVL(JSON_PROFILE_VALUE(P_INPUT_JSON, 'enterprise_admin', 'first_name'), 'Enterprise');
      P_LAST_NAME     := NVL(JSON_PROFILE_VALUE(P_INPUT_JSON, 'enterprise_admin', 'last_name'), 'Admin');
    ELSE
      RAISE_APPLICATION_ERROR(-20001, 'admin_type must be enterprise_admin');
    END IF;
  END;

  FUNCTION FIND_ADMIN_USER(
      P_ENTERPRISE_ID IN NUMBER,
      P_USERNAME      IN VARCHAR2,
      P_EMAIL         IN VARCHAR2
  ) RETURN VARCHAR2 IS
    L_GUID_HEX VARCHAR2(32);
  BEGIN
    SELECT LOWER(RAWTOHEX(USER_GUID))
      INTO L_GUID_HEX
      FROM FNDSEC.FNDSEC_USERS
     WHERE ENTERPRISE_ID = P_ENTERPRISE_ID
       AND (
             LOWER(USERNAME) = LOWER(TRIM(P_USERNAME))
          OR LOWER(PRIMARY_EMAIL) = LOWER(TRIM(P_EMAIL))
       )
       AND ROWNUM = 1;

    RETURN NORMALIZE_GUID_HEX(L_GUID_HEX);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RETURN NULL;
  END;

  PROCEDURE NORMALIZE_ADMIN_USER(
      P_ENTERPRISE_ID IN NUMBER,
      P_USER_GUID_HEX IN VARCHAR2,
      P_MESSAGE       OUT VARCHAR2
  ) IS
    L_UPDATE_JSON CLOB;
  BEGIN
    SELECT JSON_OBJECT(
             'user_guid'              VALUE P_USER_GUID_HEX,
             'enterprise_id'          VALUE P_ENTERPRISE_ID,
             'employee_id'            VALUE NULL,
             'reports_to_employee_id' VALUE NULL,
             'employee_type'          VALUE NULL,
             'role_assignments'       VALUE JSON_ARRAY()
             RETURNING CLOB
           )
      INTO L_UPDATE_JSON
      FROM DUAL;

    FNDSEC.FNDSEC_USERS_PKG.UPDATE_USER(
      P_INPUT_JSON => L_UPDATE_JSON,
      P_MESSAGE    => P_MESSAGE
    );
  END;

  PROCEDURE CREATE_ADMIN_USER(
      P_ENTERPRISE_ID  IN NUMBER,
      P_USER_CODE      IN VARCHAR2,
      P_USERNAME       IN VARCHAR2,
      P_FIRST_NAME     IN VARCHAR2,
      P_LAST_NAME      IN VARCHAR2,
      P_PRIMARY_EMAIL  IN VARCHAR2,
      P_PASSWORD_HASH  IN VARCHAR2,
      P_MESSAGE        OUT VARCHAR2,
      P_USER_GUID      OUT VARCHAR2
  ) IS
    L_CREATE_JSON CLOB;
    L_USER_ID     NUMBER;
    L_GUID_OUT    VARCHAR2(128);
  BEGIN
    SELECT JSON_OBJECT(
             'enterprise_id'          VALUE P_ENTERPRISE_ID,
             'user_code'              VALUE P_USER_CODE,
             'username'               VALUE P_USERNAME,
             'first_name'             VALUE P_FIRST_NAME,
             'last_name'              VALUE P_LAST_NAME,
             'primary_email'          VALUE P_PRIMARY_EMAIL,
             'password_hash'          VALUE P_PASSWORD_HASH,
             'employee_id'            VALUE NULL,
             'reports_to_employee_id' VALUE NULL,
             'employee_type'          VALUE NULL,
             'role_assignments'       VALUE JSON_ARRAY()
             RETURNING CLOB
           )
      INTO L_CREATE_JSON
      FROM DUAL;

    FNDSEC.FNDSEC_USERS_PKG.CREATE_USER(
      P_INPUT_JSON => L_CREATE_JSON,
      P_MESSAGE    => P_MESSAGE,
      P_USER_ID    => L_USER_ID,
      P_USER_GUID  => L_GUID_OUT
    );

    P_USER_GUID := NORMALIZE_GUID_HEX(L_GUID_OUT);
  END;

  PROCEDURE ENSURE_PLATFORM_ADMIN (
      P_INPUT_JSON   IN  CLOB,
      P_SUCCESS      OUT VARCHAR2,
      P_MESSAGE      OUT VARCHAR2,
      P_CREATED      OUT VARCHAR2,
      P_USER_GUID    OUT VARCHAR2
  ) IS
    L_ENTERPRISE_ID      NUMBER;
    L_SEED_ENTERPRISE_ID NUMBER;
    L_ADMIN_TYPE         VARCHAR2(30);
    L_PASSWORD_HASH      VARCHAR2(4000);
    L_SKIP_IF_EXISTS     BOOLEAN;
    L_USER_CODE          VARCHAR2(100);
    L_USERNAME           VARCHAR2(100);
    L_PRIMARY_EMAIL      VARCHAR2(320);
    L_FIRST_NAME         VARCHAR2(200);
    L_LAST_NAME          VARCHAR2(200);
    L_GUID_HEX           VARCHAR2(32);
    L_PKG_MSG            VARCHAR2(4000);
    L_CREATED            BOOLEAN := FALSE;
  BEGIN
    P_SUCCESS   := 'N';
    P_CREATED   := 'N';
    P_USER_GUID := NULL;
    P_MESSAGE   := NULL;

    IF P_INPUT_JSON IS NULL OR DBMS_LOB.GETLENGTH(P_INPUT_JSON) = 0 THEN
      P_MESSAGE := 'input JSON is required';
      RETURN;
    END IF;

    L_ENTERPRISE_ID := TO_NUMBER(JSON_VALUE(P_INPUT_JSON, '$.enterprise_id'));
    IF L_ENTERPRISE_ID IS NULL OR L_ENTERPRISE_ID <= 0 THEN
      P_MESSAGE := 'enterprise_id must be a positive integer';
      RETURN;
    END IF;

    L_SEED_ENTERPRISE_ID := TO_NUMBER(JSON_VALUE(P_INPUT_JSON, '$.seed_enterprise_id'));
    IF L_SEED_ENTERPRISE_ID IS NULL OR L_SEED_ENTERPRISE_ID <= 0 THEN
      L_SEED_ENTERPRISE_ID := L_ENTERPRISE_ID;
    END IF;

    L_ADMIN_TYPE := LOWER(TRIM(JSON_VALUE(P_INPUT_JSON, '$.admin_type')));
    IF L_ADMIN_TYPE != 'enterprise_admin' THEN
      P_MESSAGE := 'admin_type must be enterprise_admin';
      RETURN;
    END IF;

    L_PASSWORD_HASH := TRIM(JSON_VALUE(P_INPUT_JSON, '$.password_hash'));
    IF L_PASSWORD_HASH IS NULL THEN
      P_MESSAGE := 'password_hash is required';
      RETURN;
    END IF;

    L_SKIP_IF_EXISTS := JSON_BOOL(P_INPUT_JSON, '$.skip_if_exists', TRUE);

    RESOLVE_ADMIN_PROFILE(
      P_INPUT_JSON,
      L_ADMIN_TYPE,
      L_ENTERPRISE_ID,
      L_SEED_ENTERPRISE_ID,
      L_USER_CODE,
      L_USERNAME,
      L_PRIMARY_EMAIL,
      L_FIRST_NAME,
      L_LAST_NAME
    );

    L_GUID_HEX := FIND_ADMIN_USER(L_ENTERPRISE_ID, L_USERNAME, L_PRIMARY_EMAIL);

    IF L_GUID_HEX IS NOT NULL THEN
      IF NOT L_SKIP_IF_EXISTS THEN
        P_MESSAGE := L_ADMIN_TYPE || ' already exists for enterprise ' || L_ENTERPRISE_ID;
        RETURN;
      END IF;
    ELSE
      CREATE_ADMIN_USER(
        L_ENTERPRISE_ID,
        L_USER_CODE,
        L_USERNAME,
        L_FIRST_NAME,
        L_LAST_NAME,
        L_PRIMARY_EMAIL,
        L_PASSWORD_HASH,
        L_PKG_MSG,
        L_GUID_HEX
      );

      IF NOT MSG_INDICATES_SUCCESS(L_PKG_MSG) OR L_GUID_HEX IS NULL THEN
        P_MESSAGE := NVL(L_PKG_MSG, 'CREATE_USER failed for ' || L_ADMIN_TYPE);
        RETURN;
      END IF;

      L_CREATED := TRUE;
    END IF;

    NORMALIZE_ADMIN_USER(L_ENTERPRISE_ID, L_GUID_HEX, L_PKG_MSG);

    IF NOT MSG_INDICATES_SUCCESS(L_PKG_MSG) THEN
      P_MESSAGE := NVL(L_PKG_MSG, 'UPDATE_USER failed for ' || L_ADMIN_TYPE);
      RETURN;
    END IF;

    P_SUCCESS   := 'Y';
    IF L_CREATED THEN
      P_CREATED := 'Y';
    ELSE
      P_CREATED := 'N';
    END IF;
    P_USER_GUID := L_GUID_HEX;
    P_MESSAGE   := L_ADMIN_TYPE || ' ensured successfully for enterprise ' || L_ENTERPRISE_ID;
  EXCEPTION
    WHEN OTHERS THEN
      P_SUCCESS := 'N';
      P_MESSAGE := SQLERRM;
  END ENSURE_PLATFORM_ADMIN;

  PROCEDURE SEED_PLATFORM_ADMINS (
      P_INPUT_JSON   IN  CLOB,
      P_SUCCESS      OUT VARCHAR2,
      P_MESSAGE      OUT VARCHAR2,
      P_RESULT_JSON  OUT CLOB
  ) IS
    L_ENTERPRISE_ID      NUMBER;
    L_SEED_ENTERPRISE_ID NUMBER;
    L_PASSWORD_HASH      VARCHAR2(4000);
    L_SKIP_IF_EXISTS     BOOLEAN;
    L_SKIP_STR           VARCHAR2(5);
    L_PAYLOAD            CLOB;
    L_OK                 VARCHAR2(1);
    L_MSG                VARCHAR2(4000);
    L_CREATED            VARCHAR2(1);
    L_GUID               VARCHAR2(32);
    L_ENT_OK             BOOLEAN := TRUE;
    L_ENT_CREATED        VARCHAR2(1) := 'N';
    L_ENT_GUID           VARCHAR2(32);
    L_ENT_MSG            VARCHAR2(4000);
    L_ENT_BLOCK          CLOB;
    L_ENT_OK_STR         VARCHAR2(1);
  BEGIN
    P_SUCCESS     := 'N';
    P_MESSAGE     := NULL;
    P_RESULT_JSON := NULL;

    IF P_INPUT_JSON IS NULL OR DBMS_LOB.GETLENGTH(P_INPUT_JSON) = 0 THEN
      P_MESSAGE := 'input JSON is required';
      RETURN;
    END IF;

    L_ENTERPRISE_ID := TO_NUMBER(JSON_VALUE(P_INPUT_JSON, '$.enterprise_id'));
    IF L_ENTERPRISE_ID IS NULL OR L_ENTERPRISE_ID <= 0 THEN
      P_MESSAGE := 'enterprise_id must be a positive integer';
      RETURN;
    END IF;

    L_SEED_ENTERPRISE_ID := TO_NUMBER(JSON_VALUE(P_INPUT_JSON, '$.seed_enterprise_id'));
    IF L_SEED_ENTERPRISE_ID IS NULL OR L_SEED_ENTERPRISE_ID <= 0 THEN
      L_SEED_ENTERPRISE_ID := L_ENTERPRISE_ID;
    END IF;

    L_PASSWORD_HASH := TRIM(JSON_VALUE(P_INPUT_JSON, '$.password_hash'));
    IF L_PASSWORD_HASH IS NULL THEN
      P_MESSAGE := 'password_hash is required';
      RETURN;
    END IF;

    L_SKIP_IF_EXISTS := JSON_BOOL(P_INPUT_JSON, '$.skip_if_exists', TRUE);
    L_SKIP_STR := BOOL_TO_JSON(L_SKIP_IF_EXISTS);

    SELECT JSON_OBJECT(
             'admin_type'         VALUE 'enterprise_admin',
             'enterprise_id'      VALUE L_ENTERPRISE_ID,
             'seed_enterprise_id' VALUE L_SEED_ENTERPRISE_ID,
             'password_hash'      VALUE L_PASSWORD_HASH,
             'skip_if_exists'     VALUE L_SKIP_STR,
             'enterprise_admin'   VALUE JSON_QUERY(P_INPUT_JSON, '$.enterprise_admin')
             RETURNING CLOB
           )
      INTO L_PAYLOAD
      FROM DUAL;

    ENSURE_PLATFORM_ADMIN(
      L_PAYLOAD,
      L_OK,
      L_MSG,
      L_CREATED,
      L_GUID
    );

    L_ENT_OK      := L_OK = 'Y';
    L_ENT_CREATED := NVL(L_CREATED, 'N');
    L_ENT_GUID    := L_GUID;
    L_ENT_MSG     := L_MSG;

    IF L_ENT_OK THEN
      L_ENT_OK_STR := 'Y';
    ELSE
      L_ENT_OK_STR := 'N';
    END IF;

    SELECT JSON_OBJECT(
             'ok'        VALUE L_ENT_OK_STR,
             'created'   VALUE L_ENT_CREATED,
             'user_guid' VALUE L_ENT_GUID,
             'message'   VALUE L_ENT_MSG
             RETURNING CLOB
           )
      INTO L_ENT_BLOCK
      FROM DUAL;

    SELECT JSON_OBJECT(
             'enterprise_admin' VALUE JSON_QUERY(L_ENT_BLOCK, '$')
             RETURNING CLOB
           )
      INTO P_RESULT_JSON
      FROM DUAL;

    IF L_ENT_OK THEN
      P_SUCCESS := 'Y';
      P_MESSAGE := 'enterprise_admin seeded successfully for enterprise ' || L_ENTERPRISE_ID;
    ELSE
      P_SUCCESS := 'N';
      P_MESSAGE := 'Platform admin seed completed with errors';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      P_SUCCESS := 'N';
      P_MESSAGE := SQLERRM;
  END SEED_PLATFORM_ADMINS;

  PROCEDURE APPEND_CLOB(P_CLOB IN OUT NOCOPY CLOB, P_CHUNK IN VARCHAR2) IS
  BEGIN
    IF P_CHUNK IS NOT NULL THEN
      DBMS_LOB.APPEND(P_CLOB, P_CHUNK);
    END IF;
  END;

  PROCEDURE BACKFILL_ENTERPRISE_ADMINS (
      P_INPUT_JSON   IN  CLOB,
      P_SUCCESS      OUT VARCHAR2,
      P_MESSAGE      OUT VARCHAR2,
      P_RESULT_JSON  OUT CLOB
  ) IS
    L_SEED_ENTERPRISE_ID NUMBER;
    L_PASSWORD_HASH      VARCHAR2(4000);
    L_SKIP_IF_EXISTS     BOOLEAN;
    L_ACTIVE_ONLY        BOOLEAN;
    L_SKIP_STR           VARCHAR2(5);
    L_ACTIVE_STR         VARCHAR2(5);
    L_PAYLOAD            CLOB;
    L_OK                 VARCHAR2(1);
    L_MSG                VARCHAR2(4000);
    L_CREATED            VARCHAR2(1);
    L_GUID               VARCHAR2(32);
    L_OK_STR             VARCHAR2(1);
    L_CREATED_STR        VARCHAR2(1);
    L_ITEM               CLOB;
    L_ARR                CLOB;
    L_FIRST              BOOLEAN := TRUE;
    L_TOTAL              NUMBER := 0;
    L_PROCESSED          NUMBER := 0;
    L_CREATED_CNT        NUMBER := 0;
    L_FAILED_CNT         NUMBER := 0;

    CURSOR c_missing IS
      SELECT e.ENTERPRISE_ID
        FROM ENT.ENTERPRISES e
       WHERE (
               NOT L_ACTIVE_ONLY
            OR NVL(e.IS_ACTIVE, 'Y') = 'Y'
             )
         AND NOT EXISTS (
               SELECT 1
                 FROM FNDSEC.FNDSEC_USERS u
                WHERE u.ENTERPRISE_ID = e.ENTERPRISE_ID
                  AND (
                        LOWER(u.USER_CODE) = 'enterprise_admin'
                     OR LOWER(u.USERNAME) = 'enterprise_admin'
                  )
             )
       ORDER BY e.ENTERPRISE_ID;
  BEGIN
    P_SUCCESS     := 'N';
    P_MESSAGE     := NULL;
    P_RESULT_JSON := NULL;

    IF P_INPUT_JSON IS NULL OR DBMS_LOB.GETLENGTH(P_INPUT_JSON) = 0 THEN
      P_MESSAGE := 'input JSON is required';
      RETURN;
    END IF;

    L_SEED_ENTERPRISE_ID := TO_NUMBER(JSON_VALUE(P_INPUT_JSON, '$.seed_enterprise_id'));
    IF L_SEED_ENTERPRISE_ID IS NULL OR L_SEED_ENTERPRISE_ID <= 0 THEN
      L_SEED_ENTERPRISE_ID := TO_NUMBER(JSON_VALUE(P_INPUT_JSON, '$.enterprise_id'));
    END IF;
    IF L_SEED_ENTERPRISE_ID IS NULL OR L_SEED_ENTERPRISE_ID <= 0 THEN
      L_SEED_ENTERPRISE_ID := 1;
    END IF;

    L_PASSWORD_HASH := TRIM(JSON_VALUE(P_INPUT_JSON, '$.password_hash'));
    IF L_PASSWORD_HASH IS NULL THEN
      P_MESSAGE := 'password_hash is required';
      RETURN;
    END IF;

    L_SKIP_IF_EXISTS := JSON_BOOL(P_INPUT_JSON, '$.skip_if_exists', TRUE);
    L_ACTIVE_ONLY    := JSON_BOOL(P_INPUT_JSON, '$.active_only', TRUE);
    L_SKIP_STR       := BOOL_TO_JSON(L_SKIP_IF_EXISTS);
    L_ACTIVE_STR     := BOOL_TO_JSON(L_ACTIVE_ONLY);

    DBMS_LOB.CREATETEMPORARY(L_ARR, TRUE);
    APPEND_CLOB(L_ARR, '[');

    FOR rec IN c_missing LOOP
      L_TOTAL := L_TOTAL + 1;

      SELECT JSON_OBJECT(
               'admin_type'         VALUE 'enterprise_admin',
               'enterprise_id'      VALUE rec.ENTERPRISE_ID,
               'seed_enterprise_id' VALUE L_SEED_ENTERPRISE_ID,
               'password_hash'      VALUE L_PASSWORD_HASH,
               'skip_if_exists'     VALUE L_SKIP_STR,
               'enterprise_admin'   VALUE JSON_QUERY(P_INPUT_JSON, '$.enterprise_admin')
               RETURNING CLOB
             )
        INTO L_PAYLOAD
        FROM DUAL;

      ENSURE_PLATFORM_ADMIN(
        L_PAYLOAD,
        L_OK,
        L_MSG,
        L_CREATED,
        L_GUID
      );

      L_PROCESSED := L_PROCESSED + 1;

      IF L_OK = 'Y' THEN
        L_OK_STR := 'Y';
        IF NVL(L_CREATED, 'N') = 'Y' THEN
          L_CREATED_CNT := L_CREATED_CNT + 1;
          L_CREATED_STR := 'Y';
        ELSE
          L_CREATED_STR := 'N';
        END IF;
      ELSE
        L_OK_STR := 'N';
        L_CREATED_STR := 'N';
        L_FAILED_CNT := L_FAILED_CNT + 1;
      END IF;

      SELECT JSON_OBJECT(
               'enterprise_id' VALUE rec.ENTERPRISE_ID,
               'ok'            VALUE L_OK_STR,
               'created'       VALUE L_CREATED_STR,
               'user_guid'     VALUE L_GUID,
               'message'       VALUE L_MSG
               RETURNING CLOB
             )
        INTO L_ITEM
        FROM DUAL;

      IF NOT L_FIRST THEN
        APPEND_CLOB(L_ARR, ',');
      END IF;
      APPEND_CLOB(L_ARR, L_ITEM);
      L_FIRST := FALSE;
    END LOOP;

    APPEND_CLOB(L_ARR, ']');

    SELECT JSON_OBJECT(
             'total_missing' VALUE L_TOTAL,
             'processed'     VALUE L_PROCESSED,
             'created'       VALUE L_CREATED_CNT,
             'failed'        VALUE L_FAILED_CNT,
             'active_only'   VALUE L_ACTIVE_STR,
             'enterprises'   VALUE JSON_QUERY(L_ARR, '$')
             RETURNING CLOB
           )
      INTO P_RESULT_JSON
      FROM DUAL;

    IF L_FAILED_CNT = 0 THEN
      P_SUCCESS := 'Y';
      IF L_TOTAL = 0 THEN
        P_MESSAGE := 'All enterprises already have enterprise_admin';
      ELSE
        P_MESSAGE := 'Backfill completed: ' || L_CREATED_CNT || ' created, ' || (L_PROCESSED - L_CREATED_CNT) || ' already existed';
      END IF;
    ELSE
      P_SUCCESS := 'N';
      P_MESSAGE := 'Backfill completed with ' || L_FAILED_CNT || ' failure(s) out of ' || L_PROCESSED || ' enterprise(s)';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      P_SUCCESS := 'N';
      P_MESSAGE := SQLERRM;
  END BACKFILL_ENTERPRISE_ADMINS;

END FNDSEC_ADMIN_SEED_PKG;
/
