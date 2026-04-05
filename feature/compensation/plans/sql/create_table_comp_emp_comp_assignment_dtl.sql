-- =============================================================================
-- Table: COMP.COMP_EMP_COMP_ASSIGNMENT_DTL
-- Employee compensation assignment details: amounts per component for a plan
-- assignment (parent row COMP.COMP_PLAN_EMP_ASSIGNMENT).
--
-- Deploy (as COMP or a user with CREATE TABLE on COMP):
--   @create_table_comp_emp_comp_assignment_dtl.sql
--
-- Columns (business):
--   PLAN_ASSIGNMENT_ID  → COMP.COMP_PLAN_EMP_ASSIGNMENT.ASSIGNMENT_ID
--   ENTERPRISE_ID       → tenant (matches plan assignment / employees)
--   EMPLOYEE_ID, PLAN_ID, COMPONENT_ID, AMOUNT, effective dates
--   Standard who columns: CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
--
-- Foreign keys:
--   • Plan–employee row: (plan_assignment_id, employee_id, enterprise_id, plan_id)
--     → COMP_PLAN_EMP_ASSIGNMENT (requires UK on parent; script adds if missing).
--   • Plan–component line: (plan_id, component_id) → COMP_PLAN_COMPONENTS
--     (requires UK(plan_id, component_id); script adds if missing).
--   • Employee: (employee_id, enterprise_id) → EMPL.EMPLOYEES
-- =============================================================================

BEGIN
  EXECUTE IMMEDIATE
    'CREATE SEQUENCE COMP.COMP_EMPCOMP_ASGNDTL_SEQ START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      NULL; /* sequence already exists */
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE
    'ALTER TABLE comp.comp_plan_emp_assignment ADD CONSTRAINT uk_plan_emp_asgn_scope UNIQUE (assignment_id, employee_id, enterprise_id, plan_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE IN (-2261, -955) THEN
      NULL; /* unique constraint or name already exists */
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

CREATE TABLE comp.comp_emp_comp_assignment_dtl (
  assignment_detail_id   NUMBER         NOT NULL,
  plan_assignment_id     NUMBER         NOT NULL,
  enterprise_id          NUMBER         NOT NULL,
  employee_id            NUMBER         NOT NULL,
  plan_id                NUMBER         NOT NULL,
  component_id           NUMBER         NOT NULL,
  amount                 NUMBER(18, 4),
  effective_start_date   DATE           NOT NULL,
  effective_end_date     DATE,
  created_by             VARCHAR2(100)  DEFAULT USER NOT NULL,
  creation_date          DATE           DEFAULT SYSDATE NOT NULL,
  last_updated_by        VARCHAR2(100)  DEFAULT USER NOT NULL,
  last_update_date       DATE           DEFAULT SYSDATE NOT NULL,
  CONSTRAINT pk_empcomp_asgn_dtl PRIMARY KEY (assignment_detail_id),
  CONSTRAINT fk_empcompasgndtl_plan_emp
    FOREIGN KEY (plan_assignment_id, employee_id, enterprise_id, plan_id)
    REFERENCES comp.comp_plan_emp_assignment (assignment_id, employee_id, enterprise_id, plan_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_empcompasgndtl_plan_comp
    FOREIGN KEY (plan_id, component_id)
    REFERENCES comp.comp_plan_components (plan_id, component_id),
  CONSTRAINT fk_empcompasgndtl_emp
    FOREIGN KEY (employee_id, enterprise_id)
    REFERENCES empl.employees (employee_id, enterprise_id)
);

CREATE INDEX comp.ix_empcompasgndtl_plan_asgn
  ON comp.comp_emp_comp_assignment_dtl (plan_assignment_id);

CREATE INDEX comp.ix_empcompasgndtl_emp_plan
  ON comp.comp_emp_comp_assignment_dtl (enterprise_id, employee_id, plan_id);

CREATE OR REPLACE TRIGGER comp.trg_empcomp_asgn_dtl_bi
  BEFORE INSERT ON comp.comp_emp_comp_assignment_dtl
  FOR EACH ROW
BEGIN
  IF :new.assignment_detail_id IS NULL THEN
    :new.assignment_detail_id := comp.comp_empcomp_asgndtl_seq.NEXTVAL;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER comp.trg_empcomp_asgn_dtl_bu
  BEFORE UPDATE ON comp.comp_emp_comp_assignment_dtl
  FOR EACH ROW
BEGIN
  :new.last_update_date := SYSDATE;
END;
/

COMMENT ON TABLE comp.comp_emp_comp_assignment_dtl IS
  'Per-component amounts and effective dates for a plan–employee assignment (COMP_PLAN_EMP_ASSIGNMENT).';

COMMENT ON COLUMN comp.comp_emp_comp_assignment_dtl.assignment_detail_id IS
  'Surrogate PK (detail line).';
COMMENT ON COLUMN comp.comp_emp_comp_assignment_dtl.plan_assignment_id IS
  'Parent compensation assignment: COMP_PLAN_EMP_ASSIGNMENT.ASSIGNMENT_ID (comp assignment).';

-- In SQL*Plus / SQLcl: @create_table_comp_emp_comp_assignment_dtl.sql
-- CREATE TABLE is not idempotent. If you already have the table with old FKs only, run:
--   @alter_comp_emp_comp_assignment_dtl_fks.sql
