-- =============================================================================
-- 03. Create PAY.PAY_EEL_PROF_ELEMS_BIU_TRG (PK/GUID only — WHO from API/package)
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

CREATE OR REPLACE TRIGGER PAY.PAY_EEL_PROF_ELEMS_BIU_TRG
BEFORE INSERT OR UPDATE ON PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS
FOR EACH ROW
BEGIN
    IF INSERTING THEN
        IF :NEW.PROFILE_ELEMENT_ID IS NULL THEN
            :NEW.PROFILE_ELEMENT_ID := PAY.PAY_ELEMENT_ELIG_PROF_ELEMS_S.NEXTVAL;
        END IF;

        IF :NEW.PROFILE_ELEMENT_GUID IS NULL THEN
            :NEW.PROFILE_ELEMENT_GUID := SYS_GUID();
        END IF;
    END IF;
END;
/

PROMPT 03_create_trigger.sql completed.
