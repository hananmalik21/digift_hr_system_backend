-- =============================================================================
-- Package body: COMP.EMPLOYEE_COMPENSATION
-- Requires PACKAGE spec t_component_rec to include active_flag (CHAR(1)).
-- Inserts into COMP.COMP_EMP_COMP_ASSIGNMENT_DTL. Does NOT COMMIT — Node commits.
-- Deploy: SQLcl / SQL*Plus as COMP (or user with CREATE PROCEDURE on COMP):
--   @employee_compensation_pkg_body.sql
-- =============================================================================

CREATE OR REPLACE PACKAGE BODY comp.employee_compensation AS

  PROCEDURE create_components (
    p_enterprise_id IN comp.comp_emp_comp_assignment_dtl.enterprise_id%TYPE,
    p_employee_id   IN comp.comp_emp_comp_assignment_dtl.employee_id%TYPE,
    p_plan_id       IN comp.comp_emp_comp_assignment_dtl.plan_id%TYPE,
    p_components    IN t_component_tab,
    p_created_by    IN VARCHAR2
  ) IS
  BEGIN
    IF p_components IS NULL OR p_components.COUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'components collection must not be empty');
    END IF;

    FOR i IN 1 .. p_components.COUNT LOOP
      INSERT INTO comp.comp_emp_comp_assignment_dtl (
        assignment_detail_id,
        assignment_detail_guid,
        enterprise_id,
        employee_id,
        plan_id,
        component_id,
        amount,
        effective_start_date,
        effective_end_date,
        active_flag,
        created_by,
        creation_date,
        last_updated_by,
        last_update_date
      ) VALUES (
        comp.comp_empcomp_asgndtl_seq.NEXTVAL,
        UPPER(RAWTOHEX(SYS_GUID())),
        p_enterprise_id,
        p_employee_id,
        p_plan_id,
        p_components(i).component_id,
        p_components(i).amount,
        p_components(i).effective_start_date,
        p_components(i).effective_end_date,
        p_components(i).active_flag,
        p_created_by,
        SYSDATE,
        p_created_by,
        SYSDATE
      );
    END LOOP;
  END create_components;

END employee_compensation;
/
