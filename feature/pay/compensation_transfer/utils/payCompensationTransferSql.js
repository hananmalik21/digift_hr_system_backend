/**
 * SQL used by PAY.PAY_COMPENSATION_TRANSFER_PKG orchestration.
 */

import { PKG } from '../constants/payCompensationTransfer.constants.js';

export const TRANSFER_LINE_PLSQL = `
BEGIN
  ${PKG}.TRANSFER_PAY_RUN_LINE_DETAIL
  (
      P_ENTERPRISE_ID          => :enterprise_id,
      P_PAY_RUN_ID             => :pay_run_id,
      P_PAY_RUN_LINE_ID        => :pay_run_line_id,
      P_PAYROLL_ID             => :payroll_id,
      P_CREATED_BY             => :created_by,
      P_REGULAR_ENTRY_ID       => :regular_entry_id,
      P_REGULAR_ENTRY_GUID     => :regular_entry_guid,
      P_RETRO_ENTRY_ID         => :retro_entry_id,
      P_RETRO_ENTRY_GUID       => :retro_entry_guid,
      P_TRANSFER_STATUS        => :transfer_status,
      P_MESSAGE                => :message
  );
END;
`.trim();

export const TRANSFER_PAY_RUN_PLSQL = `
BEGIN
  ${PKG}.TRANSFER_PAY_RUN
  (
      P_ENTERPRISE_ID     => :enterprise_id,
      P_PAY_RUN_ID        => :pay_run_id,
      P_PAYROLL_ID        => :payroll_id,
      P_CREATED_BY        => :created_by,
      P_STOP_ON_ERROR     => :stop_on_error,
      P_TRANSFERRED_COUNT => :transferred_count,
      P_SKIPPED_COUNT     => :skipped_count,
      P_FAILED_COUNT      => :failed_count,
      P_LAST_ERROR        => :last_error,
      P_MESSAGE           => :message
  );
END;
`.trim();

export const GET_PAY_RUN_TRANSFER_STATUS_PLSQL = `
BEGIN
  ${PKG}.GET_PAY_RUN_TRANSFER_STATUS
  (
      P_ENTERPRISE_ID   => :enterprise_id,
      P_PAY_RUN_ID      => :pay_run_id,
      P_TRANSFER_STATUS => :transfer_status,
      P_MESSAGE         => :message
  );
END;
`.trim();

export const PAY_RUN_SELECT_SQL = `
SELECT
    R.PAY_RUN_ID,
    R.ENTERPRISE_ID,
    R.PROCESS_MONTH_NO,
    R.PROCESS_YEAR,
    R.RUN_START_DATE,
    R.RUN_END_DATE,
    R.RUN_STATUS,
    R.RUN_TYPE
FROM COMP.COMP_PAY_RUNS R
WHERE R.ENTERPRISE_ID = :enterprise_id
  AND R.PAY_RUN_ID = :pay_run_id
`.trim();

export const PAYROLL_DEFINITION_LOOKUP_SQL = `
SELECT
    PD.PAYROLL_ID,
    LOWER(RAWTOHEX(PD.PAYROLL_GUID)) AS PAYROLL_GUID,
    PD.ENTERPRISE_ID,
    PD.PAYROLL_NAME,
    PD.PAYROLL_CODE,
    PD.STATUS,
    PD.EFFECTIVE_START_DATE,
    PD.EFFECTIVE_END_DATE
FROM PAY.PAYROLL_DEFINITIONS PD
WHERE PD.PAYROLL_ID = :payroll_id
  AND PD.ENTERPRISE_ID = :enterprise_id
`.trim();

export const TRANSFERRED_ENTRIES_SELECT = `
SELECT
    E.ELEMENT_ENTRY_ID,
    LOWER(RAWTOHEX(E.ELEMENT_ENTRY_GUID)) AS ELEMENT_ENTRY_GUID,
    E.ENTERPRISE_ID,
    E.EMPLOYEE_ID,
    E.ELEMENT_ID,
    PE.ELEMENT_CODE,
    PE.ELEMENT_NAME,
    E.PAYROLL_ID,
    LOWER(RAWTOHEX(PD.PAYROLL_GUID)) AS PAYROLL_GUID,
    PD.PAYROLL_NAME,
    PD.PAYROLL_CODE,
    PD.STATUS AS PAYROLL_STATUS,
    E.BATCH_ID AS COMP_PAY_RUN_ID,
    E.SOURCE_CODE,
    E.SOURCE_REFERENCE,
    E.SEQUENCE_NUMBER,
    E.REASON_TEXT,
    E.EFFECTIVE_AS_OF_DATE,
    E.EFFECTIVE_START_DATE,
    E.EFFECTIVE_END_DATE,
    E.RETROACTIVE_FLAG,
    E.PROCESSED_FLAG,
    E.APPROVAL_STATUS_CODE,
    E.VOID_FLAG,
    E.DELETE_FLAG,
    V.ENTRY_VALUE_ID,
    V.CURRENCY_CODE,
    V.AMOUNT,
    V.RETRO_AMOUNT,
    V.PAY_VALUE,
    E.CREATED_BY,
    E.CREATION_DATE
FROM PAY.PAY_ELEMENT_ENTRIES E
JOIN PAY.PAY_ELEMENT_ENTRY_VALUES V
  ON V.ELEMENT_ENTRY_ID = E.ELEMENT_ENTRY_ID
LEFT JOIN PAY.PAY_ELEMENTS PE
  ON PE.ELEMENT_ID = E.ELEMENT_ID
 AND PE.ENTERPRISE_ID = E.ENTERPRISE_ID
LEFT JOIN PAY.PAYROLL_DEFINITIONS PD
  ON PD.PAYROLL_ID = E.PAYROLL_ID
 AND PD.ENTERPRISE_ID = E.ENTERPRISE_ID
WHERE E.ENTERPRISE_ID = :enterprise_id
  AND E.SOURCE_CODE = 'COMPENSATION'
  AND NVL(E.VOID_FLAG, 'N') = 'N'
  AND NVL(E.DELETE_FLAG, 'N') = 'N'
`.trim();
