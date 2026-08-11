CREATE OR REPLACE PACKAGE ENT.ENT_ENTERPRISES_PKG AS
  PROCEDURE INVOKE(
    p_action       IN  VARCHAR2,
    p_payload_json IN  CLOB,
    p_result_json  OUT CLOB,
    p_status       OUT VARCHAR2,
    p_message      OUT VARCHAR2
  );
END ENT_ENTERPRISES_PKG;
/

SHOW ERRORS PACKAGE ENT.ENT_ENTERPRISES_PKG;

CREATE OR REPLACE PACKAGE BODY ENT.ENT_ENTERPRISES_PKG AS

  PROCEDURE enterprises_action(
    p_action       IN  VARCHAR2,
    p_payload_json IN  CLOB,
    p_result_json  OUT CLOB,
    p_status       OUT VARCHAR2,
    p_message      OUT VARCHAR2
  ) IS
    l_id          NUMBER;
    l_actor       VARCHAR2(200) := NVL(ent_json_util_pkg.jstr(p_payload_json, 'actor'), 'SYSTEM');
    l_hard        NUMBER := NVL(ent_json_util_pkg.jnum(p_payload_json, 'hard'), 0);
    l_get_payload CLOB;
    l_count       NUMBER;
    l_err_msg     VARCHAR2(4000);
    l_err_bt      VARCHAR2(4000);
  BEGIN
    CASE UPPER(p_action)

      WHEN 'LIST' THEN
        SELECT NVL(
                 JSON_ARRAYAGG(
                   JSON_OBJECT(
                     'enterprise_id'     VALUE enterprise_id,
                     'enterprise_code'   VALUE enterprise_code,
                     'enterprise_name'   VALUE enterprise_name,
                     'is_active'         VALUE is_active,
                     'created_by'        VALUE created_by,
                     'created_date'      VALUE created_date,
                     'last_updated_by'   VALUE last_updated_by,
                     'last_updated_date' VALUE last_updated_date,
                     'last_update_login' VALUE last_update_login
                   )
                   ORDER BY enterprise_id
                   RETURNING CLOB
                 ),
                 TO_CLOB('[]')
               )
          INTO p_result_json
          FROM ent.v_enterprises v
         WHERE (ent_json_util_pkg.jnum(p_payload_json, 'enterprise_id') IS NULL 
                OR v.enterprise_id = ent_json_util_pkg.jnum(p_payload_json, 'enterprise_id'))
           AND (ent_json_util_pkg.jstr(p_payload_json, 'enterprise_code') IS NULL 
                OR UPPER(v.enterprise_code) = UPPER(ent_json_util_pkg.jstr(p_payload_json, 'enterprise_code')))
           AND (ent_json_util_pkg.jstr(p_payload_json, 'is_active') IS NULL 
                OR v.is_active = ent_json_util_pkg.yn(ent_json_util_pkg.jstr(p_payload_json, 'is_active'), v.is_active));

        ent_json_util_pkg.wrap_list(p_result_json);
        ent_json_util_pkg.ok_msg(p_status, p_message);

      WHEN 'GET' THEN
        l_id := ent_json_util_pkg.jnum(p_payload_json, 'enterprise_id');

        IF l_id IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'enterprise_id is required');
          RETURN;
        END IF;

        SELECT JSON_OBJECT(
                 'enterprise_id'     VALUE enterprise_id,
                 'enterprise_code'   VALUE enterprise_code,
                 'enterprise_name'   VALUE enterprise_name,
                 'is_active'         VALUE is_active,
                 'created_by'        VALUE created_by,
                 'created_date'      VALUE created_date,
                 'last_updated_by'   VALUE last_updated_by,
                 'last_updated_date' VALUE last_updated_date,
                 'last_update_login' VALUE last_update_login
                 RETURNING CLOB
               )
          INTO p_result_json
          FROM ent.v_enterprises
         WHERE enterprise_id = l_id;

        ent_json_util_pkg.ok_msg(p_status, p_message);

      WHEN 'CREATE' THEN
        IF ent_json_util_pkg.jstr(p_payload_json, 'enterprise_code') IS NULL
           OR ent_json_util_pkg.jstr(p_payload_json, 'enterprise_name') IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'enterprise_code and enterprise_name are required');
          RETURN;
        END IF;

        INSERT INTO ent.enterprises (
          enterprise_id,
          enterprise_code,
          enterprise_name,
          is_active,
          created_by,
          created_date,
          last_updated_by,
          last_updated_date,
          last_update_login
        ) VALUES (
          ent.enterprises_seq.NEXTVAL,
          ent_json_util_pkg.jstr(p_payload_json, 'enterprise_code'),
          ent_json_util_pkg.jstr(p_payload_json, 'enterprise_name'),
          ent_json_util_pkg.yn(ent_json_util_pkg.jstr(p_payload_json, 'is_active'), 'Y'),
          l_actor,
          SYSTIMESTAMP,
          l_actor,
          SYSTIMESTAMP,
          ent_json_util_pkg.jstr(p_payload_json, 'last_update_login')
        )
        RETURNING enterprise_id INTO l_id;

        l_get_payload := TO_CLOB('{"enterprise_id":' || l_id || '}');

        enterprises_action(
          'GET',
          l_get_payload,
          p_result_json,
          p_status,
          p_message
        );

        p_message := 'Enterprise created';

      WHEN 'UPDATE' THEN
        l_id := ent_json_util_pkg.jnum(p_payload_json, 'enterprise_id');

        IF l_id IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'enterprise_id is required');
          RETURN;
        END IF;

        UPDATE ent.enterprises e
           SET enterprise_code = NVL(ent_json_util_pkg.jstr(p_payload_json, 'enterprise_code'), e.enterprise_code),
               enterprise_name = NVL(ent_json_util_pkg.jstr(p_payload_json, 'enterprise_name'), e.enterprise_name),
               is_active = CASE
                              WHEN ent_json_util_pkg.jstr(p_payload_json, 'is_active') IS NULL
                              THEN e.is_active
                              ELSE ent_json_util_pkg.yn(ent_json_util_pkg.jstr(p_payload_json, 'is_active'), e.is_active)
                            END,
               last_updated_by = l_actor,
               last_updated_date = SYSTIMESTAMP,
               last_update_login = NVL(ent_json_util_pkg.jstr(p_payload_json, 'last_update_login'), e.last_update_login)
         WHERE enterprise_id = l_id;

        IF SQL%ROWCOUNT = 0 THEN
          ent_json_util_pkg.fail(p_status, p_message, 'Enterprise not found');
          RETURN;
        END IF;

        l_get_payload := TO_CLOB('{"enterprise_id":' || l_id || '}');

        enterprises_action(
          'GET',
          l_get_payload,
          p_result_json,
          p_status,
          p_message
        );

        p_message := 'Enterprise updated';

      WHEN 'DELETE' THEN
        l_id := ent_json_util_pkg.jnum(p_payload_json, 'enterprise_id');

        IF l_id IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'enterprise_id is required');
          RETURN;
        END IF;

        SELECT COUNT(*)
          INTO l_count
          FROM ent.enterprises
         WHERE enterprise_id = l_id;

        IF l_count = 0 THEN
          ent_json_util_pkg.fail(p_status, p_message, 'Enterprise not found');
          RETURN;
        END IF;

        IF l_hard = 1 THEN
          DELETE FROM ent.enterprises
           WHERE enterprise_id = l_id;

          SELECT JSON_OBJECT(
                   'enterprise_id' VALUE l_id,
                   'delete_type'   VALUE 'HARD',
                   'deleted'       VALUE 'Y'
                   RETURNING CLOB
                 )
            INTO p_result_json
            FROM dual;

          ent_json_util_pkg.ok_msg(p_status, p_message, 'Enterprise permanently deleted');
        ELSE
          UPDATE ent.enterprises
             SET is_active         = 'N',
                 last_updated_by   = l_actor,
                 last_updated_date = SYSTIMESTAMP
           WHERE enterprise_id = l_id;

          SELECT JSON_OBJECT(
                   'enterprise_id' VALUE l_id,
                   'delete_type'   VALUE 'SOFT',
                   'deleted'       VALUE 'N',
                   'is_active'     VALUE 'N'
                   RETURNING CLOB
                 )
            INTO p_result_json
            FROM dual;

          ent_json_util_pkg.ok_msg(p_status, p_message, 'Enterprise deactivated successfully');
        END IF;

      ELSE
        ent_json_util_pkg.fail(p_status, p_message, 'Unsupported ENTERPRISES action: ' || p_action);

    END CASE;

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      ent_json_util_pkg.fail(p_status, p_message, 'Enterprise not found');

    WHEN DUP_VAL_ON_INDEX THEN
      ent_json_util_pkg.fail(p_status, p_message, 'Enterprise code already exists');

    WHEN OTHERS THEN
      IF SQLCODE = -2292 THEN
        l_err_msg := SQLERRM;
        l_err_bt  := DBMS_UTILITY.FORMAT_ERROR_BACKTRACE;
        BEGIN
          SELECT JSON_OBJECT(
                   'enterprise_id' VALUE l_id,
                   'delete_type'   VALUE 'HARD',
                   'oracle_error'  VALUE l_err_msg,
                   'backtrace'     VALUE l_err_bt
                   RETURNING CLOB
                 )
            INTO p_result_json
            FROM dual;
        EXCEPTION
          WHEN OTHERS THEN
            NULL;
        END;
        ent_json_util_pkg.fail(
          p_status,
          p_message,
          'Enterprise cannot be permanently deleted because related records exist. Use soft delete instead.'
        );
      ELSE
        RAISE_APPLICATION_ERROR(-21701, 'ENTERPRISES failed: ' || SQLERRM);
      END IF;
  END enterprises_action;

  PROCEDURE INVOKE(
    p_action       IN  VARCHAR2,
    p_payload_json IN  CLOB,
    p_result_json  OUT CLOB,
    p_status       OUT VARCHAR2,
    p_message      OUT VARCHAR2
  ) IS
  BEGIN
    enterprises_action(
      p_action,
      p_payload_json,
      p_result_json,
      p_status,
      p_message
    );
  END INVOKE;

END ENT_ENTERPRISES_PKG;

/

SHOW ERRORS PACKAGE BODY ENT.ENT_ENTERPRISES_PKG;

SELECT line, position, text
  FROM all_errors
 WHERE owner = 'ENT'
   AND name = 'ENT_ENTERPRISES_PKG'
 ORDER BY sequence;
