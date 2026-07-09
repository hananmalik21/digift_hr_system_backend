-- =============================================================================
-- 01. Sequence and trigger for PAY.PAY_ELEMENT_REL_RULES
-- Generates RULE_ID / RULE_GUID when not supplied. WHO audit fields are set
-- by PAY_ELEMENT_REL_RULES_PKG.
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
     AND sequence_name = 'PAY_ELEMENT_REL_RULES_S';

  IF l_count = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE SEQUENCE PAY.PAY_ELEMENT_REL_RULES_S
      START WITH 1
      INCREMENT BY 1
      NOCACHE
      NOCYCLE';
    DBMS_OUTPUT.PUT_LINE('Created PAY_ELEMENT_REL_RULES_S.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('PAY_ELEMENT_REL_RULES_S already exists.');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER PAY.PAY_ELEMENT_REL_RULES_BIU_TRG
BEFORE INSERT OR UPDATE ON PAY.PAY_ELEMENT_REL_RULES
FOR EACH ROW
BEGIN
    IF INSERTING THEN
        IF :NEW.RULE_ID IS NULL THEN
            :NEW.RULE_ID := PAY.PAY_ELEMENT_REL_RULES_S.NEXTVAL;
        END IF;

        IF :NEW.RULE_GUID IS NULL THEN
            :NEW.RULE_GUID := SYS_GUID();
        END IF;
    END IF;
END;
/

PROMPT 01_create_sequence_and_trigger.sql completed.
