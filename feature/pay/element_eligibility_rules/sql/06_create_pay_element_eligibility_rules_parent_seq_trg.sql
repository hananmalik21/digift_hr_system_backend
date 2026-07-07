-- =============================================================================
-- 06. Parent sequence and trigger for PAY.PAY_ELEMENT_ELIGIBILITY_RULES
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
     AND sequence_name = 'PAY_ELEMENT_ELG_RULES_S';

  IF l_count = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE SEQUENCE PAY.PAY_ELEMENT_ELG_RULES_S
      START WITH 1
      INCREMENT BY 1
      NOCACHE
      NOCYCLE';
    DBMS_OUTPUT.PUT_LINE('Created PAY_ELEMENT_ELG_RULES_S.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('PAY_ELEMENT_ELG_RULES_S already exists.');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER PAY.PAY_ELEMENT_ELG_RULES_BIU_TRG
BEFORE INSERT OR UPDATE ON PAY.PAY_ELEMENT_ELIGIBILITY_RULES
FOR EACH ROW
BEGIN
    IF INSERTING THEN
        IF :NEW.ELIGIBILITY_RULE_ID IS NULL THEN
            :NEW.ELIGIBILITY_RULE_ID := PAY.PAY_ELEMENT_ELG_RULES_S.NEXTVAL;
        END IF;

        IF :NEW.ELIGIBILITY_RULE_GUID IS NULL THEN
            :NEW.ELIGIBILITY_RULE_GUID := SYS_GUID();
        END IF;
    END IF;
END;
/

PROMPT 06_create_pay_element_eligibility_rules_parent_seq_trg.sql completed.
