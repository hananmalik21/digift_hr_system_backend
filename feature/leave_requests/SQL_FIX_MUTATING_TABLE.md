# Fix ORA-04091 Mutating Table Error for ABS_LEAVE_REQUESTS

## Issue
When updating `ABS.ABS_LEAVE_REQUESTS`, you may encounter `ORA-04091: table is mutating, trigger/function may not see it` error. This happens when a row-level trigger tries to query the same table it's modifying.

## Step 1: Check Existing Triggers

Run this SQL to see all triggers on the table:

```sql
SELECT 
    trigger_name,
    trigger_type,
    triggering_event,
    status,
    trigger_body
FROM user_triggers
WHERE table_name = 'ABS_LEAVE_REQUESTS'
AND table_owner = 'ABS'
ORDER BY trigger_name;
```

Or for all schemas:

```sql
SELECT 
    owner,
    trigger_name,
    trigger_type,
    triggering_event,
    status,
    trigger_body
FROM all_triggers
WHERE table_name = 'ABS_LEAVE_REQUESTS'
ORDER BY owner, trigger_name;
```

## Step 2: Identify the Problematic Trigger

Look for triggers that:
- Are `BEFORE UPDATE` or `AFTER UPDATE`
- Have SELECT statements querying `ABS_LEAVE_REQUESTS` in the trigger body
- Are checking for duplicates, validating dates, or doing business logic checks

## Step 3: Fix the Trigger

There are several ways to fix a mutating table error:

### Option A: Use COMPOUND TRIGGER (Oracle 11g+)

Convert the trigger to a compound trigger and use statement-level sections:

```sql
CREATE OR REPLACE TRIGGER ABS.TRG_ABS_LEAVE_REQUESTS_VALIDATION
FOR UPDATE ON ABS.ABS_LEAVE_REQUESTS
COMPOUND TRIGGER

  -- Collection to store affected rows
  TYPE t_row_ids IS TABLE OF ABS.ABS_LEAVE_REQUESTS.LEAVE_REQUEST_ID%TYPE;
  g_row_ids t_row_ids := t_row_ids();

  BEFORE EACH ROW IS
  BEGIN
    -- Store the IDs being updated
    g_row_ids.extend;
    g_row_ids(g_row_ids.count) := :NEW.LEAVE_REQUEST_ID;
    
    -- Set timestamps based on status change
    IF :NEW.REQUEST_STATUS = 'APPROVED' AND (:OLD.REQUEST_STATUS IS NULL OR :OLD.REQUEST_STATUS != 'APPROVED') THEN
      :NEW.APPROVED_AT := SYSDATE;
      :NEW.REJECTED_AT := NULL;
    ELSIF :NEW.REQUEST_STATUS = 'REJECTED' AND (:OLD.REQUEST_STATUS IS NULL OR :OLD.REQUEST_STATUS != 'REJECTED') THEN
      :NEW.REJECTED_AT := SYSDATE;
      :NEW.APPROVED_AT := NULL;
    ELSIF :NEW.REQUEST_STATUS IN ('CANCELLED', 'PENDING') THEN
      :NEW.APPROVED_AT := NULL;
      :NEW.REJECTED_AT := NULL;
    END IF;
  END BEFORE EACH ROW;

  AFTER STATEMENT IS
  BEGIN
    -- Do any validation checks here that require querying the table
    -- This runs after all rows are updated, so table is no longer mutating
    
    -- Example: Check for overlapping leave dates
    FOR i IN 1..g_row_ids.count LOOP
      -- Your validation logic here
      NULL;
    END LOOP;
    
    -- Clear the collection
    g_row_ids.delete;
  END AFTER STATEMENT;

END TRG_ABS_LEAVE_REQUESTS_VALIDATION;
/
```

### Option B: Use AUTONOMOUS TRANSACTION (Not Recommended)

**WARNING**: This can lead to data inconsistency issues. Only use if absolutely necessary:

```sql
CREATE OR REPLACE TRIGGER ABS.TRG_ABS_LEAVE_REQUESTS_CHECK
BEFORE UPDATE ON ABS.ABS_LEAVE_REQUESTS
FOR EACH ROW
DECLARE
  PRAGMA AUTONOMOUS_TRANSACTION;
  v_count NUMBER;
BEGIN
  -- Now you can query the table
  SELECT COUNT(*) INTO v_count
  FROM ABS.ABS_LEAVE_REQUESTS
  WHERE EMPLOYEE_ID = :NEW.EMPLOYEE_ID
  AND START_DATE = :NEW.START_DATE
  AND END_DATE = :NEW.END_DATE
  AND LEAVE_REQUEST_ID != :NEW.LEAVE_REQUEST_ID;
  
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'Leave request already exists for these dates');
  END IF;
  
  COMMIT; -- Required for autonomous transaction
END;
/
```

### Option C: Remove Table Queries from Trigger

Move validation logic to the application layer (which we've already done) and remove any SELECT statements from the trigger.

## Step 4: Common Trigger to Check

If there's a trigger that checks for duplicate leave requests, it might look like this (problematic version):

```sql
-- PROBLEMATIC VERSION (causes ORA-04091)
CREATE OR REPLACE TRIGGER ABS.CHK_NO_DUPLICATE_LEAVE
BEFORE UPDATE ON ABS.ABS_LEAVE_REQUESTS
FOR EACH ROW
BEGIN
  DECLARE
    v_count NUMBER;
  BEGIN
    -- This SELECT causes ORA-04091 because it queries the mutating table
    SELECT COUNT(*) INTO v_count
    FROM ABS.ABS_LEAVE_REQUESTS  -- ❌ Problem: querying same table
    WHERE EMPLOYEE_ID = :NEW.EMPLOYEE_ID
    AND START_DATE = :NEW.START_DATE
    AND END_DATE = :NEW.END_DATE
    AND LEAVE_REQUEST_ID != :NEW.LEAVE_REQUEST_ID;
    
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'Duplicate leave request');
    END IF;
  END;
END;
/
```

**Note**: This validation is already handled in the application code (`leaveRequestModel.js` create method), so this trigger might not be needed.

## Step 5: Verify Trigger Status

After fixing, verify the trigger is valid:

```sql
SELECT trigger_name, status 
FROM user_triggers 
WHERE table_name = 'ABS_LEAVE_REQUESTS';
```

Status should be `ENABLED` and `VALID`.

## Recommended Solution

Since duplicate checking is already done in the application layer, consider:
1. **Disabling or removing** any duplicate-check triggers on `ABS_LEAVE_REQUESTS`
2. **Keeping only** the GUID generation trigger (`ABS_TRG_LEAVE_REQ_GUID`)
3. **Moving all business logic validation** to the application layer

To disable a specific trigger:

```sql
ALTER TRIGGER ABS.TRIGGER_NAME DISABLE;
```

To drop a trigger:

```sql
DROP TRIGGER ABS.TRIGGER_NAME;
```

## Testing

After fixing the trigger, test the update:

```sql
-- Test update (run in SQL*Plus or SQL Developer)
UPDATE ABS.ABS_LEAVE_REQUESTS
SET REQUEST_STATUS = 'APPROVED'
WHERE LEAVE_REQUEST_GUID = HEXTORAW('48832238B8270122E063E15B000AA8DF');
COMMIT;
```

If no error occurs, the trigger fix is successful.
