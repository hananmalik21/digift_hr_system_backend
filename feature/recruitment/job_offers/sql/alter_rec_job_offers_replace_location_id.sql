-- Replace LOCATION_ID with free-text LOCATION on REC.REC_JOB_OFFERS.
-- Run as REC schema owner after backing up existing location data if needed.

ALTER TABLE REC.REC_JOB_OFFERS
DROP COLUMN LOCATION_ID;

ALTER TABLE REC.REC_JOB_OFFERS
ADD LOCATION VARCHAR2(500);
