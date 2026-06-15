-- =============================================================================
-- Add RECURRING_FLAG to COMP.COMP_PLAN_COMP_ADV_SETTINGS
--
-- Deploy once (as COMP or a user with ALTER on COMP):
--   @alter_comp_plan_comp_adv_settings_add_recurring_flag.sql
--
-- Node API passes recurring_flag in plan JSON components[] to
-- CREATE_COMPENSATION_PLAN_PKG / UPDATE_COMPENSATION_PLAN_PKG.
-- Existing rows default to 'N' (non-recurring).
-- =============================================================================

ALTER TABLE comp.comp_plan_comp_adv_settings
  ADD (
    recurring_flag VARCHAR2(1) DEFAULT 'N' NOT NULL
  );

ALTER TABLE comp.comp_plan_comp_adv_settings
  ADD CONSTRAINT comp_plan_comp_adv_settings_recurring_ck
  CHECK (recurring_flag IN ('Y', 'N'));

COMMENT ON COLUMN comp.comp_plan_comp_adv_settings.recurring_flag IS
  'Y = recurring plan component; N = non-recurring. Default N.';

-- Ensure CREATE/UPDATE compensation plan packages read $.recurring_flag from
-- components JSON and persist to this column (same pattern as amortizable_flag).

SHOW ERRORS;
