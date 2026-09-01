import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination, DEFAULT_MAX_PAGE_SIZE } from '@digifyhr/common';

const LOOKUP_PAGE_OPTS = { maxPageSize: 1000 };

test('parsePagination defaults to page 1 and page_size 10', () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 10 });
});

test('parsePagination caps page_size at 100 by default', () => {
  assert.deepEqual(parsePagination({ page_size: '1000' }), {
    page: 1,
    pageSize: DEFAULT_MAX_PAGE_SIZE
  });
});

test('parsePagination allows lookup lists up to 1000', () => {
  assert.deepEqual(parsePagination({ page_size: '1000' }, LOOKUP_PAGE_OPTS), {
    page: 1,
    pageSize: 1000
  });
});

test('parsePagination rejects invalid page_size', () => {
  assert.throws(() => parsePagination({ page_size: '0' }), /Invalid page_size/);
});
