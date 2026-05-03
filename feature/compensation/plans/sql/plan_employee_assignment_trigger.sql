-- =============================================================================
-- Compensation plan: auto-attach employees from EMPL.ASSIGNMENTS
-- =============================================================================
-- Job family + contract + grade + position + business unit:
--   COMP_PLAN_JOB_FAMILY / EMPLOYMENT_TYPE / GRADES / POSITIONS as in body.
--   COMP_PLAN_BUSINESS_UNIT:
--   • org_structure_list IS NOT NULL → match only the node with level_code
--     BUSINESS_UNIT (UPPER); compare TRIM + strip '-' on JSON org_unit_id to
--     UPPER(RAWTOHEX(b.org_unit_id)). Do not use assignments.org_unit_id here or
--     SECTION-level id would bypass BU.
--   • org_structure_list IS NULL → fallback b.org_unit_id = a.org_unit_id.
--
-- Plan header: COMP.COMP_PLANS (PLAN_ID, ENTERPRISE_ID).
-- Latest assignment per employee: ROW_NUMBER() OVER (PARTITION BY employee, enterprise …).
--
-- ORA-04091: trigger uses SYNC_FOR_PLAN(plan_id, enterprise_id) — no SELECT
-- on COMP.COMP_PLANS during row insert.
--
-- ORA-01008: EXECUTE IMMEDIATE binds are positional (each :1 occurrence counts).
-- This body uses static SQL so p_plan_id / p_enterprise_id bind once.
--
-- ORA-02287: sequence not allowed with DISTINCT / GROUP BY / UNION in same SELECT.
--   Do not use DISTINCT on the same SELECT list as NEXTVAL; use inner subquery if needed.
-- ORA-00942: wrong object name. List COMP plan tables:
--   SELECT table_name FROM all_tables WHERE owner='COMP' AND UPPER(table_name) LIKE '%PLAN%';
-- ORA-02289: create COMP.COMP_PLAN_EMP_ASSIGNMENT_SEQ (block below) or align name in INSERT.
-- Link INSERT uses COMP.COMP_PLAN_EMP_ASSIGNMENT_SEQ.NEXTVAL — rename if your DB differs.
-- Cursor rule: .cursor/rules/comp-plan-employee-oracle.mdc
--
-- GET_ELIGIBLE_PLANS_FOR_EMPLOYEE(employee_id, enterprise_id, OUT ref cursor):
--   Plans the employee matches (same rules as SYNC_FOR_PLAN_CORE).
-- GET_ELIGIBLE_EMPLOYEES_FOR_PLAN(plan_id, OUT ref cursor):
--   Employees who match that plan (reads enterprise_id from COMP.COMP_PLANS).
--
-- ⚠ TIMING: sync after all plan criteria child rows exist (incl. BUSINESS_UNIT).
-- Node: compensationPlanService calls SYNC after CREATE_PLAN.
-- Sequence for COMP_PLAN_EMP_ASSIGNMENT.ASSIGNMENT_ID (script creates if missing):
-- =============================================================================

BEGIN
  EXECUTE IMMEDIATE
    'CREATE SEQUENCE COMP.COMP_PLAN_EMP_ASSIGNMENT_SEQ START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      NULL; /* ORA-00955: sequence already exists */
    ELSE
      RAISE;
    END IF;
END;
/

CREATE OR REPLACE PACKAGE COMP.PKG_PLAN_EMPLOYEES AS
  /* Package-level ref cursor: avoids PLS-00103 on SYS.REFCURSOR in some clients / parsers. */
  TYPE t_eligible_plans_cur IS REF CURSOR;

  PROCEDURE SYNC_FOR_PLAN(p_plan_id IN NUMBER, p_enterprise_id IN NUMBER);
  PROCEDURE SYNC_FOR_PLAN(p_plan_id IN NUMBER);
  -- Plans in p_enterprise_id matching employee current assignment (same rules as SYNC_FOR_PLAN_CORE).
  PROCEDURE GET_ELIGIBLE_PLANS_FOR_EMPLOYEE(
    p_employee_id   IN NUMBER,
    p_enterprise_id IN NUMBER,
    p_result_set    OUT t_eligible_plans_cur
  );
  PROCEDURE GET_ELIGIBLE_EMPLOYEES_FOR_PLAN(
    p_plan_id    IN NUMBER,
    p_result_set OUT t_eligible_plans_cur
  );
