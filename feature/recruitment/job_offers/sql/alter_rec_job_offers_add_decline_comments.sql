-- Add decline comments column (run as REC schema owner if not already applied).
ALTER TABLE REC.REC_JOB_OFFERS ADD (
  DECLINE_COMMENTS VARCHAR2(4000)
);
