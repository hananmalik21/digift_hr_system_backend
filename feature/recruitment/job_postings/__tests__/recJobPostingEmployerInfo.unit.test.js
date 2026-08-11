/**
 * Unit tests for job-posting employer-info GUID parse + mapper.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import { parseJobPostingEmployerInfoGuid } from '../utils/recJobPostingEmployerInfoValidators.js';
import {
  mapJobPostingEmployerInfoRow,
  toJobPostingEmployerInfoApiData
} from '../utils/recJobPostingEmployerInfoMapper.js';

const POSTING_GUID = '501D19D3B5CF219CE0633519000AF268';
const COMPANY_ID = '4CFC35A5FBCEFD23E0633519000A31ED';
const EMPLOYER_GUID = '589AECBE5B6824EDE0631718000A37DF';

test('parseJobPostingEmployerInfoGuid accepts exact 32-char hex', () => {
  assert.equal(parseJobPostingEmployerInfoGuid(POSTING_GUID.toLowerCase()), POSTING_GUID);
});

test('parseJobPostingEmployerInfoGuid rejects invalid GUID', () => {
  assert.throws(() => parseJobPostingEmployerInfoGuid('abc'), ValidationError);
  assert.throws(() => parseJobPostingEmployerInfoGuid(''), ValidationError);
});

test('mapJobPostingEmployerInfoRow maps company-level with logo_url', () => {
  const mapped = mapJobPostingEmployerInfoRow({
    POSTING_GUID,
    ENTERPRISE_ID: 3,
    REQUISITION_ID: 1001,
    REQUISITION_ORG_UNIT_ID: '4C7F674DA959F58FE0633519000AB699',
    REQUISITION_FOUND: 'Y',
    COMPANY_ID,
    COMPANY_CODE: 'DIGIFY_SOLUTIONS_LLC',
    COMPANY_NAME: 'Digify Solutions LLC',
    COMPANY_NAME_AR: null,
    EMPLOYER_INFO_SOURCE: 'COMPANY_LEVEL',
    EMPLOYER_INFO_GUID: EMPLOYER_GUID,
    EMPLOYEE_INFO: 'Join our team',
    INFORMATION: 'Employer information',
    INDUSTRY: 'HR Technology',
    ABOUT_COMPANY: 'About',
    LOGO_AVAILABLE: 'Y',
    LOGO_FILE_NAME: 'logo.png',
    LOGO_MIME_TYPE: 'image/png',
    ACTIVE_FLAG: 'Y'
  });

  assert.equal(mapped.employer_info_source, 'COMPANY_LEVEL');
  assert.equal(mapped.company_id, COMPANY_ID);
  assert.equal(mapped.logo_available, 'Y');
  assert.equal(mapped.logo_url, `/api/employer-info/${EMPLOYER_GUID}/logo`);
  assert.equal(mapped.logo, undefined);

  const api = toJobPostingEmployerInfoApiData(mapped);
  assert.equal(api.requisition_found, undefined);
  assert.equal(api.employer_info_guid, EMPLOYER_GUID);
});

test('mapJobPostingEmployerInfoRow null employer fields when none configured', () => {
  const mapped = mapJobPostingEmployerInfoRow({
    POSTING_GUID,
    ENTERPRISE_ID: 3,
    COMPANY_ID,
    COMPANY_NAME: 'Digify Solutions LLC',
    REQUISITION_FOUND: 'Y',
    EMPLOYER_INFO_SOURCE: null,
    EMPLOYER_INFO_GUID: null,
    LOGO_AVAILABLE: 'N'
  });

  assert.equal(mapped.employer_info_source, null);
  assert.equal(mapped.employer_info_guid, null);
  assert.equal(mapped.logo_available, 'N');
  assert.equal(mapped.logo_url, null);
  assert.equal(mapped.company_name, 'Digify Solutions LLC');
});

test('mapJobPostingEmployerInfoRow rejects unknown employer_info_source', () => {
  const mapped = mapJobPostingEmployerInfoRow({
    POSTING_GUID,
    EMPLOYER_INFO_SOURCE: 'OTHER',
    EMPLOYER_INFO_GUID: EMPLOYER_GUID,
    LOGO_AVAILABLE: 'N'
  });
  assert.equal(mapped.employer_info_source, null);
});
