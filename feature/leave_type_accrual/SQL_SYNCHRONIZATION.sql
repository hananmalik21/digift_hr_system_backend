-- ==========================================
-- SQL Scripts for LEAVE_TYPE_ACCRUAL_GUID Synchronization
-- ==========================================
-- This script creates the LEAVE_TYPE_ACCRUAL_GUID column and sets up
-- triggers to keep it synchronized with ACCRUAL_PLAN_GUID from ABS.ABS_ACCRUAL_PLANS
-- ==========================================

-- Step 1: Add LEAVE_TYPE_ACCRUAL_GUID column (if not exists)
ALTER TABLE ABS.ABS_LEAVE_TYPE_ACCRUAL 
ADD LEAVE_TYPE_ACCRUAL_GUID RAW(16);

COMMENT ON COLUMN ABS.ABS_LEAVE_TYPE_ACCRUAL.LEAVE_TYPE_ACCRUAL_GUID IS 
'Mirror field: Stores ACCRUAL_PLAN_GUID from ABS.ABS_ACCRUAL_PLANS for API exposure. 
This is NOT a foreign key - ACCRUAL_PLAN_ID is the real FK. 
This field is kept synchronized via trigger.';

-- Step 2: Backfill existing records
-- Update all existing records to set LEAVE_TYPE_ACCRUAL_GUID from ACCRUAL_PLAN_ID
UPDATE ABS.ABS_LEAVE_TYPE_ACCRUAL lta
SET lta.LEAVE_TYPE_ACCRUAL_GUID = (
    SELECT ap.ACCRUAL_PLAN_GUID
    FROM ABS.ABS_ACCRUAL_PLANS ap
    WHERE ap.ACCRUAL_PLAN_ID = lta.ACCRUAL_PLAN_ID
)
WHERE lta.LEAVE_TYPE_ACCRUAL_GUID IS NULL;

COMMIT;

-- Step 3: Create trigger to auto-populate LEAVE_TYPE_ACCRUAL_GUID
-- This trigger fires BEFORE INSERT or UPDATE of ACCRUAL_PLAN_ID
CREATE OR REPLACE TRIGGER ABS.TRG_ABS_LEAVE_TYPE_ACCRUAL_GUID
BEFORE INSERT OR UPDATE OF ACCRUAL_PLAN_ID ON ABS.ABS_LEAVE_TYPE_ACCRUAL
FOR EACH ROW
DECLARE
    v_accrual_plan_guid RAW(16);
BEGIN
    -- Only process if ACCRUAL_PLAN_ID is provided (not NULL)
    IF :NEW.ACCRUAL_PLAN_ID IS NOT NULL THEN
        -- Lookup ACCRUAL_PLAN_GUID from ABS.ABS_ACCRUAL_PLANS
        SELECT ACCRUAL_PLAN_GUID
        INTO v_accrual_plan_guid
        FROM ABS.ABS_ACCRUAL_PLANS
        WHERE ACCRUAL_PLAN_ID = :NEW.ACCRUAL_PLAN_ID;
        
        -- Set LEAVE_TYPE_ACCRUAL_GUID to the looked-up GUID
        :NEW.LEAVE_TYPE_ACCRUAL_GUID := v_accrual_plan_guid;
    ELSE
        -- If ACCRUAL_PLAN_ID is NULL, set GUID to NULL
        :NEW.LEAVE_TYPE_ACCRUAL_GUID := NULL;
    END IF;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        -- If ACCRUAL_PLAN_ID doesn't exist, raise an error
        RAISE_APPLICATION_ERROR(-20001, 
            'Accrual Plan ID ' || :NEW.ACCRUAL_PLAN_ID || ' does not exist in ABS.ABS_ACCRUAL_PLANS');
    WHEN OTHERS THEN
        -- Re-raise any other errors
        RAISE;
END;
/

-- Step 4: Create index on LEAVE_TYPE_ACCRUAL_GUID for performance
CREATE INDEX ABS.IDX_ABS_LEAVE_TYPE_ACCRUAL_GUID 
ON ABS.ABS_LEAVE_TYPE_ACCRUAL(LEAVE_TYPE_ACCRUAL_GUID);

-- Step 5: Verify trigger creation
-- Check if trigger was created successfully
SELECT trigger_name, trigger_type, status, table_name
FROM user_triggers
WHERE table_name = 'ABS_LEAVE_TYPE_ACCRUAL'
AND trigger_name = 'TRG_ABS_LEAVE_TYPE_ACCRUAL_GUID';

-- ==========================================
-- Notes:
-- ==========================================
-- 1. The trigger automatically populates LEAVE_TYPE_ACCRUAL_GUID when:
--    - A new record is inserted with ACCRUAL_PLAN_ID
--    - ACCRUAL_PLAN_ID is updated on an existing record
--
-- 2. The application code also handles this synchronization, but the trigger
--    provides a database-level safeguard to ensure consistency.
--
-- 3. If you prefer application-level synchronization only (no trigger),
--    comment out Step 3 and Step 5, and ensure the application code always
--    populates LEAVE_TYPE_ACCRUAL_GUID when inserting/updating records.
--
-- 4. The index on LEAVE_TYPE_ACCRUAL_GUID helps with:
--    - API queries that filter by GUID
--    - Join operations if needed in the future
--
-- 5. To drop the trigger (if needed):
--    DROP TRIGGER ABS.TRG_ABS_LEAVE_TYPE_ACCRUAL_GUID;
--
-- 6. To drop the index (if needed):
--    DROP INDEX ABS.IDX_ABS_LEAVE_TYPE_ACCRUAL_GUID;
-- ==========================================
