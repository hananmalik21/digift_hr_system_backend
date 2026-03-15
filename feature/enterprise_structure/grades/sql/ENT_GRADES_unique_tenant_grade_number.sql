-- Migration: Make grade number unique per tenant, not globally.
-- Run this if CREATE grade returns 409 "already exists" when the grade number
-- does not exist for that tenant (e.g. P1 exists in tenant 1 but not tenant 3).
--
-- Step 1: Find the existing unique constraint (often on GRADE_NUMBER only).
SELECT c.constraint_name, c.constraint_type, cc.column_name
  FROM all_constraints c
  JOIN all_cons_columns cc ON c.owner = cc.owner AND c.constraint_name = cc.constraint_name
 WHERE c.table_name = 'GRADES' AND c.owner = 'ENT' AND c.constraint_type = 'U'
 ORDER BY c.constraint_name, cc.position;

-- Step 2: Drop the old unique constraint (UK_GRADES_NUMBER on GRADE_NUMBER only).
ALTER TABLE ENT.GRADES DROP CONSTRAINT UK_GRADES_NUMBER;

-- Step 3: Add composite unique on (TENANT_ID, GRADE_NUMBER) so the same grade number is allowed per tenant.
ALTER TABLE ENT.GRADES ADD CONSTRAINT UK_GRADES_TENANT_GRADE_NUMBER UNIQUE (TENANT_ID, GRADE_NUMBER);
