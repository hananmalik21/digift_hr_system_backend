-- =============================================================================
-- 03. Child sequence and trigger for PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES
-- Generates only PK/GUID. WHO fields come from package/API parameters.
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO l_count
    FROM all_sequences
   WHERE sequence_owner = 'PAY'
     AND sequence_name = 'PAY_ELEMENT_ELIG_RULE_VALUES_S';

  IF l_count = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE SEQUENCE PAY.PAY_ELEMENT_ELIG_RULE_VALUES_S
      START WITH 1
      INCREMENT BY 1
      NOCACHE
      NOCYCLE';
    DBMS_OUTPUT.PUT_LINE('Created PAY_ELEMENT_ELIG_RULE_VALUES_S.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('PAY_ELEMENT_ELIG_RULE_VALUES_S already exists.');
  END IF;
END;
/

BEGIN
  FOR r IN (
    SELECT trigger_name
      FROM all_triggers
     WHERE owner = 'PAY'
       AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULE_VALUES'
       AND trigger_name IN ('PAY_EERV_BIR_TRG')
  ) LOOP
    EXECUTE IMMEDIATE 'DROP TRIGGER PAY.' || r.trigger_name;
    DBMS_OUTPUT.PUT_LINE('Dropped legacy trigger PAY.' || r.trigger_name);
  END LOOP;
END;
/

CREATE OR REPLACE TRIGGER PAY.PAY_EERV_BIU_TRG
BEFORE INSERT OR UPDATE ON PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES
FOR EACH ROW
BEGIN
    IF INSERTING THEN
        IF :NEW.ELIGIBILITY_RULE_VALUE_ID IS NULL THEN
            :NEW.ELIGIBILITY_RULE_VALUE_ID := PAY.PAY_ELEMENT_ELIG_RULE_VALUES_S.NEXTVAL;
        END IF;

        IF :NEW.ELIGIBILITY_RULE_VALUE_GUID IS NULL THEN
            :NEW.ELIGIBILITY_RULE_VALUE_GUID := SYS_GUID();
        END IF;
    END IF;
END;
/

PROMPT 03_create_pay_element_eligibility_rule_values_seq_trg.sql completed.
