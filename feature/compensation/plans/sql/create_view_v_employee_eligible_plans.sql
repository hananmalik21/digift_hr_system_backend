-- =============================================================================
-- View: one row per (employee_id, enterprise_id, plan_id) where the employee’s
-- current assignment matches that plan’s criteria (same rules as
-- PKG_PLAN_EMPLOYEES.SYNC_FOR_PLAN_CORE / GET_ELIGIBLE_PLANS_FOR_EMPLOYEE).
--
-- Deploy once (as COMP or a user with CREATE VIEW on COMP):
--   @create_view_v_employee_eligible_plans.sql
--
-- API: GET .../eligible-for-employee?employee_guid=<32 hex>
--      → WHERE employee_guid = HEXTORAW(:hex). Align column names with EMPL.EMPLOYEES / COMP.COMP_PLANS
--        (incl. PLAN_TYPE_CODE).
-- =============================================================================

CREATE OR REPLACE VIEW comp.v_employee_eligible_plans AS
WITH latest_assignment AS (
  SELECT a_inner.*,
         ROW_NUMBER() OVER (
           PARTITION BY a_inner.employee_id, a_inner.enterprise_id
           ORDER BY a_inner.effective_start_date DESC NULLS LAST,
                    a_inner.assignment_id DESC NULLS LAST
         ) AS rn
    FROM empl.assignments a_inner
)
SELECT a.employee_id,
       e.employee_guid,
       a.enterprise_id,
       cp.plan_id,
       cp.plan_guid,
       cp.plan_code,
       cp.plan_name,
       cp.plan_type_code
  FROM latest_assignment a
  JOIN empl.employees e
    ON e.enterprise_id = a.enterprise_id
   AND e.employee_id   = a.employee_id
  JOIN comp.comp_plans cp
    ON cp.enterprise_id = a.enterprise_id
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
       );

-- Grant to the schema your Node app uses (example):
-- GRANT SELECT ON comp.v_employee_eligible_plans TO your_app_user;

SHOW ERRORS;