END PKG_PLAN_EMPLOYEES;
/

CREATE OR REPLACE PACKAGE BODY COMP.PKG_PLAN_EMPLOYEES AS

  PROCEDURE SYNC_FOR_PLAN_CORE(p_plan_id IN NUMBER, p_enterprise_id IN NUMBER) IS
  BEGIN
    IF p_plan_id IS NULL OR p_enterprise_id IS NULL THEN
      RETURN;
    END IF;

    DELETE FROM comp.comp_plan_emp_assignment
     WHERE plan_id = p_plan_id;

    INSERT INTO comp.comp_plan_emp_assignment (
      assignment_id,
      assignment_guid,
      plan_id,
      employee_id,
      employee_guid,
      enterprise_id,
      active_flag,
      created_by
    )
    /* No DISTINCT here: ORA-02287 if NEXTVAL appears with DISTINCT. rn=1 already
       yields one assignment row per employee per enterprise. */
    SELECT comp.comp_plan_emp_assignment_seq.NEXTVAL,
           SYS_GUID(),
           p_plan_id,
           a.employee_id,
           e.employee_guid,
           a.enterprise_id,
           'Y',
           'TRG_PLAN_EMP'
      FROM (
             SELECT a_inner.*,
                    ROW_NUMBER() OVER (
                      PARTITION BY a_inner.employee_id, a_inner.enterprise_id
                      ORDER BY a_inner.effective_start_date DESC NULLS LAST,
                               a_inner.assignment_id DESC NULLS LAST
                    ) AS rn
               FROM empl.assignments a_inner
              WHERE a_inner.enterprise_id = p_enterprise_id
           ) a
      JOIN empl.employees e
        ON e.enterprise_id = a.enterprise_id
       AND e.employee_id   = a.employee_id
     WHERE a.rn = 1
       AND TRUNC(SYSDATE) BETWEEN TRUNC(NVL(a.effective_start_date, DATE '1900-01-01'))
                              AND TRUNC(NVL(a.effective_end_date,   DATE '9999-12-31'))
       AND EXISTS (
             SELECT 1
               FROM comp.comp_plan_job_family j
              WHERE j.plan_id = p_plan_id
                AND j.job_family_id = a.job_family_id
           )
       AND EXISTS (
             SELECT 1
               FROM comp.comp_plan_employment_type t
              WHERE t.plan_id = p_plan_id
                AND t.employment_type_code = a.contract_type_code
           )
       AND EXISTS (
             SELECT 1
               FROM comp.comp_plan_grades g
              WHERE g.plan_id = p_plan_id
                AND g.grade_id = a.grade_id
           )
       AND EXISTS (
             SELECT 1
               FROM comp.comp_plan_positions p
              WHERE p.plan_id = p_plan_id
                AND p.position_id = a.position_id
           )
       AND EXISTS (
             SELECT 1
               FROM comp.comp_plan_business_unit b
              WHERE b.plan_id = p_plan_id
                AND (
                     (
                       a.org_structure_list IS NULL
                   AND b.org_unit_id = a.org_unit_id
                     )
                  OR (
                       a.org_structure_list IS NOT NULL
                   AND EXISTS (
                         SELECT 1
                           FROM JSON_TABLE(
                                  a.org_structure_list FORMAT JSON,
                                  '$[*]'
                                  COLUMNS (
                                    level_code        VARCHAR2(80)  PATH '$.level_code',
                                    org_unit_id_txt   VARCHAR2(128) PATH '$.org_unit_id'
                                  )
                                ) bu_node
                          WHERE UPPER(TRIM(bu_node.level_code)) = 'BUSINESS_UNIT'
                            AND bu_node.org_unit_id_txt IS NOT NULL
                            AND UPPER(REPLACE(TRIM(bu_node.org_unit_id_txt), '-', ''))
                                = UPPER(RAWTOHEX(b.org_unit_id))
                       )
                     )
                )
           );
  END SYNC_FOR_PLAN_CORE;

  PROCEDURE SYNC_FOR_PLAN(p_plan_id IN NUMBER, p_enterprise_id IN NUMBER) IS
  BEGIN
    SYNC_FOR_PLAN_CORE(p_plan_id, p_enterprise_id);
  END SYNC_FOR_PLAN;

  PROCEDURE SYNC_FOR_PLAN(p_plan_id IN NUMBER) IS
    v_enterprise_id NUMBER;
  BEGIN
    IF p_plan_id IS NULL THEN
      RETURN;
    END IF;

    SELECT enterprise_id
      INTO v_enterprise_id
      FROM comp.comp_plans
     WHERE plan_id = p_plan_id;
    SYNC_FOR_PLAN_CORE(p_plan_id, v_enterprise_id);
  END SYNC_FOR_PLAN;

  PROCEDURE GET_ELIGIBLE_PLANS_FOR_EMPLOYEE(
    p_employee_id   IN NUMBER,
    p_enterprise_id IN NUMBER,
    p_result_set    OUT t_eligible_plans_cur
  ) IS
  BEGIN
    IF p_employee_id IS NULL OR p_enterprise_id IS NULL THEN
      OPEN p_result_set FOR
        SELECT CAST(NULL AS NUMBER) AS plan_id,
               CAST(NULL AS NUMBER) AS enterprise_id,
               CAST(NULL AS VARCHAR2(1)) AS plan_code,
               CAST(NULL AS VARCHAR2(1)) AS plan_name
          FROM DUAL
         WHERE 1 = 0;
      RETURN;
    END IF;

    /* Eligibility predicates must stay aligned with SYNC_FOR_PLAN_CORE. */
    OPEN p_result_set FOR
      SELECT cp.plan_id,
             cp.enterprise_id,
             cp.plan_code,
             cp.plan_name
        FROM comp.comp_plans cp
       WHERE cp.enterprise_id = p_enterprise_id
         AND EXISTS (
               SELECT 1
                 FROM (
                        SELECT a_inner.*,
                               ROW_NUMBER() OVER (
                                 PARTITION BY a_inner.employee_id, a_inner.enterprise_id
                                 ORDER BY a_inner.effective_start_date DESC NULLS LAST,
                                          a_inner.assignment_id DESC NULLS LAST
                               ) AS rn
                          FROM empl.assignments a_inner
                         WHERE a_inner.enterprise_id = p_enterprise_id
                           AND a_inner.employee_id = p_employee_id
                      ) a
                WHERE a.rn = 1
                  AND TRUNC(SYSDATE) BETWEEN TRUNC(NVL(a.effective_start_date, DATE '1900-01-01'))
                                         AND TRUNC(NVL(a.effective_end_date,   DATE '9999-12-31'))
                  AND EXISTS (
                        SELECT 1
                          FROM comp.comp_plan_job_family j
                         WHERE j.plan_id = cp.plan_id
                           AND j.job_family_id = a.job_family_id
                      )
                  AND EXISTS (
                        SELECT 1
                          FROM comp.comp_plan_employment_type t
                         WHERE t.plan_id = cp.plan_id
                           AND t.employment_type_code = a.contract_type_code
                      )
                  AND EXISTS (
                        SELECT 1
                          FROM comp.comp_plan_grades g
                         WHERE g.plan_id = cp.plan_id
                           AND g.grade_id = a.grade_id
                      )
                  AND EXISTS (
                        SELECT 1
                          FROM comp.comp_plan_positions pos
                         WHERE pos.plan_id = cp.plan_id
                           AND pos.position_id = a.position_id
                      )
                  AND EXISTS (
                        SELECT 1
                          FROM comp.comp_plan_business_unit b
                         WHERE b.plan_id = cp.plan_id
                           AND (
                                (
                                  a.org_structure_list IS NULL
                              AND b.org_unit_id = a.org_unit_id
                                )
                             OR (
                                  a.org_structure_list IS NOT NULL
                              AND EXISTS (
                                    SELECT 1
                                      FROM JSON_TABLE(
                                             a.org_structure_list FORMAT JSON,
                                             '$[*]'
                                             COLUMNS (
                                               level_code        VARCHAR2(80)  PATH '$.level_code',
                                               org_unit_id_txt   VARCHAR2(128) PATH '$.org_unit_id'
                                             )
                                           ) bu_node
                                     WHERE UPPER(TRIM(bu_node.level_code)) = 'BUSINESS_UNIT'
                                       AND bu_node.org_unit_id_txt IS NOT NULL
                                       AND UPPER(REPLACE(TRIM(bu_node.org_unit_id_txt), '-', ''))
                                           = UPPER(RAWTOHEX(b.org_unit_id))
                                  )
                                )
                              )
                      )
             )
       ORDER BY cp.plan_id;
  END GET_ELIGIBLE_PLANS_FOR_EMPLOYEE;

  PROCEDURE GET_ELIGIBLE_EMPLOYEES_FOR_PLAN(
    p_plan_id    IN NUMBER,
    p_result_set OUT t_eligible_plans_cur
  ) IS
    v_enterprise_id NUMBER;
  BEGIN
    IF p_plan_id IS NULL THEN
      OPEN p_result_set FOR
        SELECT CAST(NULL AS NUMBER) AS employee_id,
               CAST(NULL AS RAW(16)) AS employee_guid,
               CAST(NULL AS NUMBER) AS enterprise_id
          FROM DUAL
         WHERE 1 = 0;
      RETURN;
    END IF;

    BEGIN
      SELECT p.enterprise_id
        INTO v_enterprise_id
        FROM comp.comp_plans p
       WHERE p.plan_id = p_plan_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        OPEN p_result_set FOR
          SELECT CAST(NULL AS NUMBER) AS employee_id,
                 CAST(NULL AS RAW(16)) AS employee_guid,
                 CAST(NULL AS NUMBER) AS enterprise_id
            FROM DUAL
           WHERE 1 = 0;
        RETURN;
    END;

    /* Same FROM/WHERE as SYNC_FOR_PLAN_CORE for this plan + enterprise. */
    OPEN p_result_set FOR
      SELECT a.employee_id,
             e.employee_guid,
             a.enterprise_id
        FROM (
               SELECT a_inner.*,
                      ROW_NUMBER() OVER (
                        PARTITION BY a_inner.employee_id, a_inner.enterprise_id
                        ORDER BY a_inner.effective_start_date DESC NULLS LAST,
                                 a_inner.assignment_id DESC NULLS LAST
                      ) AS rn
                 FROM empl.assignments a_inner
                WHERE a_inner.enterprise_id = v_enterprise_id
             ) a
        JOIN empl.employees e
          ON e.enterprise_id = a.enterprise_id
         AND e.employee_id   = a.employee_id
       WHERE a.rn = 1
         AND TRUNC(SYSDATE) BETWEEN TRUNC(NVL(a.effective_start_date, DATE '1900-01-01'))
                                AND TRUNC(NVL(a.effective_end_date,   DATE '9999-12-31'))
         AND EXISTS (
               SELECT 1
                 FROM comp.comp_plan_job_family j
                WHERE j.plan_id = p_plan_id
                  AND j.job_family_id = a.job_family_id
             )
         AND EXISTS (
               SELECT 1
                 FROM comp.comp_plan_employment_type t
                WHERE t.plan_id = p_plan_id
                  AND t.employment_type_code = a.contract_type_code
             )
         AND EXISTS (
               SELECT 1
                 FROM comp.comp_plan_grades g
                WHERE g.plan_id = p_plan_id
                  AND g.grade_id = a.grade_id
             )
         AND EXISTS (
               SELECT 1
                 FROM comp.comp_plan_positions p
                WHERE p.plan_id = p_plan_id
                  AND p.position_id = a.position_id
             )
         AND EXISTS (
               SELECT 1
                 FROM comp.comp_plan_business_unit b
                WHERE b.plan_id = p_plan_id
                  AND (
                       (
                         a.org_structure_list IS NULL
                     AND b.org_unit_id = a.org_unit_id
                       )
                    OR (
                         a.org_structure_list IS NOT NULL
                     AND EXISTS (
                           SELECT 1
                             FROM JSON_TABLE(
                                    a.org_structure_list FORMAT JSON,
                                    '$[*]'
                                    COLUMNS (
                                      level_code        VARCHAR2(80)  PATH '$.level_code',
                                      org_unit_id_txt   VARCHAR2(128) PATH '$.org_unit_id'
                                    )
                                  ) bu_node
                            WHERE UPPER(TRIM(bu_node.level_code)) = 'BUSINESS_UNIT'
                              AND bu_node.org_unit_id_txt IS NOT NULL
                              AND UPPER(REPLACE(TRIM(bu_node.org_unit_id_txt), '-', ''))
                                  = UPPER(RAWTOHEX(b.org_unit_id))
                         )
                       )
                  )
             )
       ORDER BY a.employee_id;
  END GET_ELIGIBLE_EMPLOYEES_FOR_PLAN;

