-- =============================================================================
-- 02. Create child table PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES
-- Stores multiple criteria values per eligibility rule.
-- Run as PAY (or schema owner).
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO l_count
    FROM all_tables
   WHERE owner = 'PAY'
     AND table_name = 'PAY_ELEMENT_ELIGIBILITY_RULE_VALUES';

  IF l_count > 0 THEN
    DBMS_OUTPUT.PUT_LINE('PAY_ELEMENT_ELIGIBILITY_RULE_VALUES already exists.');
    RETURN;
  END IF;

  EXECUTE IMMEDIATE '
    CREATE TABLE PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES (
      ELIGIBILITY_RULE_VALUE_ID   NUMBER          NOT NULL,
      ELIGIBILITY_RULE_VALUE_GUID RAW(16)         DEFAULT SYS_GUID() NOT NULL,
      ELIGIBILITY_RULE_ID         NUMBER          NOT NULL,
      CRITERIA_TYPE_CODE          VARCHAR2(50)    NOT NULL,
      CRITERIA_VALUE              VARCHAR2(500)   NOT NULL,
      LEGAL_EMPLOYER_ID           RAW(16),
      ORG_UNIT_ID                 RAW(16),
      GRADE_ID                    NUMBER,
      POSITION_ID                 RAW(16),
      EMPLOYMENT_TYPE_CODE        VARCHAR2(50),
      LOCATION_CODE               VARCHAR2(100),
      CREATED_BY                  VARCHAR2(100),
      CREATION_DATE               DATE            DEFAULT SYSDATE,
      LAST_UPDATED_BY             VARCHAR2(100),
      LAST_UPDATE_DATE            DATE            DEFAULT SYSDATE,
      CONSTRAINT PAY_EERV_PK PRIMARY KEY (ELIGIBILITY_RULE_VALUE_ID),
      CONSTRAINT PAY_EERV_GUID_UK UNIQUE (ELIGIBILITY_RULE_VALUE_GUID),
      CONSTRAINT PAY_EERV_RULE_FK FOREIGN KEY (ELIGIBILITY_RULE_ID)
        REFERENCES PAY.PAY_ELEMENT_ELIGIBILITY_RULES (ELIGIBILITY_RULE_ID)
        ON DELETE CASCADE,
      CONSTRAINT PAY_EERV_UK1 UNIQUE (ELIGIBILITY_RULE_ID, CRITERIA_TYPE_CODE, CRITERIA_VALUE)
    )';

  DBMS_OUTPUT.PUT_LINE('Created PAY_ELEMENT_ELIGIBILITY_RULE_VALUES.');
END;
/

PROMPT 02_create_pay_element_eligibility_rule_values.sql completed.
