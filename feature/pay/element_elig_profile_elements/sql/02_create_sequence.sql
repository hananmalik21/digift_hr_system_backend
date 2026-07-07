-- =============================================================================
-- 02. Create PAY.PAY_ELEMENT_ELIG_PROF_ELEMS_S
-- =============================================================================

SET DEFINE OFF;
WHENEVER SQLERROR EXIT SQL.SQLCODE;

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_count
    FROM all_sequences
   WHERE sequence_owner = 'PAY'
     AND sequence_name = 'PAY_ELEMENT_ELIG_PROF_ELEMS_S';

  IF l_count = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE SEQUENCE PAY.PAY_ELEMENT_ELIG_PROF_ELEMS_S
      START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE';
    DBMS_OUTPUT.PUT_LINE('Created PAY_ELEMENT_ELIG_PROF_ELEMS_S.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('PAY_ELEMENT_ELIG_PROF_ELEMS_S already exists.');
  END IF;
END;
/

PROMPT 02_create_sequence.sql completed.
