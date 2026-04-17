-- =============================================================================
-- Optional DDL: remove PLAN_ID from adjustment HEADER after package no longer inserts it.
-- Review FKs, indexes, and views on COMP.COMP_ADJUSTMENT_DETAILS before running.
-- Repo inventory of references: inventory_comp_adjustment_details_plan_id.sql
-- =============================================================================

-- Example (uncomment after validation):
-- ALTER TABLE comp.comp_adjustment_details DROP COLUMN plan_id;

-- If you cannot drop (legacy consumers), make nullable and stop writing it:
-- ALTER TABLE comp.comp_adjustment_details MODIFY plan_id NULL;

