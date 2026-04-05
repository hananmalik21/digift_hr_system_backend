-- =============================================================================
-- Add composite FKs on COMP.COMP_EMP_COMP_ASSIGNMENT_DTL:
--   • Plan–employee: (plan_assignment_id, employee_id, enterprise_id, plan_id)
--     → COMP_PLAN_EMP_ASSIGNMENT
--   • Plan–component: (plan_id, component_id) → COMP_PLAN_COMPONENTS
--
-- Run once if the detail table was created with only single-column FKs to
-- assignment_id, comp_plans, and comp_components. Detail rows must match
-- parent assignments and plan lines (no orphans).
--
-- Idempotent-ish: parent UNIQUE constraints skip if ORA-02261 / ORA-00955.
-- =============================================================================

BEGIN
  EXECUTE IMMEDIATE
    'ALTER TABLE comp.comp_plan_emp_assignment ADD CONSTRAINT uk_plan_emp_asgn_scope UNIQUE (assignment_id, employee_id, enterprise_id, plan_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE IN (-2261, -955) THEN
      NULL;
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE
    'ALTER TABLE comp.comp_plan_components ADD CONSTRAINT uk_plan_components_plan_comp UNIQUE (plan_id, component_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE IN (-2261, -955) THEN
      NULL;
    ELSE
      RAISE;
    END IF;
END;
/

ALTER TABLE comp.comp_emp_comp_assignment_dtl DROP CONSTRAINT fk_empcompasgndtl_plan_asgn;
ALTER TABLE comp.comp_emp_comp_assignment_dtl DROP CONSTRAINT fk_empcompasgndtl_plan;
ALTER TABLE comp.comp_emp_comp_assignment_dtl DROP CONSTRAINT fk_empcompasgndtl_comp;

ALTER TABLE comp.comp_emp_comp_assignment_dtl
  ADD CONSTRAINT fk_empcompasgndtl_plan_emp
    FOREIGN KEY (plan_assignment_id, employee_id, enterprise_id, plan_id)
    REFERENCES comp.comp_plan_emp_assignment (assignment_id, employee_id, enterprise_id, plan_id)
    ON DELETE CASCADE;

ALTER TABLE comp.comp_emp_comp_assignment_dtl
  ADD CONSTRAINT fk_empcompasgndtl_plan_comp
    FOREIGN KEY (plan_id, component_id)
    REFERENCES comp.comp_plan_components (plan_id, component_id);
