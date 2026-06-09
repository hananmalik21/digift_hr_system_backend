-- Daily scheduler to expire extended job offers past expiry date.
-- Calls REC.REC_JOB_OFFER_PKG.EXPIRE_OFFERS at 12:05 AM daily.
-- Run as DBA or user with DBMS_SCHEDULER privilege.

BEGIN
  DBMS_SCHEDULER.DROP_JOB(job_name => 'REC_EXPIRE_JOB_OFFERS', force => TRUE);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -27475 THEN
      RAISE;
    END IF;
END;
/

BEGIN
  DBMS_SCHEDULER.CREATE_JOB(
    job_name        => 'REC_EXPIRE_JOB_OFFERS',
    job_type        => 'PLSQL_BLOCK',
    job_action      => '
DECLARE
  L_STATUS  VARCHAR2(100);
  L_MESSAGE VARCHAR2(4000);
BEGIN
  REC.REC_JOB_OFFER_PKG.EXPIRE_OFFERS(
    P_UPDATED_BY => ''SYSTEM'',
    P_STATUS     => L_STATUS,
    P_MESSAGE    => L_MESSAGE
  );
END;',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=DAILY;BYHOUR=0;BYMINUTE=5;BYSECOND=0',
    enabled         => TRUE
  );
END;
/
