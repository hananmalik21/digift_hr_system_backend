-- =============================================================================
-- ABS.ABS_LEAVE_ACCRUAL_RUN_PKG — body
-- =============================================================================
-- Compile note: Do NOT call package-body-only functions inside static SQL
-- (UPDATE/SELECT) — SQL cannot resolve them -> ORA-03066. Use variables instead.
-- =============================================================================

CREATE OR REPLACE PACKAGE BODY ABS.ABS_LEAVE_ACCRUAL_RUN_PKG AS

  c_accrual_txn_type   CONSTANT VARCHAR2(20) := 'ACCRUAL';
  c_accrual_ref_type   CONSTANT VARCHAR2(20) := 'ACCRUAL_RUN';
  c_notes_monthly      CONSTANT VARCHAR2(100) := 'Monthly accrual';

  PROCEDURE raise_missing_leave_type IS
  BEGIN
    RAISE_APPLICATION_ERROR(-20904, 'Leave type not found or inactive');
  END;

  PROCEDURE raise_no_mapping IS
  BEGIN
    RAISE_APPLICATION_ERROR(-20905, 'No active accrual plan mapped to this leave type for the given period');
  END;

  PROCEDURE raise_plan_not_found IS
  BEGIN
    RAISE_APPLICATION_ERROR(-20906, 'Accrual plan not found for this tenant');
  END;

  PROCEDURE raise_unsupported_method(p_method VARCHAR2) IS
  BEGIN
    RAISE_APPLICATION_ERROR(-20907, 'Unsupported accrual_method: ' || NVL(p_method, '(null)') || '. Only MONTHLY is supported.');
  END;

  PROCEDURE raise_invalid_rate IS
  BEGIN
    RAISE_APPLICATION_ERROR(-20908, 'accrual_rate_days must be greater than zero');
  END;

  PROCEDURE RUN_FOR_PERIOD(
    p_tenant_id           IN  NUMBER,
    p_leave_type_id       IN  NUMBER,
    p_period_start        IN  DATE,
    p_period_end          IN  DATE,
    p_run_by              IN  VARCHAR2 DEFAULT 'SYSTEM',
    p_force_recalculate   IN  NUMBER   DEFAULT 0,
    p_dry_run             IN  NUMBER   DEFAULT 0,
    p_result_json         OUT CLOB
  ) IS
    v_leave_type_cnt     NUMBER;
    v_mapping_plan_id    NUMBER;
    v_accrual_method     VARCHAR2(50);
    v_accrual_rate_days  NUMBER;
    v_max_balance_days   NUMBER;
    v_cap                NUMBER;  -- positive max balance cap only; NULL = no cap
    v_force              NUMBER := NVL(p_force_recalculate, 0);
    v_dry                NUMBER := NVL(p_dry_run, 0);
    v_run_by             VARCHAR2(200) := NVL(p_run_by, 'SYSTEM');

    v_newly_processed    NUMBER := 0;
    v_error_skipped      NUMBER := 0;
    v_already_cnt        NUMBER := 0;
    v_txn_exists         NUMBER;
    v_rows               NUMBER;
    v_run_id             NUMBER;
    v_message            VARCHAR2(4000);
    v_msg_esc            VARCHAR2(4000);
    v_audit              VARCHAR2(200);

    TYPE t_rec IS RECORD (
      employee_id         NUMBER,
      opening_balance_days NUMBER,
      accrued_days        NUMBER,
      adjusted_days       NUMBER,
      taken_days          NUMBER,
      available_days      NUMBER,
      last_accrual_date   DATE
    );
    TYPE t_tab IS TABLE OF t_rec;
    v_balances           t_tab := t_tab();

  BEGIN
    -- ---------- validation ----------
    IF p_tenant_id IS NULL OR p_tenant_id < 1 THEN
      RAISE_APPLICATION_ERROR(-20901, 'tenant_id is required and must be positive');
    END IF;
    IF p_leave_type_id IS NULL OR p_leave_type_id < 1 THEN
      RAISE_APPLICATION_ERROR(-20902, 'leave_type_id is required and must be positive');
    END IF;
    IF p_period_start IS NULL OR p_period_end IS NULL THEN
      RAISE_APPLICATION_ERROR(-20903, 'period_start and period_end are required');
    END IF;
    IF TRUNC(p_period_end) < TRUNC(p_period_start) THEN
      RAISE_APPLICATION_ERROR(-20903, 'period_end must be greater than or equal to period_start');
    END IF;

    SELECT COUNT(*) INTO v_leave_type_cnt
      FROM ABS.ABS_LEAVE_TYPES
     WHERE TENANT_ID = p_tenant_id
       AND LEAVE_TYPE_ID = p_leave_type_id
       AND NVL(STATUS, 'ACTIVE') = 'ACTIVE';
    IF v_leave_type_cnt = 0 THEN
      raise_missing_leave_type;
    END IF;

    BEGIN
      SELECT ACCRUAL_PLAN_ID INTO v_mapping_plan_id
        FROM (
          SELECT ACCRUAL_PLAN_ID
            FROM ABS.ABS_LEAVE_TYPE_ACCRUAL
           WHERE TENANT_ID = p_tenant_id
             AND LEAVE_TYPE_ID = p_leave_type_id
             AND EFFECTIVE_START_DATE <= TRUNC(p_period_end)
             AND (EFFECTIVE_END_DATE IS NULL OR EFFECTIVE_END_DATE >= TRUNC(p_period_start))
           ORDER BY EFFECTIVE_START_DATE DESC
        )
       WHERE ROWNUM <= 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        raise_no_mapping;
    END;

    BEGIN
      SELECT UPPER(NVL(ACCRUAL_METHOD, '')),
             NVL(ACCRUAL_RATE_DAYS, 0),
             MAX_BALANCE_DAYS
        INTO v_accrual_method, v_accrual_rate_days, v_max_balance_days
        FROM ABS.ABS_ACCRUAL_PLANS
       WHERE TENANT_ID = p_tenant_id
         AND ACCRUAL_PLAN_ID = v_mapping_plan_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        raise_plan_not_found;
    END;

    IF v_accrual_method <> 'MONTHLY' THEN
      raise_unsupported_method(v_accrual_method);
    END IF;
    IF v_accrual_rate_days IS NULL OR v_accrual_rate_days <= 0 THEN
      raise_invalid_rate;
    END IF;

    -- Cap for LEAST(); SQL must not call package-body function
    v_cap := NULL;
    IF v_max_balance_days IS NOT NULL AND v_max_balance_days > 0 THEN
      v_cap := v_max_balance_days;
    END IF;

    IF v_force = 0 THEN
      SELECT COUNT(*) INTO v_already_cnt
        FROM ABS.ABS_EMPLOYEE_LEAVE_BALANCES b
       WHERE b.TENANT_ID = p_tenant_id
         AND b.LEAVE_TYPE_ID = p_leave_type_id
         AND b.STATUS = 'ACTIVE'
         AND b.LAST_ACCRUAL_DATE IS NOT NULL
         AND b.LAST_ACCRUAL_DATE >= TRUNC(p_period_end);
    ELSE
      v_already_cnt := 0;
    END IF;

    -- Load eligible balances into collection (avoids cursor with v_force in WHERE)
    IF v_force = 1 THEN
      SELECT b.EMPLOYEE_ID,
             b.OPENING_BALANCE_DAYS,
             b.ACCRUED_DAYS,
             b.ADJUSTED_DAYS,
             b.TAKEN_DAYS,
             b.AVAILABLE_DAYS,
             b.LAST_ACCRUAL_DATE
        BULK COLLECT INTO v_balances
        FROM ABS.ABS_EMPLOYEE_LEAVE_BALANCES b
       WHERE b.TENANT_ID = p_tenant_id
         AND b.LEAVE_TYPE_ID = p_leave_type_id
         AND b.STATUS = 'ACTIVE';
    ELSE
      SELECT b.EMPLOYEE_ID,
             b.OPENING_BALANCE_DAYS,
             b.ACCRUED_DAYS,
             b.ADJUSTED_DAYS,
             b.TAKEN_DAYS,
             b.AVAILABLE_DAYS,
             b.LAST_ACCRUAL_DATE
        BULK COLLECT INTO v_balances
        FROM ABS.ABS_EMPLOYEE_LEAVE_BALANCES b
       WHERE b.TENANT_ID = p_tenant_id
         AND b.LEAVE_TYPE_ID = p_leave_type_id
         AND b.STATUS = 'ACTIVE'
         AND (b.LAST_ACCRUAL_DATE IS NULL OR b.LAST_ACCRUAL_DATE < TRUNC(p_period_end));
    END IF;

    FOR i IN 1 .. v_balances.COUNT LOOP
      BEGIN
        SELECT COUNT(*) INTO v_txn_exists
          FROM ABS.ABS_LEAVE_BALANCE_TXNS
         WHERE TENANT_ID = p_tenant_id
           AND EMPLOYEE_ID = v_balances(i).employee_id
           AND LEAVE_TYPE_ID = p_leave_type_id
           AND TXN_TYPE = c_accrual_txn_type
           AND TRUNC(TXN_DATE) = TRUNC(p_period_end)
           AND REFERENCE_TYPE = c_accrual_ref_type;

        IF v_txn_exists > 0 THEN
          NULL;
        ELSIF v_dry = 1 THEN
          v_newly_processed := v_newly_processed + 1;
        ELSE
          IF v_cap IS NOT NULL THEN
            UPDATE ABS.ABS_EMPLOYEE_LEAVE_BALANCES
               SET ACCRUED_DAYS = NVL(ACCRUED_DAYS, 0) + v_accrual_rate_days,
                   AVAILABLE_DAYS = LEAST(
                     GREATEST(0,
                       NVL(OPENING_BALANCE_DAYS, 0)
                       + (NVL(ACCRUED_DAYS, 0) + v_accrual_rate_days)
                       + NVL(ADJUSTED_DAYS, 0)
                       - NVL(TAKEN_DAYS, 0)
                     ),
                     v_cap
                   ),
                   LAST_ACCRUAL_DATE = TRUNC(p_period_end),
                   PERIOD_START_DATE = TRUNC(p_period_start),
                   PERIOD_END_DATE = TRUNC(p_period_end),
                   LAST_UPDATE_DATE = SYSTIMESTAMP,
                   LAST_UPDATED_BY = v_run_by
             WHERE TENANT_ID = p_tenant_id
               AND EMPLOYEE_ID = v_balances(i).employee_id
               AND LEAVE_TYPE_ID = p_leave_type_id
               AND STATUS = 'ACTIVE';
          ELSE
            UPDATE ABS.ABS_EMPLOYEE_LEAVE_BALANCES
               SET ACCRUED_DAYS = NVL(ACCRUED_DAYS, 0) + v_accrual_rate_days,
                   AVAILABLE_DAYS = GREATEST(0,
                     NVL(OPENING_BALANCE_DAYS, 0)
                     + (NVL(ACCRUED_DAYS, 0) + v_accrual_rate_days)
                     + NVL(ADJUSTED_DAYS, 0)
                     - NVL(TAKEN_DAYS, 0)
                   ),
                   LAST_ACCRUAL_DATE = TRUNC(p_period_end),
                   PERIOD_START_DATE = TRUNC(p_period_start),
                   PERIOD_END_DATE = TRUNC(p_period_end),
                   LAST_UPDATE_DATE = SYSTIMESTAMP,
                   LAST_UPDATED_BY = v_run_by
             WHERE TENANT_ID = p_tenant_id
               AND EMPLOYEE_ID = v_balances(i).employee_id
               AND LEAVE_TYPE_ID = p_leave_type_id
               AND STATUS = 'ACTIVE';
          END IF;

          v_rows := SQL%ROWCOUNT;
          IF v_rows < 1 THEN
            v_error_skipped := v_error_skipped + 1;
          ELSE
            INSERT INTO ABS.ABS_LEAVE_BALANCE_TXNS (
              TXN_GUID, TENANT_ID, EMPLOYEE_ID, LEAVE_TYPE_ID,
              TXN_TYPE, TXN_DATE, AMOUNT_DAYS,
              REFERENCE_TYPE, REFERENCE_ID, COMMENTS,
              CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
            ) VALUES (
              SYS_GUID(), p_tenant_id, v_balances(i).employee_id, p_leave_type_id,
              c_accrual_txn_type, TRUNC(p_period_end), v_accrual_rate_days,
              c_accrual_ref_type, NULL, c_notes_monthly,
              SYSTIMESTAMP, v_run_by, SYSTIMESTAMP, v_run_by
            );
            v_newly_processed := v_newly_processed + 1;
          END IF;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          v_error_skipped := v_error_skipped + 1;
      END;
    END LOOP;

    v_run_id := NULL;
    IF v_dry = 0 THEN
      BEGIN
        INSERT INTO ABS.ABS_LEAVE_ACCRUAL_RUNS (
          TENANT_ID, LEAVE_TYPE_ID, PERIOD_START_DATE, PERIOD_END_DATE,
          PROCESSED_COUNT, SKIPPED_COUNT, RUN_BY, RUN_DATE
        ) VALUES (
          p_tenant_id, p_leave_type_id, TRUNC(p_period_start), TRUNC(p_period_end),
          v_newly_processed + v_already_cnt, v_error_skipped, v_run_by, SYSTIMESTAMP
        )
        RETURNING RUN_ID INTO v_run_id;
      EXCEPTION
        WHEN OTHERS THEN
          v_run_id := NULL;
      END;
    END IF;

    IF v_newly_processed > 0 AND v_error_skipped = 0 THEN
      v_message := 'Accrual processed successfully for ' || v_newly_processed || ' employee(s).';
    ELSIF v_newly_processed > 0 AND v_error_skipped > 0 THEN
      v_message := 'Accrual run completed. ' || v_newly_processed || ' processed, ' || v_error_skipped || ' failed.';
    ELSIF v_already_cnt > 0 AND v_error_skipped = 0 AND v_newly_processed = 0 THEN
      v_message := 'Accrual run completed. ' || v_already_cnt || ' balance(s) were already accrued for this period (idempotent).';
    ELSIF v_error_skipped > 0 AND v_newly_processed = 0 THEN
      v_message := 'No accruals processed. ' || v_error_skipped || ' balance(s) failed due to database error(s).';
    ELSE
      v_message := 'No eligible balances found for accrual processing.';
    END IF;
    IF v_dry = 1 AND v_newly_processed > 0 THEN
      v_message := '[DRY RUN - no DB changes] ' || v_message;
    END IF;

    v_msg_esc := REPLACE(REPLACE(REPLACE(NVL(v_message, ''), '\', '\\'), '"', '\"'), CHR(10), '\n');
    IF v_run_id IS NOT NULL THEN
      v_audit := '"audit_run_id":' || v_run_id;
    ELSE
      v_audit := '"audit_run_id":null';
    END IF;
    p_result_json :=
      '{' ||
      '"success":true,' ||
      '"leave_type_id":' || p_leave_type_id || ',' ||
      '"period_start":"' || TO_CHAR(TRUNC(p_period_start), 'YYYY-MM-DD') || '",' ||
      '"period_end":"' || TO_CHAR(TRUNC(p_period_end), 'YYYY-MM-DD') || '",' ||
      '"processed_count":' || (v_newly_processed + v_already_cnt) || ',' ||
      '"newly_processed_count":' || v_newly_processed || ',' ||
      '"already_processed_count":' || v_already_cnt || ',' ||
      '"skipped_count":' || v_error_skipped || ',' ||
      '"message":"' || v_msg_esc || '",' ||
      '"accrual_plan_id":' || v_mapping_plan_id || ',' ||
      '"accrual_method":"' || REPLACE(NVL(v_accrual_method, ''), '"', '\"') || '",' ||
      '"accrual_rate_days":' || NVL(v_accrual_rate_days, 0) || ',' ||
      '"dry_run":' || CASE WHEN v_dry = 1 THEN 'true' ELSE 'false' END || ',' ||
      v_audit ||
      '}';
  END RUN_FOR_PERIOD;

END ABS_LEAVE_ACCRUAL_RUN_PKG;
/
