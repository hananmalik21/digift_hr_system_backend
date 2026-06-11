export const LOG_TAG = 'jobOfferPdf';

export const PDF_ERROR_MESSAGE = 'Unable to generate offer letter PDF. Please try again.';

export const DEFAULT_COMPANY_NAME = 'Company';

export const COMPANY_CONTACT = {
  address: '123 Business Street, San Francisco, CA 94105',
  email: 'hr@digify.com'
};

export const COMPENSATION_BENEFITS_BULLETS = [
  'Competitive annual salary as stated above, paid bi-weekly',
  'Performance-based annual bonus (target: 10-15% of base salary)',
  'Comprehensive health insurance (Medical, Dental, Vision)',
  '401(k) retirement plan with 6% company match',
  '15 days paid time off (PTO) in the first year',
  '10 paid holidays per year',
  'Professional development and training opportunities',
  'Remote work flexibility'
];

export const PDF_OPTIONS = {
  format: 'A4',
  printBackground: true,
  margin: {
    top: '14mm',
    right: '14mm',
    bottom: '14mm',
    left: '14mm'
  }
};

export const PUPPETEER_LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

/** @param {string} viewName */
export function buildOfferByGuidSql(viewName) {
  return `SELECT v.*, e.ENTERPRISE_NAME
    FROM ${viewName} v
    INNER JOIN REC.REC_JOB_OFFERS o ON o.OFFER_ID = v.OFFER_ID
    LEFT JOIN ENT.ENTERPRISES e ON e.ENTERPRISE_ID = v.ENTERPRISE_ID
    WHERE RAWTOHEX(o.OFFER_GUID) = :offerGuid`;
}
