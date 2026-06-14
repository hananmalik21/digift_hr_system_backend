import PositionsModel from '../model/positions_model.js';

const POSITIONS_BY_ORG_UNIT_BASE_SQL = `
FROM ENT.V_POSITIONS_BY_ORG_UNIT
WHERE tenant_id = :tenant_id
  AND org_unit_id = HEXTORAW(:org_unit_id)
`;

const POSITIONS_BY_ORG_UNIT_COUNT_SQL = `
SELECT COUNT(*) AS TOTAL
${POSITIONS_BY_ORG_UNIT_BASE_SQL}
`;

const POSITIONS_BY_ORG_UNIT_DATA_SQL = `
SELECT *
${POSITIONS_BY_ORG_UNIT_BASE_SQL}
ORDER BY position_title_en
OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY
`;

/**
 * Fetch active positions for an organization unit within a tenant.
 *
 * @param {{ tenantId: number, orgUnitIdHex: string, page?: number, pageSize?: number }} input
 * @returns {Promise<{ positions: object[], total: number }>}
 */
export async function fetchPositionsByOrgUnit({ tenantId, orgUnitIdHex, page = 1, pageSize = 10 }) {
  const binds = { tenant_id: tenantId, org_unit_id: orgUnitIdHex };
  const offset = (page - 1) * pageSize;

  const [countResult, dataResult] = await Promise.all([
    PositionsModel.executeQuery(POSITIONS_BY_ORG_UNIT_COUNT_SQL, binds),
    PositionsModel.executeQuery(POSITIONS_BY_ORG_UNIT_DATA_SQL, {
      ...binds,
      offset,
      page_size: pageSize,
    }),
  ]);

  const total = Number(countResult?.rows?.[0]?.total ?? 0);

  return {
    positions: dataResult?.rows ?? [],
    total,
  };
}
