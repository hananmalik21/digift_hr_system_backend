-- Deploy order:
-- 1) Inventory DB dependencies (FKs, views, MVs) on COMP.COMP_ADJUSTMENT_DETAILS.PLAN_ID;
--    see inventory_comp_adjustment_details_plan_id.sql for repo-side notes.
-- 2) Run alter_comp_adjustment_details_drop_plan_id.sql (or MODIFY NULL) when ready.
-- 3) Run this entire script as COMP (SQL*Plus / SQLcl: @deploy_employee_compensation_multi_plan.sql).
-- 4) Deploy Node app: plan_id on each component JSON row for create + edit; bind :plan_id NULL when all rows carry plan_id.

-- =============================================================================
-- COMP.EMPLOYEE_COMPENSATION — package spec (multi-plan adjustment header)
-- Deploy AFTER: COMP.COMP_ADJUSTMENT_DETAILS.PLAN_ID dropped (or nullable + unused).
-- Node expects: t_component_rec.plan_id + create_components/edit_components(p_plan_id DEFAULT NULL).
-- =============================================================================

CREATE OR REPLACE EDITIONABLE PACKAGE comp.employee_compensation AS

  TYPE t_component_rec IS RECORD (
      component_id          NUMBER,
      plan_id               NUMBER,
      amount                NUMBER,
      currency_code         VARCHAR2(10),
      effective_start_date  DATE,
      effective_end_date    DATE,
      active_flag           CHAR(1),
      adjustment_method     VARCHAR2(100),
      replace_flag          VARCHAR2(10),
      delete_flag           VARCHAR2(10)
  );

  TYPE t_component_tab IS TABLE OF t_component_rec;

  TYPE t_doc_rec IS RECORD (
      file_name         VARCHAR2(255),
      file_extension    VARCHAR2(50),
      mime_type         VARCHAR2(150),
      file_size_bytes   NUMBER,
      file_content      BLOB,
      file_description  VARCHAR2(500),
      active_flag       CHAR(1)
  );

  TYPE t_doc_tab IS TABLE OF t_doc_rec;

  PROCEDURE create_components (
      p_enterprise_id IN NUMBER,
      p_employee_id   IN NUMBER,
      p_plan_id       IN NUMBER DEFAULT NULL,
      p_components    IN t_component_tab,
      p_created_by    IN VARCHAR2
  );

  PROCEDURE edit_components (
      p_enterprise_id      IN NUMBER,
      p_employee_id        IN NUMBER,
      p_plan_id            IN NUMBER DEFAULT NULL,
      p_adjustment_type    IN VARCHAR2,
      p_effective_date     IN DATE,
      p_reason_code        IN VARCHAR2,
      p_budget_code        IN VARCHAR2,
      p_justification_text IN CLOB,
      p_performance_rating IN VARCHAR2 DEFAULT NULL,
      p_internal_notes     IN CLOB DEFAULT NULL,
      p_components         IN t_component_tab,
      p_docs               IN t_doc_tab,
      p_updated_by         IN VARCHAR2
  );

END employee_compensation;
/

-- =============================================================================
-- COMP.EMPLOYEE_COMPENSATION — package body (multi-plan adjustment)
-- One COMP_ADJUSTMENT_DETAILS row per edit (no PLAN_ID on header).
-- PLAN_ID stored per COMP_ADJUSTMENT_LINES / assignment / history row via l_line_plan_id.
-- =============================================================================

