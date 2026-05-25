-- =============================================================================
-- View: one row per employee with eligible plans aggregated as JSON (CLOB).
-- Plan lines include embedded components (same sources as single-plan API).
--
-- Deploy once (as COMP or a user with CREATE VIEW on COMP):
--   @create_view_v_employee_eligible_plans_json.sql
--
-- API: POST /api/comp/eligible-plans
--      body: { "employee_guids": ["<32 hex>", ...] }
-- =============================================================================

CREATE OR REPLACE VIEW comp.v_employee_eligible_plans_json AS
WITH eligible AS (
  SELECT v.employee_id,
         v.employee_guid,
         v.enterprise_id,
         v.plan_id,
         v.plan_guid,
         v.plan_code,
         v.plan_name,
         v.plan_type_code
    FROM comp.v_employee_eligible_plans v
),
plan_rows AS (
  SELECT e.employee_id,
         e.employee_guid,
         e.enterprise_id,
         e.plan_id,
         e.plan_guid,
         e.plan_code,
         e.plan_name,
         e.plan_type_code,
         (
           SELECT NVL(
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'component_id' VALUE c.component_id,
                 'component_code' VALUE c.component_code,
                 'component_name' VALUE c.component_name,
                 'frequency_code' VALUE c.frequency_code
               )
               ORDER BY NVL(pc.display_sequence, 999999), pc.plan_component_id
               RETURNING CLOB
             ),
             JSON_ARRAY()
           )
             FROM comp.comp_plan_components pc
             JOIN comp.comp_components c
               ON c.component_id = pc.component_id
              AND c.tenant_id = e.enterprise_id
            WHERE pc.plan_id = e.plan_id
         ) AS components_json
    FROM eligible e
)
SELECT pr.employee_id,
       pr.employee_guid,
       pr.enterprise_id,
       JSON_ARRAYAGG(
         JSON_OBJECT(
           'plan_id' VALUE pr.plan_id,
           'plan_guid' VALUE UPPER(RAWTOHEX(pr.plan_guid)),
           'plan_code' VALUE pr.plan_code,
           'plan_name' VALUE pr.plan_name,
           'plan_type_code' VALUE pr.plan_type_code,
           'components' VALUE pr.components_json FORMAT JSON
         )
         ORDER BY pr.plan_id
         RETURNING CLOB
       ) AS plans_json
  FROM plan_rows pr
 GROUP BY pr.employee_id, pr.employee_guid, pr.enterprise_id;

-- GRANT SELECT ON comp.v_employee_eligible_plans_json TO your_app_user;

SHOW ERRORS;
