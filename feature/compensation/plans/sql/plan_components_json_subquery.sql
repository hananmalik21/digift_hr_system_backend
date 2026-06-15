-- =============================================================================
-- Reference: plan components JSON subquery (aligned with Node
-- compensationPlanService.js sqlPlanComponentsJsonSubquery).
--
-- Use this fragment when maintaining:
--   - COMP.COMP_PLANS_FULL_V (PLAN_COMPONENTS_JSON column)
--   - COMP.V_EMPLOYEE_ELIGIBLE_PLANS_JSON (embedded components)
--
-- Replace :enterprise_sql_expr and :plan_id_sql_expr with outer query columns,
-- e.g. p.enterprise_id and p.plan_id.
-- =============================================================================

/*
(
  SELECT NVL(
    JSON_ARRAYAGG(
      JSON_OBJECT(
        'component_id'        VALUE c.component_id,
        'component_guid'      VALUE UPPER(RAWTOHEX(c.component_guid)),
        'component_code'      VALUE c.component_code,
        'component_name'      VALUE c.component_name,
        'description'         VALUE c.description,
        'component_type_code' VALUE c.component_type_code,
        'comp_category_code'  VALUE c.comp_category_code,
        'min_value'           VALUE c.min_value,
        'max_value'           VALUE c.max_value,
        'display_sequence'    VALUE pc.display_sequence,
        'mandatory_flag'      VALUE pc.mandatory_flag,
        'active_flag'         VALUE pc.active_flag,
        'advanced_settings'   VALUE JSON_OBJECT(
          'prorated_flag'       VALUE NVL(adv.prorated_flag, 'N'),
          'taxable_flag'        VALUE NVL(adv.taxable_flag, 'N'),
          'pensionable_flag'    VALUE NVL(adv.pensionable_flag, 'N'),
          'statutory_flag'      VALUE NVL(adv.statutory_flag, 'N'),
          'include_in_ctc_flag' VALUE NVL(adv.include_in_ctc_flag, 'N'),
          'optional_flag'       VALUE NVL(adv.optional_flag, 'N'),
          'amortizable_flag'    VALUE NVL(adv.amortizable_flag, 'N'),
          'recurring_flag'      VALUE NVL(adv.recurring_flag, 'N'),
          'pay_basis'           VALUE adv.pay_basis NULL ON NULL
          RETURNING CLOB
        )
        RETURNING CLOB
      )
      ORDER BY NVL(pc.display_sequence, 999999), pc.plan_component_id
      RETURNING CLOB
    ),
    '[]'
  )
    FROM comp.comp_plan_components pc
    JOIN comp.comp_components c
      ON c.component_id = pc.component_id
     AND c.tenant_id = :enterprise_sql_expr
    LEFT JOIN comp.comp_plan_comp_adv_settings adv
      ON adv.plan_component_id = pc.plan_component_id
   WHERE pc.plan_id = :plan_id_sql_expr
) AS plan_components_json
*/

SHOW ERRORS;
