import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '@digifyhr/common';

test('escapeHtml escapes markup characters', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('escapeHtml treats nullish as empty string', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
