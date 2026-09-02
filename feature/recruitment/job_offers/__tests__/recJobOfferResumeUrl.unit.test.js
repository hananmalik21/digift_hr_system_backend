/**
 * Unit tests for resume_url on REC.V_JOB_OFFER_MANAGEMENT list/detail mapping.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JOB_OFFER_MANAGEMENT_SELECT_COLUMNS,
  JOB_OFFER_MANAGEMENT_SELECT_SQL
} from '../utils/recJobOfferConstants.js';
import { mapJobOfferManagementListRow } from '../utils/recJobOfferManagementMappers.js';
import { mapJobOfferDetailOffer } from '../utils/recJobOfferMappers.js';
import {
  APPLICATION_RESUME_URL_PREFIX,
  buildApplicationResumeUrl
} from '../../applications/utils/recApplicationResumeMapper.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLICATION_GUID = '9F82D53C95A84BC78D91273B59128A01';
const RESUME_URL = `${APPLICATION_RESUME_URL_PREFIX}/${APPLICATION_GUID}/resume`;

function readFeatureFile(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

test('JOB_OFFER_MANAGEMENT_SELECT_COLUMNS includes RESUME_URL and excludes BLOB content', () => {
  assert.ok(JOB_OFFER_MANAGEMENT_SELECT_COLUMNS.includes('RESUME_URL'));
  assert.ok(!JOB_OFFER_MANAGEMENT_SELECT_COLUMNS.includes('RESUME_FILE_CONTENT'));
  assert.ok(!JOB_OFFER_MANAGEMENT_SELECT_COLUMNS.includes('HAS_RESUME'));
});

test('management list SELECT SQL projects v.RESUME_URL', () => {
  assert.match(JOB_OFFER_MANAGEMENT_SELECT_SQL, /v\.RESUME_URL/);
  assert.doesNotMatch(JOB_OFFER_MANAGEMENT_SELECT_SQL, /RESUME_FILE_CONTENT/);
});

test('mapJobOfferManagementListRow maps RESUME_URL to resume_url', async () => {
  const mapped = await mapJobOfferManagementListRow({
    OFFER_ID: 101,
    OFFER_GUID: 'ABC123ABC123ABC123ABC123ABC123AB',
    APPLICATION_ID: 5001,
    RESUME_URL: RESUME_URL,
    STATUS_CODE: 'EXTENDED',
    DISPLAY_STATUS: 'SENT'
  });

  assert.equal(mapped.offer_id, 101);
  assert.equal(mapped.application_id, 5001);
  assert.equal(mapped.resume_url, RESUME_URL);
  assert.equal(mapped.status_code, 'EXTENDED');
  assert.equal(mapped.display_status, 'SENT');
});

test('mapJobOfferManagementListRow returns resume_url null when the application has no resume', async () => {
  const mappedNull = await mapJobOfferManagementListRow({ RESUME_URL: null });
  assert.equal(mappedNull.resume_url, null);

  const mappedEmpty = await mapJobOfferManagementListRow({ RESUME_URL: '  ' });
  assert.equal(mappedEmpty.resume_url, null);

  const mappedMissing = await mapJobOfferManagementListRow({});
  assert.equal(mappedMissing.resume_url, null);
});

test('mapJobOfferDetailOffer maps RESUME_URL to resume_url without dropping existing fields', () => {
  const mapped = mapJobOfferDetailOffer({
    OFFER_GUID: 'ABC123ABC123ABC123ABC123ABC123AB',
    APPLICATION_GUID: APPLICATION_GUID,
    APPLICATION_NUMBER: 'APP-5001',
    RESUME_URL: RESUME_URL,
    JOB_TITLE: 'Senior Software Engineer',
    STATUS_CODE: 'EXTENDED'
  });

  assert.equal(mapped.resume_url, RESUME_URL);
  assert.equal(mapped.application_guid, APPLICATION_GUID);
  assert.equal(mapped.application_number, 'APP-5001');
  assert.equal(mapped.job_title, 'Senior Software Engineer');
  assert.equal(mapped.status_code, 'EXTENDED');
});

test('mapJobOfferDetailOffer returns resume_url null when no resume is attached', () => {
  assert.equal(mapJobOfferDetailOffer({ RESUME_URL: null }).resume_url, null);
  assert.equal(mapJobOfferDetailOffer({}).resume_url, null);
});

test('detail SQL derives RESUME_URL from the linked application and does not select the BLOB', () => {
  const source = readFeatureFile('model', 'recJobOfferViewModel.js');
  assert.match(source, /END AS RESUME_URL/);
  assert.match(source, /DBMS_LOB\.GETLENGTH\(a\.RESUME_FILE_CONTENT\)/);
  assert.match(source, /RAWTOHEX\(a\.APPLICATION_GUID\) \|\| '\/resume'/);
  assert.doesNotMatch(source, /a\.RESUME_FILE_CONTENT(?:\s|,)/);
});

test('Excel export key order includes resume_url after application_id', () => {
  const source = readFeatureFile('service', 'jobOfferExportService.js');
  assert.match(source, /'application_id',\s*'resume_url',/);
});

test('buildApplicationResumeUrl matches the view RESUME_URL path', () => {
  assert.equal(buildApplicationResumeUrl(APPLICATION_GUID), RESUME_URL);
  assert.equal(
    RESUME_URL,
    `/api/recruitment/applications/${APPLICATION_GUID}/resume`
  );
});

test('application resume download endpoint streams the file with type/name headers and 404s when missing', () => {
  const controller = readFileSync(
    join(ROOT, '..', 'applications', 'controller', 'recApplicationsController.js'),
    'utf8'
  );
  const model = readFileSync(
    join(ROOT, '..', 'applications', 'model', 'recApplicationResumeModel.js'),
    'utf8'
  );

  assert.match(controller, /\/:application_guid\/resume/);
  assert.match(controller, /validateApplicationGuidEnterpriseParams/);
  assert.match(controller, /applicationResumeExists/);
  assert.match(controller, /getApplicationResumeByGuid/);
  assert.match(controller, /Content-Type/);
  assert.match(controller, /Content-Disposition/);
  assert.match(controller, /sendPackageResponse\(res, 404/);
  assert.match(controller, /RESUME_NOT_FOUND_MESSAGE/);
  assert.match(controller, /NOT_FOUND_MESSAGE/);

  assert.match(
    model,
    /SELECT RESUME_FILE_NAME, RESUME_FILE_TYPE, RESUME_FILE_SIZE, RESUME_FILE_CONTENT/
  );
  assert.match(model, /APPLICATION_GUID = :p_application_guid/);
  assert.match(model, /ENTERPRISE_ID = :p_enterprise_id/);
});
