import express from 'express';
import TimeZoneModel from '../model/timeZoneModel.js';
import { sendList } from '../../../../utils/response.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * GET /api/time-zones
 * List ENT.TIME_ZONES with pagination and optional filter by name (TZ_NAME).
 *
 * @query  name      - Filter by time zone name (partial, case-insensitive match on TZ_NAME)
 * @query  page      - Page number (default: 1)
 * @query  page_size - Items per page (default: 10, max: 100)
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {};
  const appliedFilters = {};

  if (req.query.name != null && String(req.query.name).trim() !== '') {
    filters.name = String(req.query.name).trim();
    appliedFilters.name = filters.name;
  }

  let page = 1;
  let pageSize = 10;

  if (req.query.page !== undefined) {
    const p = parseInt(req.query.page, 10);
    if (Number.isNaN(p) || p < 1) {
      throw new ValidationError('Invalid page number. Must be a positive integer.');
    }
    page = p;
  }

  if (req.query.page_size !== undefined || req.query.limit !== undefined) {
    const ps = parseInt(req.query.page_size || req.query.limit, 10);
    if (Number.isNaN(ps) || ps < 1) {
      throw new ValidationError('Invalid page_size. Must be a positive integer.');
    }
    pageSize = Math.min(100, ps);
  }

  filters.pagination = { page, pageSize };

  const result = await TimeZoneModel.findAll(filters);
  const rows = result.rows || [];
  const totalCount = result.total ?? rows.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;

  sendList(res, {
    message: 'Time zones fetched successfully',
    data: rows,
    meta: {
      ...(Object.keys(appliedFilters).length > 0 && { filters: appliedFilters }),
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages,
        hasNext,
        hasPrevious
      }
    }
  });
}));

export default router;
