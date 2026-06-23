-- =============================================================================
-- PAY.V_PAY_ELEMENT_ENTRIES — element entry list/detail view
-- One row per ELEMENT_ENTRY_ID (scalar subqueries for child values; no row multiplication).
-- Run as PAY (or ADMIN with privileges on PAY objects).
-- =============================================================================

CREATE OR REPLACE VIEW PAY.V_PAY_ELEMENT_ENTRIES AS
SELECT
    E.ELEMENT_ENTRY_ID,
    RAWTOHEX(E.ELEMENT_ENTRY_GUID) AS ELEMENT_ENTRY_GUID,
    E.ENTERPRISE_ID,
    E.EMPLOYEE_ID,
    E.PAYROLL_ID,
    E.ELEMENT_ID,

    PE.ELEMENT_CODE,
    PE.ELEMENT_NAME,

    EMP.FIRST_NAME_EN AS EMPLOYEE_FIRST_NAME,
    EMP.LAST_NAME_EN AS EMPLOYEE_LAST_NAME,
    A.EMPLOYEE_NUMBER AS EMP_NUMBER,

    (
        SELECT V.PAY_VALUE
          FROM PAY.PAY_ELEMENT_ENTRY_VALUES V
         WHERE V.ELEMENT_ENTRY_ID = E.ELEMENT_ENTRY_ID
         ORDER BY V.ENTRY_VALUE_ID
         FETCH FIRST 1 ROW ONLY
    ) AS PRIMARY_ENTRY_VALUE,

    (
        SELECT V.AMOUNT
          FROM PAY.PAY_ELEMENT_ENTRY_VALUES V
         WHERE V.ELEMENT_ENTRY_ID = E.ELEMENT_ENTRY_ID
         ORDER BY V.ENTRY_VALUE_ID
         FETCH FIRST 1 ROW ONLY
    ) AS AMOUNT,

    (
        SELECT V.CURRENCY_CODE
          FROM PAY.PAY_ELEMENT_ENTRY_VALUES V
         WHERE V.ELEMENT_ENTRY_ID = E.ELEMENT_ENTRY_ID
         ORDER BY V.ENTRY_VALUE_ID
         FETCH FIRST 1 ROW ONLY
    ) AS CURRENCY_CODE,

    E.SOURCE_CODE AS SOURCE,
    E.ELEMENT_CLASSIFICATION_CODE AS CLASSIFICATION,
    E.APPROVAL_STATUS_CODE AS STATUS,
    E.EFFECTIVE_AS_OF_DATE,
    E.EFFECTIVE_START_DATE,
    E.EFFECTIVE_END_DATE,
    E.ENTRY_TYPE_CODE,
    E.ELEMENT_PROCESSING_TYPE_CODE,
    E.PROCESSED_FLAG,
    E.RETROACTIVE_FLAG,
    E.AUTOMATIC_ENTRY_FLAG,
    E.SEQUENCE_NUMBER AS SEQ,
    E.REASON_TEXT AS REASON,
    E.COMMENTS,
    E.CREATED_BY,
    E.CREATION_DATE,
    E.LAST_UPDATED_BY,
    E.LAST_UPDATE_DATE,

    (
        SELECT JSON_ARRAYAGG(
                   JSON_OBJECT(
                       'pay_value' VALUE V.PAY_VALUE,
                       'amount' VALUE V.AMOUNT,
                       'currency_code' VALUE V.CURRENCY_CODE
                       ABSENT ON NULL
                   ) RETURNING CLOB
               )
          FROM PAY.PAY_ELEMENT_ENTRY_VALUES V
         WHERE V.ELEMENT_ENTRY_ID = E.ELEMENT_ENTRY_ID
    ) AS ENTRY_VALUES_JSON,

    (
        SELECT JSON_ARRAYAGG(
                   JSON_OBJECT(
                       'cost_allocation_keyflex_id' VALUE C.COST_ALLOCATION_KEYFLEX_ID,
                       'costing_type_code' VALUE C.COSTING_TYPE_CODE,
                       'account_code' VALUE C.ACCOUNT_CODE,
                       'cost_center_code' VALUE C.COST_CENTER_CODE
                       ABSENT ON NULL
                   ) RETURNING CLOB
               )
          FROM PAY.PAY_ELEMENT_ENTRY_COSTING C
         WHERE C.ELEMENT_ENTRY_ID = E.ELEMENT_ENTRY_ID
    ) AS COSTING_JSON,

    (
        SELECT JSON_ARRAYAGG(
                   JSON_OBJECT(
                       'context_segment_code' VALUE X.CONTEXT_SEGMENT_CODE,
                       'context_value' VALUE X.CONTEXT_VALUE
                       ABSENT ON NULL
                   ) RETURNING CLOB
               )
          FROM PAY.PAY_ELEMENT_ENTRY_CONTEXTS X
         WHERE X.ELEMENT_ENTRY_ID = E.ELEMENT_ENTRY_ID
    ) AS CONTEXTS_JSON

FROM PAY.PAY_ELEMENT_ENTRIES E
LEFT JOIN PAY.PAY_ELEMENTS PE
  ON PE.ELEMENT_ID = E.ELEMENT_ID
 AND PE.ENTERPRISE_ID = E.ENTERPRISE_ID
LEFT JOIN EMPL.EMPLOYEES EMP
  ON EMP.EMPLOYEE_ID = E.EMPLOYEE_ID
 AND EMP.ENTERPRISE_ID = E.ENTERPRISE_ID
LEFT JOIN (
    SELECT ENTERPRISE_ID, EMPLOYEE_ID, EMPLOYEE_NUMBER
      FROM (
            SELECT A.ENTERPRISE_ID,
                   A.EMPLOYEE_ID,
                   A.EMPLOYEE_NUMBER,
                   ROW_NUMBER() OVER (
                       PARTITION BY A.ENTERPRISE_ID, A.EMPLOYEE_ID
                       ORDER BY A.EFFECTIVE_START_DATE DESC,
                                A.ASSIGNMENT_ID DESC
                   ) RN
              FROM EMPL.ASSIGNMENTS A
           )
     WHERE RN = 1
) A
  ON A.ENTERPRISE_ID = E.ENTERPRISE_ID
 AND A.EMPLOYEE_ID = E.EMPLOYEE_ID
WHERE NVL(E.DELETE_FLAG, 'N') = 'N';
