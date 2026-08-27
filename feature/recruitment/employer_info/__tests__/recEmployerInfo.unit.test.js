/**
 * Unit tests for REC.EMPLOYER_INFO validators, mapper, and HTTP status mapping.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  buildEmployerInfoPayload,
  parseActiveFlag,
  parseAssignmentType,
  parseEmployerInfoGuid,
  parseListQuery,
  parseRequiredEnterpriseId,
  validateLogoUpload
} from '../utils/recEmployerInfoValidators.js';
import { mapEmployerInfoViewRow } from '../utils/recEmployerInfoMapper.js';
import {
  buildEmployerInfoLogoUrl,
  withPublicLogoUrls
} from '../utils/recEmployerInfoLogoUrl.js';
import {
  packageFailureHttpStatus,
  packageStatusIsSuccess
} from '../utils/recEmployerInfoResponses.js';

const VALID_GUID = '501D19D3B5CF219CE0633519000AF268';
const COMPANY_ID = '4CFC35A5FBCEFD23E0633519000A31ED';

test('parseEmployerInfoGuid accepts 32-char hex', () => {
  assert.equal(parseEmployerInfoGuid(VALID_GUID), VALID_GUID);
  assert.equal(
    parseEmployerInfoGuid(VALID_GUID.toLowerCase()),
    VALID_GUID
  );
});

test('parseEmployerInfoGuid rejects invalid values', () => {
  assert.throws(() => parseEmployerInfoGuid('abc'), ValidationError);
  assert.throws(() => parseEmployerInfoGuid('not-a-valid-guid'), ValidationError);
  assert.throws(() => parseEmployerInfoGuid(''), ValidationError);
  assert.throws(() => parseEmployerInfoGuid(null), ValidationError);
  assert.throws(() => parseEmployerInfoGuid('ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'), ValidationError);
});

test('parseRequiredEnterpriseId requires positive integer', () => {
  assert.equal(parseRequiredEnterpriseId('3'), 3);
  assert.throws(() => parseRequiredEnterpriseId(undefined), ValidationError);
  assert.throws(() => parseRequiredEnterpriseId('0'), ValidationError);
});

test('parseAssignmentType accepts only ENTERPRISE_LEVEL / COMPANY_LEVEL', () => {
  assert.equal(parseAssignmentType('company_level'), 'COMPANY_LEVEL');
  assert.throws(() => parseAssignmentType('OTHER'), ValidationError);
});

test('parseActiveFlag accepts Y/N only', () => {
  assert.equal(parseActiveFlag('y'), 'Y');
  assert.equal(parseActiveFlag('N'), 'N');
  assert.throws(() => parseActiveFlag('X'), ValidationError);
});

test('buildEmployerInfoPayload CREATE COMPANY_LEVEL requires company_id', () => {
  assert.throws(
    () =>
      buildEmployerInfoPayload({
        enterprise_id: 3,
        assignment_type: 'COMPANY_LEVEL',
        employee_info: 'Join us'
      }),
    ValidationError
  );
});

test('buildEmployerInfoPayload CREATE COMPANY_LEVEL with company_id', () => {
  const payload = buildEmployerInfoPayload({
    enterprise_id: 3,
    assignment_type: 'COMPANY_LEVEL',
    company_id: COMPANY_ID,
    employee_info: 'Join our team',
    information: 'Employer information',
    industry: 'HR Technology',
    about_company: 'Detailed company description',
    active_flag: 'Y',
    company_name: 'Should Not Persist'
  });

  assert.equal(payload.enterprise_id, 3);
  assert.equal(payload.assignment_type, 'COMPANY_LEVEL');
  assert.equal(payload.company_id, COMPANY_ID);
  assert.equal(payload.employee_info, 'Join our team');
  assert.equal(payload.company_name, undefined);
});

test('buildEmployerInfoPayload ENTERPRISE_LEVEL rejects company_id', () => {
  assert.throws(
    () =>
      buildEmployerInfoPayload({
        enterprise_id: 3,
        assignment_type: 'ENTERPRISE_LEVEL',
        company_id: COMPANY_ID
      }),
    ValidationError
  );
});

test('buildEmployerInfoPayload ENTERPRISE_LEVEL sets company_id null', () => {
  const payload = buildEmployerInfoPayload({
    enterprise_id: 3,
    assignment_type: 'ENTERPRISE_LEVEL'
  });
  assert.equal(payload.company_id, null);
  assert.equal(payload.active_flag, 'Y');
});

test('buildEmployerInfoPayload UPDATE injects employer_info_guid', () => {
  const payload = buildEmployerInfoPayload(
    {
      enterprise_id: 3,
      assignment_type: 'COMPANY_LEVEL',
      company_id: COMPANY_ID,
      employee_info: 'Updated'
    },
    { employerInfoGuid: VALID_GUID }
  );
  assert.equal(payload.employer_info_guid, VALID_GUID);
});

test('parseListQuery requires enterprise_id and supports filters', () => {
  assert.throws(() => parseListQuery({}), ValidationError);

  const filters = parseListQuery({
    enterprise_id: '3',
    assignment_type: 'COMPANY_LEVEL',
    active_flag: 'Y',
    company_id: COMPANY_ID
  });
  assert.deepEqual(filters, {
    enterprise_id: 3,
    assignment_type: 'COMPANY_LEVEL',
    company_id: COMPANY_ID,
    active_flag: 'Y'
  });
});

test('parseListQuery accepts resolved enterprise_id override', () => {
  const filters = parseListQuery(
    { assignment_type: 'ENTERPRISE_LEVEL' },
    { enterprise_id: 7 }
  );
  assert.equal(filters.enterprise_id, 7);
  assert.equal(filters.assignment_type, 'ENTERPRISE_LEVEL');
});

test('validateLogoUpload accepts png and rejects bad mime / oversized', () => {
  const ok = validateLogoUpload({
    buffer: Buffer.from([1, 2, 3]),
    mimetype: 'image/png',
    originalname: 'digify-logo.png',
    size: 3
  });
  assert.equal(ok.mime_type, 'image/png');
  assert.equal(ok.file_name, 'digify-logo.png');

  assert.throws(
    () =>
      validateLogoUpload({
        buffer: Buffer.from([1]),
        mimetype: 'application/pdf',
        originalname: 'x.pdf',
        size: 1
      }),
    ValidationError
  );

  assert.equal(validateLogoUpload(null), null);
  assert.throws(() => validateLogoUpload(null, { required: true }), ValidationError);
});

test('mapEmployerInfoViewRow builds relative logo_url and omits blob', () => {
  const mapped = mapEmployerInfoViewRow({
    EMPLOYER_INFO_ID: 1,
    EMPLOYER_INFO_GUID: VALID_GUID,
    ENTERPRISE_ID: 3,
    ASSIGNMENT_TYPE: 'COMPANY_LEVEL',
    COMPANY_ID: COMPANY_ID,
    COMPANY_CODE: 'DIGIFY_SOLUTIONS_LLC',
    COMPANY_NAME: 'Digify Solutions LLC',
    COMPANY_NAME_AR: null,
    EMPLOYEE_INFO: 'Join our team',
    INFORMATION: 'Employer information',
    INDUSTRY: 'HR Technology',
    ABOUT_COMPANY: 'Detailed information about the company',
    LOGO_AVAILABLE: 'Y',
    LOGO_FILE_NAME: 'digify-logo.png',
    LOGO_MIME_TYPE: 'image/png',
    ACTIVE_FLAG: 'Y',
    CREATION_DATE: new Date('2026-01-01T00:00:00Z'),
    CREATED_BY: 'SYSTEM',
    LAST_UPDATE_DATE: new Date('2026-01-02T00:00:00Z'),
    LAST_UPDATED_BY: 'SYSTEM',
    LOGO: Buffer.from('should-not-appear')
  });

  assert.equal(mapped.employer_info_guid, VALID_GUID);
  assert.equal(mapped.company_id, COMPANY_ID);
  assert.equal(mapped.company_name, 'Digify Solutions LLC');
  assert.equal(mapped.logo_available, 'Y');
  assert.equal(mapped.logo_url, `/api/employer-info/${VALID_GUID}/logo`);
  assert.equal(mapped.logo, undefined);
  assert.equal(mapped.LOGO, undefined);
});

test('withPublicLogoUrls absolutizes from API_BASE_URL', () => {
  const prev = process.env.API_BASE_URL;
  process.env.API_BASE_URL = 'https://api.example.com';
  try {
    const mapped = withPublicLogoUrls({
      employer_info_guid: VALID_GUID,
      logo_available: 'Y',
      logo_url: `/api/employer-info/${VALID_GUID}/logo`
    });
    assert.equal(
      mapped.logo_url,
      `https://api.example.com/api/employer-info/${VALID_GUID}/logo`
    );
    assert.equal(
      buildEmployerInfoLogoUrl(VALID_GUID),
      `https://api.example.com/api/employer-info/${VALID_GUID}/logo`
    );
  } finally {
    if (prev === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = prev;
  }
});

test('withPublicLogoUrls absolutizes from request host', () => {
  const prev = process.env.API_BASE_URL;
  delete process.env.API_BASE_URL;
  try {
    const req = {
      protocol: 'https',
      get: (name) => (name === 'host' ? 'careers.synexis.com' : undefined)
    };
    const mapped = withPublicLogoUrls(
      {
        employer_info_guid: VALID_GUID,
        logo_available: 'Y',
        logo_url: `/api/employer-info/${VALID_GUID}/logo`
      },
      req
    );
    assert.equal(
      mapped.logo_url,
      `https://careers.synexis.com/api/employer-info/${VALID_GUID}/logo`
    );
  } finally {
    if (prev === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = prev;
  }
});

test('withPublicLogoUrls skips rows without an available logo', () => {
  const row = {
    employer_info_guid: VALID_GUID,
    logo_available: 'N',
    logo_url: null
  };
  assert.equal(withPublicLogoUrls(row).logo_url, null);
});

test('packageFailureHttpStatus maps duplicates to 409 and not-found to 404', () => {
  assert.equal(
    packageFailureHttpStatus(
      'Employer information already exists for the selected company.'
    ),
    409
  );
  assert.equal(
    packageFailureHttpStatus('Enterprise-level employer information already exists.'),
    409
  );
  assert.equal(packageFailureHttpStatus('Employer information not found.'), 404);
  assert.equal(packageFailureHttpStatus('company_id is required'), 400);
});

test('packageStatusIsSuccess accepts S and SUCCESS', () => {
  assert.equal(packageStatusIsSuccess('S'), true);
  assert.equal(packageStatusIsSuccess('SUCCESS'), true);
  assert.equal(packageStatusIsSuccess('E'), false);
  assert.equal(packageStatusIsSuccess('ERROR'), false);
});
