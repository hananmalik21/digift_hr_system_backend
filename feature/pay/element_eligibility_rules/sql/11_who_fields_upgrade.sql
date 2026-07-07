-- =============================================================================
-- 11. WHO fields upgrade: triggers + package recompile + CREATE_RULE smoke test
-- Run as PAY (or schema owner).
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;
SET SERVEROUTPUT ON;

@@06_create_pay_element_eligibility_rules_parent_seq_trg.sql
@@03_create_pay_element_eligibility_rule_values_seq_trg.sql
@@PAY_ELEMENT_ELIGIBILITY_RULES_PKG_SPEC.sql
@@PAY_ELEMENT_ELIGIBILITY_RULES_PKG_BODY.sql

ALTER PACKAGE PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG COMPILE;
ALTER PACKAGE PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG COMPILE BODY;

PROMPT === Object status ===
SELECT object_name, object_type, status
  FROM all_objects
 WHERE owner = 'PAY'
   AND object_name IN (
       'PAY_ELEMENT_ELG_RULES_BIU_TRG',
       'PAY_EERV_BIU_TRG',
       'PAY_ELEMENT_ELIGIBILITY_RULES_PKG',
       'V_PAY_ELEMENT_ELIGIBILITY_RULES'
   )
 ORDER BY object_type, object_name;

PROMPT === Compilation errors ===
SELECT name, type, line, position, text
  FROM all_errors
 WHERE owner = 'PAY'
   AND name IN (
       'PAY_ELEMENT_ELG_RULES_BIU_TRG',
       'PAY_EERV_BIU_TRG',
       'PAY_ELEMENT_ELIGIBILITY_RULES_PKG',
       'V_PAY_ELEMENT_ELIGIBILITY_RULES'
   )
 ORDER BY name, sequence;

DECLARE
    l_invalid_count NUMBER;
BEGIN
    SELECT COUNT(*)
      INTO l_invalid_count
      FROM all_objects
     WHERE owner = 'PAY'
       AND object_name IN (
           'PAY_ELEMENT_ELG_RULES_BIU_TRG',
           'PAY_EERV_BIU_TRG',
           'PAY_ELEMENT_ELIGIBILITY_RULES_PKG',
           'V_PAY_ELEMENT_ELIGIBILITY_RULES'
       )
       AND status <> 'VALID';

    IF l_invalid_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20005, l_invalid_count || ' PAY object(s) are still INVALID.');
    END IF;

    DBMS_OUTPUT.PUT_LINE('All target objects are VALID.');
END;
/

PROMPT === CREATE_RULE WHO fields smoke test ===
DECLARE
    l_success        VARCHAR2(10);
    l_message        VARCHAR2(4000);
    l_rule_id        NUMBER;
    l_rule_guid      VARCHAR2(100);
    l_criteria_json  CLOB;
BEGIN
    l_criteria_json := q'[
[
  {
    "criteria_type_code": "GRADE",
    "criteria_values": ["21", "31"]
  }
]
]';

    PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG.CREATE_RULE(
        p_enterprise_id            => 1,
        p_rule_name                => 'Monthly Payroll Eligibility Rule',
        p_criteria_values_json     => l_criteria_json,
        p_effective_start_date     => DATE '2026-01-01',
        p_effective_end_date       => DATE '4712-12-31',
        p_status                   => 'ACTIVE',
        p_created_by               => 'ADMIN',
        p_creation_date            => SYSDATE,
        p_last_updated_by          => 'ADMIN',
        p_last_update_date         => SYSDATE,
        x_success                  => l_success,
        x_message                  => l_message,
        x_eligibility_rule_id      => l_rule_id,
        x_eligibility_rule_guid    => l_rule_guid
    );

    DBMS_OUTPUT.PUT_LINE('Success   : ' || l_success);
    DBMS_OUTPUT.PUT_LINE('Message   : ' || l_message);
    DBMS_OUTPUT.PUT_LINE('Rule ID   : ' || l_rule_id);
    DBMS_OUTPUT.PUT_LINE('Rule GUID : ' || l_rule_guid);

    IF l_success <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20006, 'CREATE_RULE smoke test failed: ' || l_message);
    END IF;

    ROLLBACK;
END;
/

PROMPT 11_who_fields_upgrade.sql completed.
