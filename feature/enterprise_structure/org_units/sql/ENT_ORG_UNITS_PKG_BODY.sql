-- =============================================================================
-- ENT.ORG_UNITS_PKG — body (export + INVOKE for LIST/GET/CREATE/UPDATE/DELETE)
-- Depends: ENT_JSON_UTIL_PKG, V_ORG_UNITS
-- =============================================================================

CREATE OR REPLACE PACKAGE BODY ENT.ORG_UNITS_PKG AS

  c_status_success CONSTANT VARCHAR2(1) := 'S';
  c_status_error   CONSTANT VARCHAR2(1) := 'E';

  FUNCTION is_hex32(p_value VARCHAR2) RETURN BOOLEAN IS
  BEGIN
    RETURN p_value IS NOT NULL
       AND LENGTH(TRIM(p_value)) = 32
       AND REGEXP_LIKE(TRIM(p_value), '^[0-9A-Fa-f]{32}$');
  END is_hex32;

  FUNCTION normalize_hex32(p_value VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN UPPER(TRIM(p_value));
  END normalize_hex32;

  FUNCTION hex_to_raw(p_hex VARCHAR2) RETURN RAW IS
  BEGIN
    RETURN HEXTORAW(normalize_hex32(p_hex));
  END hex_to_raw;

  PROCEDURE set_error(
    p_status  OUT VARCHAR2,
    p_message OUT VARCHAR2,
    p_text    IN  VARCHAR2
  ) IS
  BEGIN
    p_status  := c_status_error;
    p_message := p_text;
  END set_error;

  FUNCTION parent_level_code_for_child(
    p_structure_id IN RAW,
    p_child_level  IN VARCHAR2
  ) RETURN VARCHAR2 IS
    l_parent_level VARCHAR2(100);
  BEGIN
    SELECT pl.level_code
      INTO l_parent_level
      FROM (
             SELECT level_code,
                    ROW_NUMBER() OVER (ORDER BY display_order, level_number) AS rn
               FROM ent.hr_org_hierarchy_levels
              WHERE structure_id = p_structure_id
                AND is_active = 'Y'
           ) child
      JOIN (
             SELECT level_code,
                    ROW_NUMBER() OVER (ORDER BY display_order, level_number) AS rn
               FROM ent.hr_org_hierarchy_levels
              WHERE structure_id = p_structure_id
                AND is_active = 'Y'
           ) pl
        ON pl.rn = child.rn - 1
     WHERE UPPER(child.level_code) = UPPER(TRIM(p_child_level));

    RETURN l_parent_level;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RETURN NULL;
  END parent_level_code_for_child;

  FUNCTION level_exists_in_structure(
    p_structure_id IN RAW,
    p_level_code   IN VARCHAR2
  ) RETURN BOOLEAN IS
    l_cnt NUMBER;
  BEGIN
    SELECT COUNT(*)
      INTO l_cnt
      FROM ent.hr_org_hierarchy_levels
     WHERE structure_id = p_structure_id
       AND is_active = 'Y'
       AND UPPER(level_code) = UPPER(TRIM(p_level_code));

    RETURN l_cnt > 0;
  END level_exists_in_structure;

  FUNCTION is_root_level(
    p_structure_id IN RAW,
    p_level_code   IN VARCHAR2
  ) RETURN BOOLEAN IS
    l_rn NUMBER;
  BEGIN
    SELECT rn
      INTO l_rn
      FROM (
             SELECT level_code,
                    ROW_NUMBER() OVER (ORDER BY display_order, level_number) AS rn
               FROM ent.hr_org_hierarchy_levels
              WHERE structure_id = p_structure_id
                AND is_active = 'Y'
           )
     WHERE UPPER(level_code) = UPPER(TRIM(p_level_code));

    RETURN l_rn = 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RETURN FALSE;
  END is_root_level;

  FUNCTION org_units_json_for_level(
    p_structure_id           IN RAW,
    p_level_code             IN VARCHAR2,
    p_parent_org_unit_id_raw IN RAW,
    p_is_active              IN CHAR,
    p_search                 IN VARCHAR2
  ) RETURN CLOB IS
    l_json   CLOB;
    l_search VARCHAR2(4000);
  BEGIN
    l_search := CASE
                  WHEN p_search IS NULL OR TRIM(p_search) = '' THEN NULL
                  ELSE '%' || UPPER(TRIM(p_search)) || '%'
                END;

    SELECT NVL(
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'org_unit_id'              VALUE RAWTOHEX(ou.org_unit_id),
                 'org_structure_id'         VALUE RAWTOHEX(ou.org_structure_id),
                 'enterprise_id'            VALUE ou.enterprise_id,
                 'level_code'               VALUE ou.level_code,
                 'org_unit_code'            VALUE ou.org_unit_code,
                 'org_unit_name_en'         VALUE ou.org_unit_name_en,
                 'org_unit_name_ar'         VALUE ou.org_unit_name_ar,
                 'parent_org_unit_id'       VALUE RAWTOHEX(ou.parent_org_unit_id),
                 'is_active'                VALUE ou.is_active,
                 'manager_name'             VALUE ou.manager_name,
                 'manager_email'            VALUE ou.manager_email,
                 'manager_phone'            VALUE ou.manager_phone,
                 'location'                 VALUE ou.location,
                 'city'                     VALUE ou.city,
                 'address'                  VALUE ou.address,
                 'description'              VALUE ou.description,
                 'org_structure_name'       VALUE s.structure_name,
                 'parent_org_unit_name_en'  VALUE p.org_unit_name_en,
                 'parent_org_unit_name_ar'  VALUE p.org_unit_name_ar,
                 'parent_org_level_code'    VALUE p.level_code,
                 'parent_unit' VALUE
                   CASE
                     WHEN ou.parent_org_unit_id IS NOT NULL THEN
                       JSON_OBJECT(
                         'id'    VALUE RAWTOHEX(ou.parent_org_unit_id),
                         'name'  VALUE NVL(p.org_unit_name_en, p.org_unit_name_ar),
                         'level' VALUE p.level_code
                         RETURNING CLOB
                       )
                     ELSE NULL
                   END
                 RETURNING CLOB
               )
               ORDER BY ou.org_unit_name_en, ou.org_unit_id
               RETURNING CLOB
             ),
             TO_CLOB('[]')
           )
      INTO l_json
      FROM ent.org_units ou
      LEFT JOIN ent.org_units p
        ON p.org_unit_id = ou.parent_org_unit_id
       AND p.org_structure_id = ou.org_structure_id
      LEFT JOIN ent.hr_org_structures s
        ON s.structure_id = ou.org_structure_id
     WHERE ou.org_structure_id = p_structure_id
       AND UPPER(ou.level_code) = UPPER(TRIM(p_level_code))
       AND (
             p_parent_org_unit_id_raw IS NULL
          OR ou.parent_org_unit_id = p_parent_org_unit_id_raw
           )
       AND (
             p_is_active IS NULL
          OR ou.is_active = UPPER(TRIM(p_is_active))
           )
       AND (
             l_search IS NULL
          OR UPPER(ou.org_unit_code) LIKE l_search
          OR UPPER(ou.org_unit_name_en) LIKE l_search
          OR UPPER(ou.org_unit_name_ar) LIKE l_search
           );

    RETURN NVL(l_json, TO_CLOB('[]'));
  END org_units_json_for_level;

  FUNCTION json_array_length(p_json_array CLOB) RETURN NUMBER IS
    l_len NUMBER;
  BEGIN
    IF p_json_array IS NULL OR DBMS_LOB.GETLENGTH(p_json_array) = 0 THEN
      RETURN 0;
    END IF;

    SELECT COUNT(*)
      INTO l_len
      FROM JSON_TABLE(
             p_json_array,
             '$[*]'
             COLUMNS (
               rn FOR ORDINALITY
             )
           );

    RETURN NVL(l_len, 0);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN 0;
  END json_array_length;

  PROCEDURE EXPORT_ORG_UNITS(
    p_org_structure_id_hex   IN  VARCHAR2,
    p_level_code             IN  VARCHAR2 DEFAULT NULL,
    p_parent_org_unit_id_hex IN  VARCHAR2 DEFAULT NULL,
    p_is_active              IN  CHAR     DEFAULT NULL,
    p_search                 IN  VARCHAR2 DEFAULT NULL,
    p_allow_draft            IN  NUMBER   DEFAULT 1,
    p_status                 OUT VARCHAR2,
    p_message                OUT VARCHAR2,
    p_result_json            OUT CLOB
  ) IS
    l_structure_id_raw      RAW(16);
    l_parent_id_raw         RAW(16);
    l_structure_name        VARCHAR2(500);
    l_is_active_flag        CHAR(1);
    l_allow_draft           NUMBER := NVL(p_allow_draft, 1);
    l_level_code            VARCHAR2(100);
    l_parent_level_code     VARCHAR2(100);
    l_parent_level_actual   VARCHAR2(100);
    l_parent_name_en        VARCHAR2(500);
    l_sheets_json           CLOB := TO_CLOB('[');
    l_sheet_obj             CLOB;
    l_units_json            CLOB;
    l_row_count             NUMBER := 0;
    l_level_count           NUMBER := 0;

    CURSOR c_levels IS
      SELECT level_code
        FROM ent.hr_org_hierarchy_levels
       WHERE structure_id = l_structure_id_raw
         AND is_active = 'Y'
         AND (
               p_level_code IS NULL
            OR TRIM(p_level_code) = ''
            OR UPPER(level_code) = UPPER(TRIM(p_level_code))
             )
       ORDER BY display_order, level_number;
  BEGIN
    p_status      := c_status_error;
    p_message     := NULL;
    p_result_json := NULL;

    IF NOT is_hex32(p_org_structure_id_hex) THEN
      RAISE_APPLICATION_ERROR(-21803, 'Invalid STRUCTURE_ID format (expected 32-char hex)');
    END IF;

    l_structure_id_raw := HEXTORAW(normalize_hex32(p_org_structure_id_hex));

    BEGIN
      SELECT structure_name, is_active
        INTO l_structure_name, l_is_active_flag
        FROM ent.hr_org_structures
       WHERE structure_id = l_structure_id_raw;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-21801, 'Structure not found');
    END;

    IF l_allow_draft = 0 AND NVL(l_is_active_flag, 'N') <> 'Y' THEN
      RAISE_APPLICATION_ERROR(-21802, 'Structure is not active');
    END IF;

    IF p_level_code IS NOT NULL AND TRIM(p_level_code) <> '' THEN
      IF NOT level_exists_in_structure(l_structure_id_raw, p_level_code) THEN
        RAISE_APPLICATION_ERROR(-21804, 'Level ''' || TRIM(p_level_code) || ''' does not exist in this structure');
      END IF;
    END IF;

    IF p_parent_org_unit_id_hex IS NOT NULL AND TRIM(p_parent_org_unit_id_hex) <> '' THEN
      IF p_level_code IS NULL OR TRIM(p_level_code) = '' THEN
        RAISE_APPLICATION_ERROR(-21805, 'parentId filter requires level query parameter');
      END IF;

      IF is_root_level(l_structure_id_raw, p_level_code) THEN
        RAISE_APPLICATION_ERROR(-21806, 'parentId is not allowed for root level');
      END IF;

      IF NOT is_hex32(p_parent_org_unit_id_hex) THEN
        RAISE_APPLICATION_ERROR(-21807, 'Invalid parentId format');
      END IF;

      l_parent_id_raw := HEXTORAW(normalize_hex32(p_parent_org_unit_id_hex));
      l_parent_level_code := parent_level_code_for_child(l_structure_id_raw, p_level_code);

      BEGIN
        SELECT level_code, org_unit_name_en
          INTO l_parent_level_actual, l_parent_name_en
          FROM ent.org_units
         WHERE org_unit_id = l_parent_id_raw
           AND org_structure_id = l_structure_id_raw;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          RAISE_APPLICATION_ERROR(-21807, 'Parent org unit not found');
      END;

      IF l_parent_level_code IS NULL
         OR UPPER(l_parent_level_actual) <> UPPER(l_parent_level_code) THEN
        RAISE_APPLICATION_ERROR(
          -21808,
          'Parent org unit must be of level ''' || NVL(l_parent_level_code, '?') || ''''
        );
      END IF;
    END IF;

    FOR rec IN c_levels LOOP
      l_level_code := rec.level_code;

      l_units_json := org_units_json_for_level(
        l_structure_id_raw,
        l_level_code,
        l_parent_id_raw,
        CASE
          WHEN p_is_active IS NULL OR TRIM(p_is_active) = '' THEN NULL
          ELSE UPPER(TRIM(p_is_active))
        END,
        p_search
      );

      l_row_count   := l_row_count + json_array_length(l_units_json);
      l_level_count := l_level_count + 1;

      SELECT JSON_OBJECT(
               'name'      VALUE l_level_code,
               'org_units' VALUE l_units_json FORMAT JSON
               RETURNING CLOB
             )
        INTO l_sheet_obj
        FROM dual;

      IF l_level_count > 1 THEN
        DBMS_LOB.APPEND(l_sheets_json, TO_CLOB(','));
      END IF;

      DBMS_LOB.APPEND(l_sheets_json, l_sheet_obj);
    END LOOP;

    DBMS_LOB.APPEND(l_sheets_json, TO_CLOB(']'));

    IF p_level_code IS NOT NULL
       AND TRIM(p_level_code) <> ''
       AND l_level_count = 0 THEN
      RAISE_APPLICATION_ERROR(-21804, 'Level ''' || TRIM(p_level_code) || ''' does not exist in this structure');
    END IF;

    IF l_row_count = 0 THEN
      RAISE_APPLICATION_ERROR(-21809, 'No org units found to export');
    END IF;

    SELECT JSON_OBJECT(
             'structure_name' VALUE l_structure_name,
             'row_count'      VALUE l_row_count,
             'sheets'         VALUE l_sheets_json FORMAT JSON
             RETURNING CLOB
           )
      INTO p_result_json
      FROM dual;

    p_status  := c_status_success;
    p_message := 'Export data ready';

  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE BETWEEN -21809 AND -21801 THEN
        RAISE;
      END IF;

      RAISE_APPLICATION_ERROR(-21899, 'EXPORT_ORG_UNITS failed: ' || SQLERRM);
  END EXPORT_ORG_UNITS;

  PROCEDURE org_units_action(
    p_action       IN  VARCHAR2,
    p_payload_json IN  CLOB,
    p_result_json  OUT CLOB,
    p_status       OUT VARCHAR2,
    p_message      OUT VARCHAR2
  ) IS
    l_pkg_status   VARCHAR2(1);
    l_pkg_message  VARCHAR2(4000);
    l_structure    VARCHAR2(32) := ent_json_util_pkg.jstr(p_payload_json, 'structure_id');
    l_level        VARCHAR2(100) := ent_json_util_pkg.jstr(p_payload_json, 'level_code');
    l_search       VARCHAR2(500) := ent_json_util_pkg.jstr(p_payload_json, 'search');
    l_parent       VARCHAR2(32) := ent_json_util_pkg.jstr(p_payload_json, 'parent_org_unit_id');
    l_is_active    CHAR(1);
    l_actor        VARCHAR2(200) := NVL(ent_json_util_pkg.jstr(p_payload_json, 'actor'), 'SYSTEM');
    l_ou_hex       VARCHAR2(32);
    l_get_payload  CLOB;
    l_page         NUMBER := NVL(ent_json_util_pkg.jnum(p_payload_json, 'page'), 1);
    l_page_size    NUMBER := ent_json_util_pkg.jnum(p_payload_json, 'page_size');
    l_child_level  VARCHAR2(100) := ent_json_util_pkg.jstr(p_payload_json, 'child_level_code');
    l_eid          NUMBER := ent_json_util_pkg.jnum(p_payload_json, 'enterprise_id');
    l_parent_level VARCHAR2(100) := ent_json_util_pkg.jstr(p_payload_json, 'parent_level_code');
    l_total        NUMBER;
    l_struct_raw   RAW(16);
    l_struct_active CHAR(1);
  BEGIN
    IF ent_json_util_pkg.jstr(p_payload_json, 'is_active') IS NOT NULL THEN
      l_is_active := ent_json_util_pkg.yn(ent_json_util_pkg.jstr(p_payload_json, 'is_active'), 'Y');
    END IF;

    CASE UPPER(p_action)

      WHEN 'EXPORT' THEN
        export_org_units(
          p_org_structure_id_hex   => l_structure,
          p_level_code             => l_level,
          p_parent_org_unit_id_hex => l_parent,
          p_is_active              => l_is_active,
          p_search                 => l_search,
          p_allow_draft            => NVL(ent_json_util_pkg.jnum(p_payload_json, 'allow_draft'), 1),
          p_status                 => l_pkg_status,
          p_message                => l_pkg_message,
          p_result_json            => p_result_json
        );

        p_status  := l_pkg_status;
        p_message := l_pkg_message;

      WHEN 'LIST' THEN
        IF l_page_size IS NOT NULL AND l_page_size > 0 THEN
          l_page_size := LEAST(100, l_page_size);
          SELECT COUNT(*)
            INTO l_total
            FROM ent.v_org_units v
           WHERE (l_structure IS NULL OR v.org_structure_id = UPPER(l_structure))
             AND (l_level IS NULL OR UPPER(v.level_code) = UPPER(l_level))
             AND (l_parent IS NULL OR v.parent_org_unit_id = UPPER(l_parent))
             AND (l_is_active IS NULL OR v.is_active = l_is_active)
             AND (
                   l_search IS NULL
                OR UPPER(v.org_unit_code) LIKE '%' || UPPER(l_search) || '%'
                OR UPPER(v.org_unit_name_en) LIKE '%' || UPPER(l_search) || '%'
                OR UPPER(v.org_unit_name_ar) LIKE '%' || UPPER(l_search) || '%'
                 );

          SELECT JSON_OBJECT(
                   'data' VALUE NVL(
                     (
                       SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                  'org_unit_id' VALUE org_unit_id,
                                  'org_structure_id' VALUE org_structure_id,
                                  'enterprise_id' VALUE enterprise_id,
                                  'level_code' VALUE level_code,
                                  'org_unit_code' VALUE org_unit_code,
                                  'org_unit_name_en' VALUE org_unit_name_en,
                                  'org_unit_name_ar' VALUE org_unit_name_ar,
                                  'parent_org_unit_id' VALUE parent_org_unit_id,
                                  'is_active' VALUE is_active,
                                  'manager_name' VALUE manager_name,
                                  'manager_email' VALUE manager_email,
                                  'manager_phone' VALUE manager_phone,
                                  'location' VALUE location,
                                  'city' VALUE city,
                                  'address' VALUE address,
                                  'description' VALUE description,
                                  'org_structure_name' VALUE org_structure_name,
                                  'parent_org_unit_name_en' VALUE parent_org_unit_name_en,
                                  'parent_org_unit_name_ar' VALUE parent_org_unit_name_ar,
                                  'parent_org_level_code' VALUE parent_org_level_code,
                                  'parent_unit' VALUE CASE
                                    WHEN parent_org_unit_id IS NOT NULL THEN
                                      JSON_OBJECT(
                                        'id' VALUE parent_org_unit_id,
                                        'name' VALUE NVL(parent_org_unit_name_en, parent_org_unit_name_ar),
                                        'level' VALUE parent_org_level_code
                                        RETURNING CLOB
                                      )
                                    ELSE NULL END
                                  RETURNING CLOB
                                )
                                ORDER BY org_unit_name_en, org_unit_id
                                RETURNING CLOB
                              )
                         FROM (
                                SELECT v.*
                                  FROM ent.v_org_units v
                                 WHERE (l_structure IS NULL OR v.org_structure_id = UPPER(l_structure))
                                   AND (l_level IS NULL OR UPPER(v.level_code) = UPPER(l_level))
                                   AND (l_parent IS NULL OR v.parent_org_unit_id = UPPER(l_parent))
                                   AND (l_is_active IS NULL OR v.is_active = l_is_active)
                                   AND (
                                         l_search IS NULL
                                      OR UPPER(v.org_unit_code) LIKE '%' || UPPER(l_search) || '%'
                                      OR UPPER(v.org_unit_name_en) LIKE '%' || UPPER(l_search) || '%'
                                      OR UPPER(v.org_unit_name_ar) LIKE '%' || UPPER(l_search) || '%'
                                       )
                                 ORDER BY v.org_unit_name_en, v.org_unit_id
                                 OFFSET GREATEST(l_page - 1, 0) * l_page_size ROWS
                                 FETCH NEXT l_page_size ROWS ONLY
                              )
                     ),
                     TO_CLOB('[]')
                   ),
                   'total' VALUE l_total
                   RETURNING CLOB
                 )
            INTO p_result_json
            FROM DUAL;
        ELSE
          SELECT NVL(
                   JSON_ARRAYAGG(
                     JSON_OBJECT(
                       'org_unit_id' VALUE org_unit_id,
                       'org_structure_id' VALUE org_structure_id,
                       'enterprise_id' VALUE enterprise_id,
                       'level_code' VALUE level_code,
                       'org_unit_code' VALUE org_unit_code,
                       'org_unit_name_en' VALUE org_unit_name_en,
                       'org_unit_name_ar' VALUE org_unit_name_ar,
                       'parent_org_unit_id' VALUE parent_org_unit_id,
                       'is_active' VALUE is_active,
                       'manager_name' VALUE manager_name,
                       'manager_email' VALUE manager_email,
                       'manager_phone' VALUE manager_phone,
                       'location' VALUE location,
                       'city' VALUE city,
                       'address' VALUE address,
                       'description' VALUE description,
                       'org_structure_name' VALUE org_structure_name,
                       'parent_org_unit_name_en' VALUE parent_org_unit_name_en,
                       'parent_org_unit_name_ar' VALUE parent_org_unit_name_ar,
                       'parent_org_level_code' VALUE parent_org_level_code,
                       'parent_unit' VALUE CASE
                         WHEN parent_org_unit_id IS NOT NULL THEN
                           JSON_OBJECT(
                             'id' VALUE parent_org_unit_id,
                             'name' VALUE NVL(parent_org_unit_name_en, parent_org_unit_name_ar),
                             'level' VALUE parent_org_level_code
                             RETURNING CLOB
                           )
                         ELSE NULL END
                       RETURNING CLOB
                     )
                     ORDER BY org_unit_name_en, org_unit_id
                     RETURNING CLOB
                   ),
                   TO_CLOB('[]')
                 )
            INTO p_result_json
            FROM ent.v_org_units v
           WHERE (l_structure IS NULL OR v.org_structure_id = UPPER(l_structure))
             AND (l_level IS NULL OR UPPER(v.level_code) = UPPER(l_level))
             AND (l_parent IS NULL OR v.parent_org_unit_id = UPPER(l_parent))
             AND (l_is_active IS NULL OR v.is_active = l_is_active)
             AND (
                   l_search IS NULL
                OR UPPER(v.org_unit_code) LIKE '%' || UPPER(l_search) || '%'
                OR UPPER(v.org_unit_name_en) LIKE '%' || UPPER(l_search) || '%'
                OR UPPER(v.org_unit_name_ar) LIKE '%' || UPPER(l_search) || '%'
             );
          ent_json_util_pkg.wrap_list(p_result_json);
        END IF;
        ent_json_util_pkg.ok_msg(p_status, p_message);

      WHEN 'LIST_ACTIVE' THEN
        IF l_structure IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'structure_id is required');
          RETURN;
        END IF;
        l_struct_raw := HEXTORAW(UPPER(TRIM(l_structure)));
        SELECT NVL(
                 JSON_ARRAYAGG(
                   JSON_OBJECT(
                     'org_unit_id' VALUE RAWTOHEX(org_unit_id),
                     'level_code' VALUE level_code,
                     'org_unit_code' VALUE org_unit_code,
                     'org_unit_name_en' VALUE org_unit_name_en,
                     'org_unit_name_ar' VALUE org_unit_name_ar,
                     'parent_org_unit_id' VALUE RAWTOHEX(parent_org_unit_id),
                     'is_active' VALUE is_active
                     RETURNING CLOB
                   )
                   ORDER BY level_code, org_unit_name_en, org_unit_id
                   RETURNING CLOB
                 ),
                 TO_CLOB('[]')
               )
          INTO p_result_json
          FROM ent.org_units ou
         WHERE ou.org_structure_id = l_struct_raw
           AND ou.is_active = 'Y';
        ent_json_util_pkg.wrap_list(p_result_json);
        ent_json_util_pkg.ok_msg(p_status, p_message);

      WHEN 'PARENT_OPTIONS' THEN
        IF l_structure IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'structure_id is required');
          RETURN;
        END IF;
        l_parent_level := NVL(
          l_parent_level,
          parent_level_code_for_child(HEXTORAW(UPPER(TRIM(l_structure))), NVL(l_child_level, l_level))
        );
        IF l_parent_level IS NULL THEN
          SELECT JSON_OBJECT('data' VALUE TO_CLOB('[]'), 'total' VALUE 0 RETURNING CLOB)
            INTO p_result_json FROM DUAL;
          ent_json_util_pkg.ok_msg(p_status, p_message);
          RETURN;
        END IF;
        l_struct_raw := HEXTORAW(UPPER(TRIM(l_structure)));
        IF l_page_size IS NOT NULL AND l_page_size > 0 THEN
          l_page_size := LEAST(100, l_page_size);
          SELECT COUNT(*)
            INTO l_total
            FROM ent.org_units ou
           WHERE ou.org_structure_id = l_struct_raw
             AND ou.level_code = l_parent_level
             AND ou.is_active = 'Y'
             AND (
                   l_search IS NULL
                OR UPPER(ou.org_unit_code) LIKE '%' || UPPER(l_search) || '%'
                OR UPPER(ou.org_unit_name_en) LIKE '%' || UPPER(l_search) || '%'
                OR UPPER(ou.org_unit_name_ar) LIKE '%' || UPPER(l_search) || '%'
                 );
          SELECT JSON_OBJECT(
                   'data' VALUE NVL(
                     (
                       SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                  'id' VALUE RAWTOHEX(org_unit_id),
                                  'name' VALUE NVL(org_unit_name_en, org_unit_name_ar),
                                  'level' VALUE level_code
                                  RETURNING CLOB
                                )
                                ORDER BY org_unit_name_en, org_unit_id
                                RETURNING CLOB
                              )
                         FROM (
                                SELECT ou.*
                                  FROM ent.org_units ou
                                 WHERE ou.org_structure_id = l_struct_raw
                                   AND ou.level_code = l_parent_level
                                   AND ou.is_active = 'Y'
                                   AND (
                                         l_search IS NULL
                                      OR UPPER(ou.org_unit_code) LIKE '%' || UPPER(l_search) || '%'
                                      OR UPPER(ou.org_unit_name_en) LIKE '%' || UPPER(l_search) || '%'
                                      OR UPPER(ou.org_unit_name_ar) LIKE '%' || UPPER(l_search) || '%'
                                       )
                                 ORDER BY ou.org_unit_name_en, ou.org_unit_id
                                 OFFSET GREATEST(l_page - 1, 0) * l_page_size ROWS
                                 FETCH NEXT l_page_size ROWS ONLY
                              )
                     ),
                     TO_CLOB('[]')
                   ),
                   'total' VALUE l_total
                   RETURNING CLOB
                 )
            INTO p_result_json
            FROM DUAL;
        ELSE
          SELECT NVL(
                   JSON_ARRAYAGG(
                     JSON_OBJECT(
                       'id' VALUE RAWTOHEX(org_unit_id),
                       'name' VALUE NVL(org_unit_name_en, org_unit_name_ar),
                       'level' VALUE level_code
                       RETURNING CLOB
                     )
                     ORDER BY org_unit_name_en, org_unit_id
                     RETURNING CLOB
                   ),
                   TO_CLOB('[]')
                 )
            INTO p_result_json
            FROM ent.org_units ou
           WHERE ou.org_structure_id = l_struct_raw
             AND ou.level_code = l_parent_level
             AND ou.is_active = 'Y'
             AND (
                   l_search IS NULL
                OR UPPER(ou.org_unit_code) LIKE '%' || UPPER(l_search) || '%'
                OR UPPER(ou.org_unit_name_en) LIKE '%' || UPPER(l_search) || '%'
                OR UPPER(ou.org_unit_name_ar) LIKE '%' || UPPER(l_search) || '%'
                 );
          ent_json_util_pkg.wrap_list(p_result_json);
        END IF;
        ent_json_util_pkg.ok_msg(p_status, p_message);

      WHEN 'PARENT_HIERARCHY' THEN
        l_ou_hex := ent_json_util_pkg.jstr(p_payload_json, 'org_unit_id');

        IF l_eid IS NULL OR l_ou_hex IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'enterprise_id and org_unit_id are required');
          RETURN;
        END IF;
        SELECT NVL(
                 JSON_ARRAYAGG(
                   JSON_OBJECT(
                     'display_level' VALUE display_level,
                     'level_from_selected_node' VALUE level_from_selected_node,
                     'org_unit_id' VALUE org_unit_id,
                     'parent_org_unit_id' VALUE parent_org_unit_id,
                     'org_unit_code' VALUE org_unit_code,
                     'org_unit_name_en' VALUE org_unit_name_en,
                     'level_code' VALUE level_code,
                     'enterprise_id' VALUE enterprise_id
                     RETURNING CLOB
                   )
                   ORDER BY display_level
                   RETURNING CLOB
                 ),
                 TO_CLOB('[]')
               )
          INTO p_result_json
          FROM (
                 SELECT
                   ROW_NUMBER() OVER (ORDER BY lvl DESC) AS display_level,
                   lvl AS level_from_selected_node,
                   RAWTOHEX(org_unit_id) AS org_unit_id,
                   RAWTOHEX(parent_org_unit_id) AS parent_org_unit_id,
                   org_unit_code,
                   org_unit_name_en,
                   level_code,
                   enterprise_id
                 FROM (
                        SELECT
                          LEVEL AS lvl,
                          ou.org_unit_id,
                          ou.parent_org_unit_id,
                          ou.org_unit_code,
                          ou.org_unit_name_en,
                          ou.level_code,
                          ou.enterprise_id
                        FROM ent.org_units ou
                       START WITH ou.org_unit_id = HEXTORAW(UPPER(TRIM(l_ou_hex)))
                         AND ou.enterprise_id = l_eid
                     CONNECT BY NOCYCLE
                         PRIOR ou.parent_org_unit_id = ou.org_unit_id
                         AND PRIOR ou.enterprise_id = ou.enterprise_id
                      )
               );
        ent_json_util_pkg.wrap_list(p_result_json);
        ent_json_util_pkg.ok_msg(p_status, p_message);

      WHEN 'PARENT_OPTIONS_RESOLVE' THEN
        IF l_structure IS NULL OR l_child_level IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'structure_id and child_level_code are required');
          RETURN;
        END IF;
        l_struct_raw := HEXTORAW(UPPER(TRIM(l_structure)));
        BEGIN
          SELECT is_active INTO l_struct_active FROM ent.hr_org_structures WHERE structure_id = l_struct_raw;
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            SELECT JSON_OBJECT(
                     'struct_exists' VALUE 0,
                     'is_active' VALUE NULL,
                     'child_level_found' VALUE 0,
                     'parent_level_code' VALUE NULL,
                     'org_units' VALUE TO_CLOB('[]'),
                     'total' VALUE 0
                     RETURNING CLOB
                   )
              INTO p_result_json FROM DUAL;
            ent_json_util_pkg.ok_msg(p_status, p_message);
            RETURN;
        END;
        SELECT COUNT(*)
          INTO l_total
          FROM ent.hr_org_hierarchy_levels
         WHERE structure_id = l_struct_raw
           AND is_active = 'Y'
           AND UPPER(level_code) = UPPER(l_child_level);
        IF l_total = 0 THEN
          SELECT JSON_OBJECT(
                   'struct_exists' VALUE 1,
                   'is_active' VALUE l_struct_active,
                   'child_level_found' VALUE 0,
                   'parent_level_code' VALUE NULL,
                   'org_units' VALUE TO_CLOB('[]'),
                   'total' VALUE 0
                   RETURNING CLOB
                 )
            INTO p_result_json FROM DUAL;
          ent_json_util_pkg.ok_msg(p_status, p_message);
          RETURN;
        END IF;
        l_parent_level := parent_level_code_for_child(l_struct_raw, l_child_level);
        IF l_parent_level IS NULL THEN
          SELECT JSON_OBJECT(
                   'struct_exists' VALUE 1,
                   'is_active' VALUE l_struct_active,
                   'child_level_found' VALUE 1,
                   'parent_level_code' VALUE NULL,
                   'org_units' VALUE TO_CLOB('[]'),
                   'total' VALUE 0
                   RETURNING CLOB
                 )
            INTO p_result_json FROM DUAL;
          ent_json_util_pkg.ok_msg(p_status, p_message);
          RETURN;
        END IF;
        l_page_size := LEAST(100, NVL(l_page_size, 10));
        SELECT COUNT(*)
          INTO l_total
          FROM ent.org_units ou
         WHERE ou.org_structure_id = l_struct_raw
           AND ou.level_code = l_parent_level
           AND ou.is_active = 'Y'
           AND (
                 l_search IS NULL
              OR UPPER(ou.org_unit_code) LIKE '%' || UPPER(l_search) || '%'
              OR UPPER(ou.org_unit_name_en) LIKE '%' || UPPER(l_search) || '%'
              OR UPPER(ou.org_unit_name_ar) LIKE '%' || UPPER(l_search) || '%'
               );
        SELECT JSON_OBJECT(
                 'struct_exists' VALUE 1,
                 'is_active' VALUE l_is_active,
                 'child_level_found' VALUE 1,
                 'parent_level_code' VALUE l_parent_level,
                 'org_units' VALUE NVL(
                   (
                     SELECT JSON_ARRAYAGG(
                              JSON_OBJECT(
                                'id' VALUE RAWTOHEX(org_unit_id),
                                'name' VALUE NVL(org_unit_name_en, org_unit_name_ar),
                                'level' VALUE level_code
                                RETURNING CLOB
                              )
                              ORDER BY org_unit_name_en, org_unit_id
                              RETURNING CLOB
                            )
                       FROM (
                              SELECT ou.*
                                FROM ent.org_units ou
                               WHERE ou.org_structure_id = l_struct_raw
                                 AND ou.level_code = l_parent_level
                                 AND ou.is_active = 'Y'
                                 AND (
                                       l_search IS NULL
                                    OR UPPER(ou.org_unit_code) LIKE '%' || UPPER(l_search) || '%'
                                    OR UPPER(ou.org_unit_name_en) LIKE '%' || UPPER(l_search) || '%'
                                    OR UPPER(ou.org_unit_name_ar) LIKE '%' || UPPER(l_search) || '%'
                                     )
                               ORDER BY ou.org_unit_name_en, ou.org_unit_id
                               OFFSET GREATEST(l_page - 1, 0) * l_page_size ROWS
                               FETCH NEXT l_page_size ROWS ONLY
                            )
                   ),
                   TO_CLOB('[]')
                 ) FORMAT JSON,
                 'total' VALUE l_total
                 RETURNING CLOB
               )
          INTO p_result_json
          FROM DUAL;
        ent_json_util_pkg.ok_msg(p_status, p_message);

      WHEN 'GET' THEN
        l_ou_hex := ent_json_util_pkg.jstr(p_payload_json, 'org_unit_id');

        IF l_ou_hex IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'org_unit_id is required');
          RETURN;
        END IF;

        SELECT JSON_OBJECT(
                 'org_unit_id' VALUE org_unit_id,
                 'org_structure_id' VALUE org_structure_id,
                 'enterprise_id' VALUE enterprise_id,
                 'level_code' VALUE level_code,
                 'org_unit_code' VALUE org_unit_code,
                 'org_unit_name_en' VALUE org_unit_name_en,
                 'org_unit_name_ar' VALUE org_unit_name_ar,
                 'parent_org_unit_id' VALUE parent_org_unit_id,
                 'is_active' VALUE is_active,
                 'manager_name' VALUE manager_name,
                 'manager_email' VALUE manager_email,
                 'manager_phone' VALUE manager_phone,
                 'location' VALUE location,
                 'city' VALUE city,
                 'address' VALUE address,
                 'description' VALUE description,
                 'org_structure_name' VALUE org_structure_name,
                 'parent_org_unit_name_en' VALUE parent_org_unit_name_en,
                 'parent_org_unit_name_ar' VALUE parent_org_unit_name_ar,
                 'parent_org_level_code' VALUE parent_org_level_code
                 RETURNING CLOB
               )
          INTO p_result_json
          FROM ent.v_org_units
         WHERE org_unit_id = UPPER(l_ou_hex)
           AND (l_structure IS NULL OR org_structure_id = UPPER(l_structure));

        ent_json_util_pkg.ok_msg(p_status, p_message);

      WHEN 'CREATE' THEN
        SELECT RAWTOHEX(SYS_GUID())
          INTO l_ou_hex
          FROM dual;

        INSERT INTO ent.org_units (
          org_unit_id,
          org_structure_id,
          enterprise_id,
          level_code,
          org_unit_code,
          org_unit_name_en,
          org_unit_name_ar,
          parent_org_unit_id,
          is_active,
          manager_name,
          manager_email,
          manager_phone,
          location,
          city,
          address,
          description,
          created_by,
          created_date,
          last_updated_by,
          last_updated_date,
          last_update_login
        ) VALUES (
          HEXTORAW(l_ou_hex),
          HEXTORAW(UPPER(l_structure)),
          ent_json_util_pkg.jnum(p_payload_json, 'enterprise_id'),
          ent_json_util_pkg.jstr(p_payload_json, 'level_code'),
          ent_json_util_pkg.jstr(p_payload_json, 'org_unit_code'),
          ent_json_util_pkg.jstr(p_payload_json, 'org_unit_name_en'),
          ent_json_util_pkg.jstr(p_payload_json, 'org_unit_name_ar'),
          CASE
            WHEN l_parent IS NOT NULL THEN HEXTORAW(UPPER(l_parent))
          END,
          ent_json_util_pkg.yn(ent_json_util_pkg.jstr(p_payload_json, 'is_active'), 'Y'),
          ent_json_util_pkg.jstr(p_payload_json, 'manager_name'),
          ent_json_util_pkg.jstr(p_payload_json, 'manager_email'),
          ent_json_util_pkg.jstr(p_payload_json, 'manager_phone'),
          ent_json_util_pkg.jstr(p_payload_json, 'location'),
          ent_json_util_pkg.jstr(p_payload_json, 'city'),
          ent_json_util_pkg.jstr(p_payload_json, 'address'),
          ent_json_util_pkg.jstr(p_payload_json, 'description'),
          l_actor,
          SYSTIMESTAMP,
          l_actor,
          SYSTIMESTAMP,
          ent_json_util_pkg.jstr(p_payload_json, 'last_update_login')
        );

        l_get_payload :=
          TO_CLOB(
            '{"org_unit_id":"' || UPPER(l_ou_hex) ||
            '","structure_id":"' || UPPER(l_structure) || '"}'
          );

        org_units_action(
          'GET',
          l_get_payload,
          p_result_json,
          p_status,
          p_message
        );

        p_message := 'Org unit created';

      WHEN 'UPDATE' THEN
        l_ou_hex := ent_json_util_pkg.jstr(p_payload_json, 'org_unit_id');

        IF l_ou_hex IS NULL OR l_structure IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'org_unit_id and structure_id are required');
          RETURN;
        END IF;

        UPDATE ent.org_units ou
           SET org_unit_code = NVL(ent_json_util_pkg.jstr(p_payload_json, 'org_unit_code'), ou.org_unit_code),
               org_unit_name_en = NVL(ent_json_util_pkg.jstr(p_payload_json, 'org_unit_name_en'), ou.org_unit_name_en),
               org_unit_name_ar = NVL(ent_json_util_pkg.jstr(p_payload_json, 'org_unit_name_ar'), ou.org_unit_name_ar),
               parent_org_unit_id =
                 CASE
                   WHEN ent_json_util_pkg.jstr(p_payload_json, 'parent_org_unit_id') IS NOT NULL
                   THEN HEXTORAW(UPPER(ent_json_util_pkg.jstr(p_payload_json, 'parent_org_unit_id')))
                   ELSE ou.parent_org_unit_id
                 END,
               is_active =
                 CASE
                   WHEN ent_json_util_pkg.jstr(p_payload_json, 'is_active') IS NULL
                   THEN ou.is_active
                   ELSE ent_json_util_pkg.yn(ent_json_util_pkg.jstr(p_payload_json, 'is_active'), ou.is_active)
                 END,
               manager_name = NVL(ent_json_util_pkg.jstr(p_payload_json, 'manager_name'), ou.manager_name),
               manager_email = NVL(ent_json_util_pkg.jstr(p_payload_json, 'manager_email'), ou.manager_email),
               manager_phone = NVL(ent_json_util_pkg.jstr(p_payload_json, 'manager_phone'), ou.manager_phone),
               location = NVL(ent_json_util_pkg.jstr(p_payload_json, 'location'), ou.location),
               city = NVL(ent_json_util_pkg.jstr(p_payload_json, 'city'), ou.city),
               address = NVL(ent_json_util_pkg.jstr(p_payload_json, 'address'), ou.address),
               description = NVL(ent_json_util_pkg.jstr(p_payload_json, 'description'), ou.description),
               last_updated_by = l_actor,
               last_updated_date = SYSTIMESTAMP,
               last_update_login = NVL(ent_json_util_pkg.jstr(p_payload_json, 'last_update_login'), ou.last_update_login)
         WHERE ou.org_unit_id = HEXTORAW(UPPER(l_ou_hex))
           AND ou.org_structure_id = HEXTORAW(UPPER(l_structure));

        IF SQL%ROWCOUNT = 0 THEN
          ent_json_util_pkg.fail(p_status, p_message, 'Org unit not found');
          RETURN;
        END IF;

        l_get_payload :=
          TO_CLOB(
            '{"org_unit_id":"' || UPPER(l_ou_hex) ||
            '","structure_id":"' || UPPER(l_structure) || '"}'
          );

        org_units_action(
          'GET',
          l_get_payload,
          p_result_json,
          p_status,
          p_message
        );

        p_message := 'Org unit updated';

      WHEN 'DELETE' THEN
        l_ou_hex := ent_json_util_pkg.jstr(p_payload_json, 'org_unit_id');

        IF l_ou_hex IS NULL OR l_structure IS NULL THEN
          ent_json_util_pkg.fail(p_status, p_message, 'org_unit_id and structure_id are required');
          RETURN;
        END IF;

        IF NVL(ent_json_util_pkg.jnum(p_payload_json, 'hard'), 0) = 1 THEN
          DELETE FROM ent.org_units
           WHERE org_unit_id = HEXTORAW(UPPER(l_ou_hex))
             AND org_structure_id = HEXTORAW(UPPER(l_structure));
        ELSE
          UPDATE ent.org_units
             SET is_active = 'N',
                 last_updated_by = l_actor,
                 last_updated_date = SYSTIMESTAMP
           WHERE org_unit_id = HEXTORAW(UPPER(l_ou_hex))
             AND org_structure_id = HEXTORAW(UPPER(l_structure));
        END IF;

        IF SQL%ROWCOUNT = 0 THEN
          ent_json_util_pkg.fail(p_status, p_message, 'Org unit not found');
          RETURN;
        END IF;

        SELECT JSON_OBJECT(
                 'org_unit_id' VALUE UPPER(l_ou_hex),
                 'deleted'     VALUE 'Y'
                 RETURNING CLOB
               )
          INTO p_result_json
          FROM dual;

        ent_json_util_pkg.ok_msg(p_status, p_message, 'Org unit deleted');

      ELSE
        ent_json_util_pkg.fail(p_status, p_message, 'Unsupported ORG_UNITS action: ' || p_action);

    END CASE;

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      ent_json_util_pkg.fail(p_status, p_message, 'Org unit not found');

    WHEN DUP_VAL_ON_INDEX THEN
      ent_json_util_pkg.fail(p_status, p_message, 'Org unit already exists');

    WHEN OTHERS THEN
      RAISE_APPLICATION_ERROR(-21703, 'ORG_UNITS failed: ' || SQLERRM);

  END org_units_action;

  PROCEDURE INVOKE(
    p_action       IN  VARCHAR2,
    p_payload_json IN  CLOB,
    p_result_json  OUT CLOB,
    p_status       OUT VARCHAR2,
    p_message      OUT VARCHAR2
  ) IS
  BEGIN
    org_units_action(
      p_action,
      p_payload_json,
      p_result_json,
      p_status,
      p_message
    );
  END INVOKE;

END ORG_UNITS_PKG;
/