END PKG_PLAN_EMPLOYEES;
/

/* Trigger off by default: CREATE_COMPENSATION_PLAN_PKG inserts the header before
   child criteria — sync here runs too early. Node calls PKG_PLAN_EMPLOYEES.SYNC_FOR_PLAN
   after CREATE_PLAN in compensationPlanService.js. Uncomment for non-app inserts. */
/*
CREATE OR REPLACE TRIGGER COMP.TRG_PLAN_INS_SYNC_EMPLOYEES
  AFTER INSERT ON COMP.COMP_PLANS
  FOR EACH ROW
BEGIN
  COMP.PKG_PLAN_EMPLOYEES.SYNC_FOR_PLAN(:NEW.plan_id, :NEW.enterprise_id);
END;
/
*/

-- Eligible plans query: see ELIGIBLE_PLANS_FOR_EMPLOYEE_SQL in compensationPlanService.js (bind :employee_guid_hex).
-- Package GET_ELIGIBLE_PLANS_FOR_EMPLOYEE still uses numeric employee_id + enterprise_id.
--
-- Examples (SQL*Plus / SQLcl):
-- Do NOT use: VAR c COMP.PKG_...t_eligible_plans_cur  → SP2-0738 (VAR only allows REFCURSOR, NUMBER, …).
--
-- Eligible PLANS for employee 292 / enterprise 1 (anonymous block; use SYS_REFCURSOR local var):
--   SET SERVEROUTPUT ON SIZE UNLIMITED
--   DECLARE
--     c   SYS_REFCURSOR;
--     pid NUMBER; eid NUMBER; pcode VARCHAR2(256); pname VARCHAR2(512);
--   BEGIN
--     COMP.PKG_PLAN_EMPLOYEES.GET_ELIGIBLE_PLANS_FOR_EMPLOYEE(292, 1, c);
--     LOOP
--       FETCH c INTO pid, eid, pcode, pname;
--       EXIT WHEN c%NOTFOUND;
--       DBMS_OUTPUT.PUT_LINE(pid || ' ' || NVL(pcode,'') || ' ' || NVL(pname,''));
--     END LOOP;
--     CLOSE c;
--   END;
--   /
--
-- Or bind only built-in REFCURSOR (then PRINT):
--   VAR rc REFCURSOR
--   EXEC COMP.PKG_PLAN_EMPLOYEES.GET_ELIGIBLE_PLANS_FOR_EMPLOYEE(292, 1, :rc);
--   PRINT rc
--
-- Eligible EMPLOYEES for plan_id 100:
--   VAR rc REFCURSOR
--   EXEC COMP.PKG_PLAN_EMPLOYEES.GET_ELIGIBLE_EMPLOYEES_FOR_PLAN(100, :rc);
--   PRINT rc

SHOW ERRORS;