CREATE OR REPLACE EDITIONABLE PACKAGE BODY comp.employee_compensation AS

  FUNCTION flag_true(p_val IN VARCHAR2) RETURN BOOLEAN IS
    v VARCHAR2(32);
  BEGIN
    v := UPPER(TRIM(p_val));
    RETURN v IN ('TRUE','1','Y','YES');
  END;

  PROCEDURE create_components (
      p_enterprise_id IN NUMBER,
      p_employee_id   IN NUMBER,
      p_plan_id       IN NUMBER DEFAULT NULL,
      p_components    IN t_component_tab,
      p_created_by    IN VARCHAR2
  ) IS
      l_exists         NUMBER;
      l_dummy          NUMBER;
      l_active_flag    CHAR(1);
      l_line_plan_id   NUMBER;
  BEGIN
      IF p_enterprise_id IS NULL THEN
         RAISE_APPLICATION_ERROR(-20001, 'ENTERPRISE_ID is required');
      END IF;

      IF p_employee_id IS NULL THEN
         RAISE_APPLICATION_ERROR(-20002, 'EMPLOYEE_ID is required');
      END IF;

      IF p_created_by IS NULL THEN
         RAISE_APPLICATION_ERROR(-20004, 'CREATED_BY is required');
      END IF;

      IF p_components IS NULL OR p_components.COUNT = 0 THEN
         RAISE_APPLICATION_ERROR(-20005, 'At least one component is required');
      END IF;

      FOR i_chk IN 1 .. p_components.COUNT LOOP
         IF NVL(p_components(i_chk).plan_id, p_plan_id) IS NULL THEN
            RAISE_APPLICATION_ERROR(-20003, 'PLAN_ID is required on each component or as p_plan_id');
         END IF;
      END LOOP;

      FOR i_chk IN 1 .. p_components.COUNT LOOP
         l_line_plan_id := NVL(p_components(i_chk).plan_id, p_plan_id);
         SELECT COUNT(*)
           INTO l_exists
           FROM COMP.COMP_EMP_COMP_ASSIGNMENT_DTL d
          WHERE d.ENTERPRISE_ID = p_enterprise_id
            AND d.EMPLOYEE_ID   = p_employee_id
            AND d.PLAN_ID       = l_line_plan_id
            AND NVL(d.ACTIVE_FLAG, 'Y') = 'Y';

         IF l_exists > 0 THEN
            RAISE_APPLICATION_ERROR(-20006, 'Plan is already attached with employee for PLAN_ID ' || l_line_plan_id);
         END IF;
      END LOOP;

      FOR i IN 1 .. p_components.COUNT LOOP
         l_line_plan_id := NVL(p_components(i).plan_id, p_plan_id);

         IF p_components(i).component_id IS NULL THEN
            RAISE_APPLICATION_ERROR(-20007, 'COMPONENT_ID is required at row ' || i);
         END IF;

         IF p_components(i).amount IS NULL THEN
            RAISE_APPLICATION_ERROR(-20008, 'AMOUNT is required at row ' || i);
         END IF;

         IF p_components(i).currency_code IS NULL THEN
            RAISE_APPLICATION_ERROR(-20009, 'CURRENCY_CODE is required at row ' || i);
         END IF;

         IF p_components(i).effective_start_date IS NULL THEN
            RAISE_APPLICATION_ERROR(-20010, 'EFFECTIVE_START_DATE is required at row ' || i);
         END IF;

         IF p_components(i).effective_end_date IS NOT NULL
            AND p_components(i).effective_end_date < p_components(i).effective_start_date THEN
            RAISE_APPLICATION_ERROR(-20011, 'EFFECTIVE_END_DATE cannot be before EFFECTIVE_START_DATE at row ' || i);
         END IF;

         l_active_flag := NVL(p_components(i).active_flag, 'Y');

         IF l_active_flag NOT IN ('Y', 'N') THEN
            RAISE_APPLICATION_ERROR(-20012, 'ACTIVE_FLAG must be Y or N at row ' || i);
         END IF;

         SELECT 1
           INTO l_dummy
           FROM COMP.COMP_PLAN_COMPONENTS pc
          WHERE pc.PLAN_ID      = l_line_plan_id
            AND pc.COMPONENT_ID = p_components(i).component_id;

         INSERT INTO COMP.COMP_EMP_COMP_ASSIGNMENT_DTL (
             ADJUSTMENT_ID,
             CHANGE_SOURCE,
             ASSIGNMENT_DETAIL_ID,
             ASSIGNMENT_DETAIL_GUID,
             ENTERPRISE_ID,
             EMPLOYEE_ID,
             PLAN_ID,
             COMPONENT_ID,
             AMOUNT,
             CURRENCY_CODE,
             EFFECTIVE_START_DATE,
             EFFECTIVE_END_DATE,
             CREATED_BY,
             CREATION_DATE,
             LAST_UPDATED_BY,
             LAST_UPDATE_DATE,
             ACTIVE_FLAG
         )
         VALUES (
             NULL,
             'MANUAL',
             COMP.COMP_EMP_COMP_ASSIGNMENT_DTL_S.NEXTVAL,
             RAWTOHEX(SYS_GUID()),
             p_enterprise_id,
             p_employee_id,
             l_line_plan_id,
             p_components(i).component_id,
             p_components(i).amount,
             p_components(i).currency_code,
             p_components(i).effective_start_date,
             p_components(i).effective_end_date,
             p_created_by,
             SYSDATE,
             p_created_by,
             SYSDATE,
             l_active_flag
         );
      END LOOP;

  EXCEPTION
      WHEN NO_DATA_FOUND THEN
         RAISE_APPLICATION_ERROR(-20013, 'Invalid PLAN_ID / COMPONENT_ID mapping in COMP_PLAN_COMPONENTS');
  END create_components;


  PROCEDURE edit_components (
      p_enterprise_id      IN NUMBER,
      p_employee_id        IN NUMBER,
      p_plan_id            IN NUMBER DEFAULT NULL,
      p_adjustment_type    IN VARCHAR2,
      p_effective_date     IN DATE,
      p_reason_code        IN VARCHAR2,
      p_budget_code        IN VARCHAR2,
      p_justification_text IN CLOB,
      p_performance_rating IN VARCHAR2 DEFAULT NULL,
      p_internal_notes     IN CLOB DEFAULT NULL,
      p_components         IN t_component_tab,
      p_docs               IN t_doc_tab,
      p_updated_by         IN VARCHAR2
  ) IS
      l_adjustment_id        NUMBER;
      l_exists               NUMBER;
      l_dummy                NUMBER;
      l_active_flag          CHAR(1);
      l_doc_active           CHAR(1);
      l_line_plan_id         NUMBER;

      l_old_assignment_id    NUMBER;
      l_old_amount           NUMBER;
      l_old_currency_code    VARCHAR2(10);
      l_old_eff_start_date   DATE;
      l_old_eff_end_date     DATE;

      l_new_assignment_id    NUMBER;

      l_replace              BOOLEAN;
      l_delete               BOOLEAN;
      l_has_old_assignment   BOOLEAN;
  BEGIN
      IF p_enterprise_id IS NULL THEN
         RAISE_APPLICATION_ERROR(-20101, 'ENTERPRISE_ID is required');
      END IF;

      IF p_employee_id IS NULL THEN
         RAISE_APPLICATION_ERROR(-20102, 'EMPLOYEE_ID is required');
      END IF;

      IF p_adjustment_type IS NULL THEN
         RAISE_APPLICATION_ERROR(-20104, 'ADJUSTMENT_TYPE is required');
      END IF;

      IF p_effective_date IS NULL THEN
         RAISE_APPLICATION_ERROR(-20105, 'EFFECTIVE_DATE is required');
      END IF;

      IF p_reason_code IS NULL THEN
         RAISE_APPLICATION_ERROR(-20106, 'REASON_CODE is required');
      END IF;

      IF p_budget_code IS NULL THEN
         RAISE_APPLICATION_ERROR(-20107, 'BUDGET_CODE is required');
      END IF;

      IF p_justification_text IS NULL THEN
         RAISE_APPLICATION_ERROR(-20108, 'JUSTIFICATION_TEXT is required');
      END IF;

      IF p_updated_by IS NULL THEN
         RAISE_APPLICATION_ERROR(-20109, 'UPDATED_BY is required');
      END IF;

      IF p_components IS NULL OR p_components.COUNT = 0 THEN
         RAISE_APPLICATION_ERROR(-20110, 'At least one component is required');
      END IF;

      FOR i_chk IN 1 .. p_components.COUNT LOOP
         IF NVL(p_components(i_chk).plan_id, p_plan_id) IS NULL THEN
            RAISE_APPLICATION_ERROR(-20103, 'PLAN_ID is required on each component or as p_plan_id');
         END IF;
      END LOOP;

      FOR i_chk IN 1 .. p_components.COUNT LOOP
         l_line_plan_id := NVL(p_components(i_chk).plan_id, p_plan_id);
         SELECT COUNT(*)
           INTO l_exists
           FROM COMP.COMP_EMP_COMP_ASSIGNMENT_DTL d
          WHERE d.ENTERPRISE_ID = p_enterprise_id
            AND d.EMPLOYEE_ID   = p_employee_id
            AND d.PLAN_ID       = l_line_plan_id
            AND NVL(d.ACTIVE_FLAG, 'Y') = 'Y';

         IF l_exists = 0 THEN
            RAISE_APPLICATION_ERROR(-20111, 'Plan is not attached with employee for PLAN_ID ' || l_line_plan_id);
         END IF;
      END LOOP;

      INSERT INTO COMP.COMP_ADJUSTMENT_DETAILS (
          ADJUSTMENT_ID,
          ADJUSTMENT_GUID,
          ENTERPRISE_ID,
          EMPLOYEE_ID,
          ADJUSTMENT_TYPE,
          EFFECTIVE_DATE,
          REASON_CODE,
          BUDGET_CODE,
          JUSTIFICATION_TEXT,
          PERFORMANCE_RATING,
          INTERNAL_NOTES,
          STATUS,
          ACTIVE_FLAG,
          CREATED_BY,
          CREATION_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
      )
      VALUES (
          COMP.COMP_ADJUSTMENT_DETAILS_S.NEXTVAL,
          RAWTOHEX(SYS_GUID()),
          p_enterprise_id,
          p_employee_id,
          p_adjustment_type,
          p_effective_date,
          p_reason_code,
          p_budget_code,
          p_justification_text,
          p_performance_rating,
          p_internal_notes,
          'APPROVED',
          'Y',
          p_updated_by,
          SYSDATE,
          p_updated_by,
          SYSDATE
      )
      RETURNING ADJUSTMENT_ID INTO l_adjustment_id;

      IF p_docs IS NOT NULL AND p_docs.COUNT > 0 THEN
         FOR j IN 1 .. p_docs.COUNT LOOP
            IF p_docs(j).file_name IS NULL THEN
               RAISE_APPLICATION_ERROR(-20112, 'FILE_NAME is required at document row ' || j);
            END IF;

            IF p_docs(j).file_content IS NULL THEN
               RAISE_APPLICATION_ERROR(-20113, 'FILE_CONTENT is required at document row ' || j);
            END IF;

            l_doc_active := NVL(p_docs(j).active_flag, 'Y');

            IF l_doc_active NOT IN ('Y', 'N') THEN
               RAISE_APPLICATION_ERROR(-20114, 'Document ACTIVE_FLAG must be Y or N at row ' || j);
            END IF;

            INSERT INTO COMP.COMP_ADJUSTMENT_DOCS (
                DOC_ID,
                DOC_GUID,
                ADJUSTMENT_ID,
                FILE_NAME,
                FILE_EXTENSION,
                MIME_TYPE,
                FILE_SIZE_BYTES,
                FILE_CONTENT,
                FILE_DESCRIPTION,
                ACTIVE_FLAG,
                CREATED_BY,
                CREATION_DATE,
                LAST_UPDATED_BY,
                LAST_UPDATE_DATE
            )
            VALUES (
                COMP.COMP_ADJUSTMENT_DOCS_S.NEXTVAL,
                RAWTOHEX(SYS_GUID()),
                l_adjustment_id,
                p_docs(j).file_name,
                p_docs(j).file_extension,
                p_docs(j).mime_type,
                p_docs(j).file_size_bytes,
                p_docs(j).file_content,
                p_docs(j).file_description,
                l_doc_active,
                p_updated_by,
                SYSDATE,
                p_updated_by,
                SYSDATE
            );
         END LOOP;
      END IF;

      FOR i IN 1 .. p_components.COUNT LOOP
         l_line_plan_id := NVL(p_components(i).plan_id, p_plan_id);
         l_replace := flag_true(p_components(i).replace_flag);
         l_delete  := flag_true(p_components(i).delete_flag);

         l_has_old_assignment := FALSE;
         l_new_assignment_id  := NULL;

         IF p_components(i).component_id IS NULL THEN
            RAISE_APPLICATION_ERROR(-20115, 'COMPONENT_ID is required at row ' || i);
         END IF;

         IF l_delete AND l_replace THEN
            RAISE_APPLICATION_ERROR(-20126, 'replace_flag and delete_flag cannot both be TRUE at row ' || i);
         END IF;

         IF p_components(i).effective_start_date IS NULL THEN
            RAISE_APPLICATION_ERROR(-20118, 'EFFECTIVE_START_DATE is required at row ' || i);
         END IF;

         IF NOT l_delete THEN
            IF p_components(i).amount IS NULL THEN
               RAISE_APPLICATION_ERROR(-20116, 'AMOUNT is required at row ' || i);
            END IF;

            IF p_components(i).currency_code IS NULL THEN
               RAISE_APPLICATION_ERROR(-20117, 'CURRENCY_CODE is required at row ' || i);
            END IF;

            IF p_components(i).adjustment_method IS NULL THEN
               RAISE_APPLICATION_ERROR(-20123, 'ADJUSTMENT_METHOD is required at row ' || i);
            END IF;
         END IF;

         IF p_components(i).effective_end_date IS NOT NULL
            AND p_components(i).effective_end_date < p_components(i).effective_start_date THEN
            RAISE_APPLICATION_ERROR(-20119, 'EFFECTIVE_END_DATE cannot be before EFFECTIVE_START_DATE at row ' || i);
         END IF;

         l_active_flag := NVL(p_components(i).active_flag, 'Y');

         IF l_active_flag NOT IN ('Y', 'N') THEN
            RAISE_APPLICATION_ERROR(-20120, 'ACTIVE_FLAG must be Y or N at row ' || i);
         END IF;

         SELECT 1
           INTO l_dummy
           FROM COMP.COMP_PLAN_COMPONENTS pc
          WHERE pc.PLAN_ID      = l_line_plan_id
            AND pc.COMPONENT_ID = p_components(i).component_id;

         BEGIN
            SELECT d.ASSIGNMENT_DETAIL_ID,
                   d.AMOUNT,
                   d.CURRENCY_CODE,
                   d.EFFECTIVE_START_DATE,
                   d.EFFECTIVE_END_DATE
              INTO l_old_assignment_id,
                   l_old_amount,
                   l_old_currency_code,
                   l_old_eff_start_date,
                   l_old_eff_end_date
              FROM COMP.COMP_EMP_COMP_ASSIGNMENT_DTL d
             WHERE d.ENTERPRISE_ID = p_enterprise_id
               AND d.EMPLOYEE_ID   = p_employee_id
               AND d.PLAN_ID       = l_line_plan_id
               AND d.COMPONENT_ID  = p_components(i).component_id
               AND NVL(d.ACTIVE_FLAG, 'Y') = 'Y'
               AND ROWNUM = 1
             FOR UPDATE;

            l_has_old_assignment := TRUE;
         EXCEPTION
            WHEN NO_DATA_FOUND THEN
               l_has_old_assignment := FALSE;
         END;

         IF l_delete THEN
            IF NOT l_has_old_assignment THEN
               RAISE_APPLICATION_ERROR(
                 -20121,
                 'Active component does not exist for COMPONENT_ID ' || p_components(i).component_id
               );
            END IF;

            UPDATE COMP.COMP_EMP_COMP_ASSIGNMENT_DTL d
               SET d.EFFECTIVE_END_DATE = p_components(i).effective_start_date,
                   d.ACTIVE_FLAG        = 'N',
                   d.LAST_UPDATED_BY    = p_updated_by,
                   d.LAST_UPDATE_DATE   = SYSDATE
             WHERE d.ASSIGNMENT_DETAIL_ID = l_old_assignment_id;

            INSERT INTO COMP.COMP_ADJUSTMENT_LINES (
                ADJUSTMENT_LINE_ID, ADJUSTMENT_LINE_GUID, ADJUSTMENT_ID,
                ENTERPRISE_ID, EMPLOYEE_ID, PLAN_ID, COMPONENT_ID,
                OLD_ASSIGNMENT_DETAIL_ID, NEW_ASSIGNMENT_DETAIL_ID,
                OLD_AMOUNT, NEW_AMOUNT,
                OLD_EFFECTIVE_START_DATE, OLD_EFFECTIVE_END_DATE,
                NEW_EFFECTIVE_START_DATE, NEW_EFFECTIVE_END_DATE,
                ADJUSTMENT_METHOD, ACTIVE_FLAG, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
            ) VALUES (
                COMP.COMP_ADJUSTMENT_LINES_S.NEXTVAL, RAWTOHEX(SYS_GUID()), l_adjustment_id,
                p_enterprise_id, p_employee_id, l_line_plan_id, p_components(i).component_id,
                l_old_assignment_id, NULL,
                l_old_amount, NULL,
                l_old_eff_start_date, l_old_eff_end_date,
                p_components(i).effective_start_date, p_components(i).effective_end_date,
                NVL(p_components(i).adjustment_method,'DELETE'),
                'Y', p_updated_by, SYSDATE, p_updated_by, SYSDATE
            );

            INSERT INTO COMP.COMP_EMP_COMP_HISTORY (
                HISTORY_ID, HISTORY_GUID, ENTERPRISE_ID, EMPLOYEE_ID, PLAN_ID, COMPONENT_ID,
                ASSIGNMENT_DETAIL_ID, EVENT_TYPE, EVENT_TITLE, EVENT_DESCRIPTION,
                OLD_AMOUNT, NEW_AMOUNT, CURRENCY_CODE, EFFECTIVE_DATE,
                APPROVED_BY, APPROVER_NAME, APPROVER_ROLE, CHANGE_REASON,
                ACTIVE_FLAG, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
            ) VALUES (
                COMP.COMP_EMP_COMP_HISTORY_S.NEXTVAL, RAWTOHEX(SYS_GUID()),
                p_enterprise_id, p_employee_id, l_line_plan_id, p_components(i).component_id,
                l_old_assignment_id,
                p_adjustment_type, p_adjustment_type, p_reason_code,
                l_old_amount, NULL, l_old_currency_code, p_effective_date,
                p_updated_by, p_updated_by, 'SYSTEM', DBMS_LOB.SUBSTR(p_justification_text,4000,1),
                'Y', p_updated_by, SYSDATE, p_updated_by, SYSDATE
            );

         ELSIF l_replace THEN
            IF l_has_old_assignment THEN
               UPDATE COMP.COMP_EMP_COMP_ASSIGNMENT_DTL d
                  SET d.EFFECTIVE_END_DATE = p_components(i).effective_start_date,
                      d.ACTIVE_FLAG        = 'N',
                      d.LAST_UPDATED_BY    = p_updated_by,
                      d.LAST_UPDATE_DATE   = SYSDATE
                WHERE d.ASSIGNMENT_DETAIL_ID = l_old_assignment_id;
            END IF;

            INSERT INTO COMP.COMP_EMP_COMP_ASSIGNMENT_DTL (
                ADJUSTMENT_ID, CHANGE_SOURCE, ASSIGNMENT_DETAIL_ID, ASSIGNMENT_DETAIL_GUID,
                ENTERPRISE_ID, EMPLOYEE_ID, PLAN_ID, COMPONENT_ID,
                AMOUNT, CURRENCY_CODE, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE,
                CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE, ACTIVE_FLAG
            ) VALUES (
                l_adjustment_id, 'ADJUSTMENT', COMP.COMP_EMP_COMP_ASSIGNMENT_DTL_S.NEXTVAL, RAWTOHEX(SYS_GUID()),
                p_enterprise_id, p_employee_id, l_line_plan_id, p_components(i).component_id,
                p_components(i).amount, p_components(i).currency_code,
                p_components(i).effective_start_date, p_components(i).effective_end_date,
                p_updated_by, SYSDATE, p_updated_by, SYSDATE, l_active_flag
            )
            RETURNING ASSIGNMENT_DETAIL_ID INTO l_new_assignment_id;

            INSERT INTO COMP.COMP_ADJUSTMENT_LINES (
                ADJUSTMENT_LINE_ID, ADJUSTMENT_LINE_GUID, ADJUSTMENT_ID,
                ENTERPRISE_ID, EMPLOYEE_ID, PLAN_ID, COMPONENT_ID,
                OLD_ASSIGNMENT_DETAIL_ID, NEW_ASSIGNMENT_DETAIL_ID,
                OLD_AMOUNT, NEW_AMOUNT,
                OLD_EFFECTIVE_START_DATE, OLD_EFFECTIVE_END_DATE,
                NEW_EFFECTIVE_START_DATE, NEW_EFFECTIVE_END_DATE,
                ADJUSTMENT_METHOD, ACTIVE_FLAG, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
            ) VALUES (
                COMP.COMP_ADJUSTMENT_LINES_S.NEXTVAL, RAWTOHEX(SYS_GUID()), l_adjustment_id,
                p_enterprise_id, p_employee_id, l_line_plan_id, p_components(i).component_id,
                CASE WHEN l_has_old_assignment THEN l_old_assignment_id ELSE NULL END,
                l_new_assignment_id,
                CASE WHEN l_has_old_assignment THEN l_old_amount ELSE NULL END,
                p_components(i).amount,
                CASE WHEN l_has_old_assignment THEN l_old_eff_start_date ELSE NULL END,
                CASE WHEN l_has_old_assignment THEN l_old_eff_end_date ELSE NULL END,
                p_components(i).effective_start_date, p_components(i).effective_end_date,
                p_components(i).adjustment_method,
                'Y', p_updated_by, SYSDATE, p_updated_by, SYSDATE
            );

            INSERT INTO COMP.COMP_EMP_COMP_HISTORY (
                HISTORY_ID, HISTORY_GUID, ENTERPRISE_ID, EMPLOYEE_ID, PLAN_ID, COMPONENT_ID,
                ASSIGNMENT_DETAIL_ID, EVENT_TYPE, EVENT_TITLE, EVENT_DESCRIPTION,
                OLD_AMOUNT, NEW_AMOUNT, CURRENCY_CODE, EFFECTIVE_DATE,
                APPROVED_BY, APPROVER_NAME, APPROVER_ROLE, CHANGE_REASON,
                ACTIVE_FLAG, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
            ) VALUES (
                COMP.COMP_EMP_COMP_HISTORY_S.NEXTVAL, RAWTOHEX(SYS_GUID()),
                p_enterprise_id, p_employee_id, l_line_plan_id, p_components(i).component_id,
                l_new_assignment_id,
                p_adjustment_type, p_adjustment_type, p_reason_code,
                CASE WHEN l_has_old_assignment THEN l_old_amount ELSE NULL END,
                p_components(i).amount,
                p_components(i).currency_code,
                p_effective_date,
                p_updated_by, p_updated_by, 'SYSTEM', DBMS_LOB.SUBSTR(p_justification_text,4000,1),
                'Y', p_updated_by, SYSDATE, p_updated_by, SYSDATE
            );

         ELSE
            IF NOT l_has_old_assignment THEN
               RAISE_APPLICATION_ERROR(
                 -20121,
                 'Active component does not exist for COMPONENT_ID ' || p_components(i).component_id
               );
            END IF;

            UPDATE COMP.COMP_EMP_COMP_ASSIGNMENT_DTL d
               SET d.AMOUNT               = p_components(i).amount,
                   d.CURRENCY_CODE        = p_components(i).currency_code,
                   d.EFFECTIVE_START_DATE = p_components(i).effective_start_date,
                   d.EFFECTIVE_END_DATE   = p_components(i).effective_end_date,
                   d.ACTIVE_FLAG          = l_active_flag,
                   d.LAST_UPDATED_BY      = p_updated_by,
                   d.LAST_UPDATE_DATE     = SYSDATE
             WHERE d.ASSIGNMENT_DETAIL_ID = l_old_assignment_id;

            INSERT INTO COMP.COMP_ADJUSTMENT_LINES (
                ADJUSTMENT_LINE_ID, ADJUSTMENT_LINE_GUID, ADJUSTMENT_ID,
                ENTERPRISE_ID, EMPLOYEE_ID, PLAN_ID, COMPONENT_ID,
                OLD_ASSIGNMENT_DETAIL_ID, NEW_ASSIGNMENT_DETAIL_ID,
                OLD_AMOUNT, NEW_AMOUNT,
                OLD_EFFECTIVE_START_DATE, OLD_EFFECTIVE_END_DATE,
                NEW_EFFECTIVE_START_DATE, NEW_EFFECTIVE_END_DATE,
                ADJUSTMENT_METHOD, ACTIVE_FLAG, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
            ) VALUES (
                COMP.COMP_ADJUSTMENT_LINES_S.NEXTVAL, RAWTOHEX(SYS_GUID()), l_adjustment_id,
                p_enterprise_id, p_employee_id, l_line_plan_id, p_components(i).component_id,
                l_old_assignment_id, l_old_assignment_id,
                l_old_amount, p_components(i).amount,
                l_old_eff_start_date, l_old_eff_end_date,
                p_components(i).effective_start_date, p_components(i).effective_end_date,
                p_components(i).adjustment_method,
                'Y', p_updated_by, SYSDATE, p_updated_by, SYSDATE
            );

            INSERT INTO COMP.COMP_EMP_COMP_HISTORY (
                HISTORY_ID, HISTORY_GUID, ENTERPRISE_ID, EMPLOYEE_ID, PLAN_ID, COMPONENT_ID,
                ASSIGNMENT_DETAIL_ID, EVENT_TYPE, EVENT_TITLE, EVENT_DESCRIPTION,
                OLD_AMOUNT, NEW_AMOUNT, CURRENCY_CODE, EFFECTIVE_DATE,
                APPROVED_BY, APPROVER_NAME, APPROVER_ROLE, CHANGE_REASON,
                ACTIVE_FLAG, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
            ) VALUES (
                COMP.COMP_EMP_COMP_HISTORY_S.NEXTVAL, RAWTOHEX(SYS_GUID()),
                p_enterprise_id, p_employee_id, l_line_plan_id, p_components(i).component_id,
                l_old_assignment_id,
                p_adjustment_type, p_adjustment_type, p_reason_code,
                l_old_amount, p_components(i).amount, p_components(i).currency_code,
                p_effective_date,
                p_updated_by, p_updated_by, 'SYSTEM', DBMS_LOB.SUBSTR(p_justification_text,4000,1),
                'Y', p_updated_by, SYSDATE, p_updated_by, SYSDATE
            );
         END IF;

      END LOOP;

  EXCEPTION
      WHEN NO_DATA_FOUND THEN
         RAISE_APPLICATION_ERROR(-20122, 'Invalid PLAN_ID / COMPONENT_ID mapping in COMP_PLAN_COMPONENTS');
  END edit_components;

END employee_compensation;
/
