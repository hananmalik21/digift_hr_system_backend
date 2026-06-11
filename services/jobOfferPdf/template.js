import { strOrNull, formatDateOnly } from '../../feature/recruitment/job_offers/utils/recJobOfferRowUtils.js';
import {
  COMPANY_CONTACT,
  COMPENSATION_BENEFITS_BULLETS,
  DEFAULT_COMPANY_NAME
} from './constants.js';
import {
  buildEmploymentTermsParagraph,
  escapeHtml,
  formatCurrency,
  formatDisplayDate,
  formatIsoDate,
  getDepartmentName,
  getFirstName,
  getGradeLabel,
  getPositionTitle,
  getPrimarySalaryComponent,
  resolveRelocationAssistance,
  resolveSigningBonus
} from './formatters.js';

/** @typedef {import('./types.js').NormalizedJobOffer} NormalizedJobOffer */
/** @typedef {import('./types.js').OfferLetterTemplateData} OfferLetterTemplateData */

const OFFER_LETTER_STYLES = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      color: #364153;
      background: #ffffff;
      line-height: 24px;
      letter-spacing: -0.32px;
    }
    .page { background: #ffffff; width: 100%; }
    .content { padding: 0; }
    .header { text-align: center; margin-bottom: 12px; }
    .company-name {
      font-size: 30px;
      font-weight: 700;
      color: #101828;
      line-height: 36px;
      letter-spacing: 0.42px;
    }
    .company-meta {
      font-size: 16px;
      color: #4a5565;
      line-height: 24px;
      margin-top: 8px;
    }
    .offer-date { color: #4a5565; font-size: 16px; margin-bottom: 12px; }
    .candidate-block { margin-bottom: 12px; }
    .candidate-name { font-weight: 600; color: #101828; font-size: 16px; }
    .candidate-line { color: #4a5565; font-size: 16px; }
    .subject {
      font-weight: 600;
      color: #101828;
      font-size: 16px;
      margin-bottom: 16px;
    }
    .offer-core {
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
      margin-bottom: 20px;
    }
    .intro-block {
      margin-bottom: 20px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .intro-block p {
      color: #364153;
      font-size: 16px;
      line-height: 24px;
      margin-bottom: 12px;
    }
    .intro-block p:last-child { margin-bottom: 0; }
    .intro-block strong { color: #101828; font-weight: 700; }
    .body-section { margin-bottom: 16px; }
    .body-text { color: #364153; font-size: 16px; }
    .details-wrapper {
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
      margin-bottom: 0;
    }
    table.details {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      margin-bottom: 0;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    table.details tbody,
    table.details tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    table.details tr { border-bottom: 1px solid #e5e7eb; }
    table.details tr.last-row { border-bottom: none; }
    table.details td {
      padding: 12px 20px;
      vertical-align: middle;
      font-size: 15px;
      line-height: 22px;
    }
    table.details td.label {
      width: 33%;
      background: #f9fafb;
      color: #101828;
      font-weight: 600;
    }
    table.details td.value { width: 67%; color: #364153; font-weight: 400; }
    table.details td.value-highlight {
      font-weight: 600;
      font-size: 18px;
      line-height: 28px;
      letter-spacing: -0.45px;
    }
    .section { margin-bottom: 18px; }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #101828;
      line-height: 27px;
      letter-spacing: -0.45px;
      margin-bottom: 12px;
    }
    .section-body { color: #364153; font-size: 16px; }
    ul.bullets {
      list-style: disc;
      margin: 0;
      padding: 8px 0 0 16px;
    }
    ul.bullets li {
      margin-bottom: 8px;
      font-size: 16px;
      line-height: 24px;
      color: #364153;
    }
    ul.bullets li:last-child { margin-bottom: 0; }
    .sincerely-block { margin-bottom: 24px; }
    .sincerely-block .manager-name {
      font-weight: 600;
      color: #101828;
      font-size: 16px;
    }
    .sincerely-block .manager-meta { color: #4a5565; font-size: 16px; }
    .sincerely-spacer { height: 24px; }
    .acceptance-section {
      border-top: 1px solid #d1d5dc;
      padding-top: 24px;
      margin-top: 0;
      page-break-inside: avoid;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 24px;
    }
    .signature-field { padding-top: 8px; }
    .signature-line {
      border-bottom: 2px solid #101828;
      height: 48px;
      margin-bottom: 8px;
    }
    .signature-label {
      font-size: 14px;
      color: #4a5565;
      line-height: 20px;
      letter-spacing: -0.154px;
    }`;

/**
 * @param {NormalizedJobOffer} offer
 * @returns {OfferLetterTemplateData}
 */
function buildTemplateData(offer) {
  const companyName = offer.enterprise_name || DEFAULT_COMPANY_NAME;
  const candidate = offer.candidate_obj || {};
  const posting = offer.posting_obj || {};
  const terms = offer.terms_json || {};
  const components = offer.components_json || [];
  const primaryComponent = getPrimarySalaryComponent(components);
  const currency = strOrNull(primaryComponent?.currency_code) || 'USD';

  const candidateName = strOrNull(candidate.candidate_name) || 'Candidate';
  const postingTitle = strOrNull(posting.posting_title) || offer.posting_title;
  const jobTitle = postingTitle || offer.job_title || 'the position';

  const offerExpiry = offer.expiry_date || formatDateOnly(terms.offer_expiry_date) || null;

  const detailsRows = [
    ['Position Title', getPositionTitle(offer.position_obj, offer.job_title), false],
    ['Department', getDepartmentName(offer.department_obj), false],
    ['Grade/Level', getGradeLabel(offer.grade_obj), false],
    ['Employment Type', offer.employment_type_code || 'N/A', false],
    ['Work Location', offer.location || 'N/A', false],
    ['Start Date', formatIsoDate(offer.start_date), false],
    ['Annual Salary', formatCurrency(offer.annual_salary, currency), true],
    ['Signing Bonus', resolveSigningBonus(terms, components, currency), false],
    ['Relocation Assistance', resolveRelocationAssistance(terms), false],
    ['Probation Period', strOrNull(terms.probation_period) || 'N/A', false]
  ];

  return {
    companyName,
    candidateName,
    candidateAddressLine: strOrNull(candidate.address) || strOrNull(candidate.mailing_address),
    candidateCityLine: strOrNull(candidate.city_state_zip) || strOrNull(candidate.city),
    jobTitle,
    offerExpiry,
    employmentTermsText: buildEmploymentTermsParagraph(terms, companyName),
    hiringManagerName: offer.created_by || '[Hiring Manager Name]',
    detailsRows,
    benefitBullets: COMPENSATION_BENEFITS_BULLETS,
    offerNumber: offer.offer_number || '',
    offerDate: offer.offer_date
  };
}

function renderDetailsTable(detailsRows) {
  return detailsRows
    .map(
      ([label, value, highlight], index) => `
      <tr class="${index === detailsRows.length - 1 ? 'last-row' : ''}">
        <td class="label">${escapeHtml(label)}</td>
        <td class="value${highlight ? ' value-highlight' : ''}">${escapeHtml(String(value))}</td>
      </tr>`
    )
    .join('');
}

function renderBulletList(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

/**
 * @param {NormalizedJobOffer} offer
 */
export function generateOfferLetterHtml(offer) {
  const data = buildTemplateData(offer);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Offer Letter — ${escapeHtml(data.offerNumber)}</title>
  <style>${OFFER_LETTER_STYLES}</style>
</head>
<body>
  <div class="page">
    <div class="content">
      <div class="header">
        <div class="company-name">${escapeHtml(data.companyName)}</div>
        <div class="company-meta">${escapeHtml(COMPANY_CONTACT.address)}</div>
        <div class="company-meta">${escapeHtml(COMPANY_CONTACT.email)}</div>
      </div>

      <div class="offer-date">${formatDisplayDate(data.offerDate)}</div>

      <div class="candidate-block">
        <div class="candidate-name">${escapeHtml(data.candidateName)}</div>
        ${data.candidateAddressLine ? `<div class="candidate-line">${escapeHtml(data.candidateAddressLine)}</div>` : ''}
        ${data.candidateCityLine ? `<div class="candidate-line">${escapeHtml(data.candidateCityLine)}</div>` : ''}
      </div>

      <div class="subject">Re: Offer of Employment - ${escapeHtml(data.jobTitle)}</div>

      <div class="offer-core">
        <div class="intro-block">
          <p>Dear ${escapeHtml(getFirstName(data.candidateName))},</p>
          <p>
            We are pleased to offer you the position of
            <strong>${escapeHtml(data.jobTitle)}</strong>
            with ${escapeHtml(data.companyName)}. We believe that your skills
            and experience will be a valuable asset to our team, and we are excited about the prospect of you joining our
            organization.
          </p>
        </div>

        <div class="details-wrapper">
          <table class="details">
            <tbody>${renderDetailsTable(data.detailsRows)}</tbody>
          </table>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Compensation &amp; Benefits</div>
        <ul class="bullets">${renderBulletList(data.benefitBullets)}</ul>
      </div>

      <div class="section">
        <div class="section-title">Employment Terms</div>
        <p class="section-body">${escapeHtml(data.employmentTermsText)}</p>
      </div>

      <div class="section">
        <div class="section-title">Acceptance</div>
        <p class="section-body">
          This offer will remain open until ${formatDisplayDate(data.offerExpiry)}. To accept this offer, please sign and return this letter by the
          specified date. If you have any questions regarding this offer, please do not hesitate to contact us.
        </p>
      </div>

      <div class="body-section body-text">
        <p>We are thrilled at the possibility of you joining our team and look forward to your positive response.</p>
      </div>

      <div class="sincerely-block">
        <p class="body-text">Sincerely,</p>
        <div class="sincerely-spacer"></div>
        <div class="manager-name">${escapeHtml(data.hiringManagerName)}</div>
        <div class="manager-meta">${escapeHtml(data.companyName)}</div>
      </div>

      <div class="acceptance-section">
        <div class="section-title">Acceptance of Offer</div>
        <p class="section-body">
          I, ${escapeHtml(data.candidateName)}, accept the above offer of employment with ${escapeHtml(data.companyName)} under the terms and conditions
          outlined in this letter.
        </p>
        <div class="signature-grid">
          <div class="signature-field">
            <div class="signature-line"></div>
            <div class="signature-label">Candidate Signature</div>
          </div>
          <div class="signature-field">
            <div class="signature-line"></div>
            <div class="signature-label">Date</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
