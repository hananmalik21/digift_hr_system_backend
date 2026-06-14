import { validateGetPositionsByOrgUnit } from '../validators/positionValidator.js';
import { fetchPositionsByOrgUnit } from '../service/positionService.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  sendPositionsByOrgUnitList,
  sendBadRequest,
  sendForbidden,
} from '../view/position_view.js';

/** Map shared pagination meta to snake_case for API responses. */
function toSnakePagination(p) {
  return {
    page: p.page,
    page_size: p.pageSize,
    total_pages: p.totalPages,
    has_next: p.hasNext,
    has_previous: p.hasPrevious,
  };
}

/** GET /api/positions/by-org-unit — tenant_id, org_unit_id (required); page, page_size (optional). */
export async function getPositionsByOrgUnit(req, res) {
  const validation = validateGetPositionsByOrgUnit(req);
  if (!validation.ok) {
    if (validation.statusCode === 403) {
      return sendForbidden(res, validation.message);
    }
    return sendBadRequest(res, req, validation.message);
  }

  const { positions, total } = await fetchPositionsByOrgUnit({
    tenantId: validation.tenantId,
    orgUnitIdHex: validation.orgUnitIdHex,
    page: validation.page,
    pageSize: validation.pageSize,
  });

  const pagination = toSnakePagination(
    buildPaginationMeta(validation.page, validation.pageSize, total)
  );

  return sendPositionsByOrgUnitList(res, positions, pagination);
}
