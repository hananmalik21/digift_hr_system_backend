import { HTTP_OK, LIST_SUCCESS_MESSAGE } from '../constants/payEmployeeBalanceInquiry.constants.js';
import { getEmployeeBalanceInquiry as getEmployeeBalanceInquiryFromModel } from '../model/payEmployeeBalanceInquiryModel.js';

function buildPagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) || 0 : 0
  };
}

/**
 * @param {Record<string, unknown>} filters
 */
export async function getEmployeeBalanceInquiry(filters) {
  const { data, total } = await getEmployeeBalanceInquiryFromModel(filters);
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: LIST_SUCCESS_MESSAGE,
    data,
    pagination: buildPagination(filters.page, filters.limit, total)
  };
}
