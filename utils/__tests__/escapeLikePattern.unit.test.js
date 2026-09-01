import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeLikePattern } from '@digifyhr/common';

test('escapeLikePattern escapes Oracle LIKE wildcards and backslash', () => {
  assert.equal(escapeLikePattern('a%b_c\\d'), 'a\\%b\\_c\\\\d');
});

test('escapeLikePattern treats nullish as empty string', () => {
  assert.equal(escapeLikePattern(null), '');
  assert.equal(escapeLikePattern(undefined), '');
});
