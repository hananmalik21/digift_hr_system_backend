-- =============================================================================
-- Eligible plans for one employee by GUID (32 hex, same as API).
-- Requires: @create_view_v_employee_eligible_plans.sql (with employee_guid + plan_guid)
-- Component JSON block: keep in sync with compensationPlanService.js (sqlPlanComponentsJsonSubquery).
-- =============================================================================

SELECT v.enterprise_id,
       v.plan_id,
       UPPER(RAWTOHEX(v.plan_guid)) AS plan_guid,
       v.plan_code,
       v.plan_name,
       (
         SELECT NVL(
           JSON_ARRAYAGG(
             JSON_OBJECT(
               'component_id' VALUE c.component_id,
               'component_guid' VALUE UPPER(RAWTOHEX(c.component_guid)),
               'component_code' VALUE c.component_code,
               'component_name' VALUE c.component_name,
               'description' VALUE c.description,
               'component_type_code' VALUE c.component_type_code,
               'display_sequence' VALUE pc.display_sequence,
               'mandatory_flag' VALUE pc.mandatory_flag,
               'active_flag' VALUE pc.active_flag
             )
             ORDER BY NVL(pc.display_sequence, 999999), pc.plan_component_id
             RETURNING CLOB
           ),
           '[]'
         )
           FROM comp.comp_plan_components pc
           JOIN comp.comp_components c
             ON c.component_id = pc.component_id
            AND c.tenant_id = v.enterprise_id
          WHERE pc.plan_id = v.plan_id
       ) AS components_json
  FROM comp.v_employee_eligible_plans v
 WHERE v.employee_guid = HEXTORAW(:employee_guid_hex)
 ORDER BY v.plan_id;
