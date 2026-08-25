/**
 * Unit tests for candidate send-email validators and HTML helpers.
 * No live Oracle / SMTP required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import { validateSendCandidateEmailBody } from '../utils/recCandidateSendEmailValidators.js';
import {
  buildPlainTextEmailHtml,
  escapeHtml,
  mapAttachmentMeta
} from '../utils/recCandidateSendEmailContent.js';
import { getSendCandidateEmailAttachments } from '../utils/recCandidateSendEmailMultipart.js';

const VALID_GUID = '501D19D3B5CF219CE0633519000AF268';

test('validateSendCandidateEmailBody accepts valid payload', () => {
  const payload = validateSendCandidateEmailBody(
    {
      enterprise_id: 3,
      subject: 'Hello',
      message: 'Please reply',
      message_type: 'email',
      template: 'Blank Message'
    },
    VALID_GUID
  );

  assert.deepEqual(payload, {
    enterprise_id: 3,
    subject: 'Hello',
    message: 'Please reply',
    message_type: 'EMAIL',
    template: 'Blank Message'
  });
});

test('validateSendCandidateEmailBody accepts body alias for message', () => {
  const payload = validateSendCandidateEmailBody(
    { enterprise_id: 1, subject: 'Sub', body: 'Alias body' },
    VALID_GUID
  );
  assert.equal(payload.message, 'Alias body');
});

test('validateSendCandidateEmailBody defaults message_type to EMAIL', () => {
  const payload = validateSendCandidateEmailBody(
    { enterprise_id: 1, subject: 'Sub', message: 'Hi' },
    VALID_GUID
  );
  assert.equal(payload.message_type, 'EMAIL');
  assert.equal(payload.template, null);
});

test('validateSendCandidateEmailBody rejects missing subject/message', () => {
  assert.throws(
    () => validateSendCandidateEmailBody({ enterprise_id: 1 }, VALID_GUID),
    ValidationError
  );
  assert.throws(
    () =>
      validateSendCandidateEmailBody(
        { enterprise_id: 1, subject: 'Only subject' },
        VALID_GUID
      ),
    ValidationError
  );
});

test('validateSendCandidateEmailBody rejects invalid message_type', () => {
  assert.throws(
    () =>
      validateSendCandidateEmailBody(
        {
          enterprise_id: 1,
          subject: 'Sub',
          message: 'Hi',
          message_type: 'SMS'
        },
        VALID_GUID
      ),
    ValidationError
  );
});

test('escapeHtml escapes markup characters', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('buildPlainTextEmailHtml converts newlines and escapes HTML', () => {
  const html = buildPlainTextEmailHtml('Line 1\n<script>x</script>');
  assert.match(html, /Line 1<br>&lt;script&gt;x&lt;\/script&gt;/);
});

test('mapAttachmentMeta returns empty for missing input', () => {
  assert.deepEqual(mapAttachmentMeta(null), []);
  assert.deepEqual(mapAttachmentMeta([]), []);
});

test('mapAttachmentMeta maps filename/contentType/size', () => {
  assert.deepEqual(
    mapAttachmentMeta([{ filename: 'a.pdf', contentType: 'application/pdf', size: 12 }]),
    [{ filename: 'a.pdf', contentType: 'application/pdf', size: 12 }]
  );
});

test('getSendCandidateEmailAttachments dedupes and caps files', () => {
  const buffer = Buffer.from('hello');
  const file = {
    originalname: 'a.pdf',
    buffer,
    mimetype: 'application/pdf',
    size: 5
  };
  const req = {
    files: {
      document: [file],
      attachment: [file],
      file: [{ ...file, originalname: 'b.pdf' }]
    }
  };
  const attachments = getSendCandidateEmailAttachments(req);
  assert.equal(attachments.length, 2);
  assert.equal(attachments[0].filename, 'a.pdf');
  assert.equal(attachments[1].filename, 'b.pdf');
});
