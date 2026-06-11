import {
  formatDateOnly,
  safeFiniteNumber,
  strOrNull
} from '../../feature/recruitment/job_offers/utils/recJobOfferRowUtils.js';

export function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  if (!Number.isFinite(d.getTime())) return escapeHtml(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatIsoDate(dateStr) {
  if (!dateStr) return 'N/A';
  return formatDateOnly(dateStr) || dateStr;
}

export function formatCurrency(amount, currency = 'USD') {
  if (amount == null || !Number.isFinite(amount)) return 'N/A';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-US')}`;
  }
}

export function getFirstName(name) {
  if (!name) return 'Candidate';
  return name.trim().split(/\s+/)[0] || 'Candidate';
}

export function getGradeLabel(gradeObj) {
  if (!gradeObj || typeof gradeObj !== 'object') return 'N/A';
  return (
    strOrNull(gradeObj.grade_name) ||
    strOrNull(gradeObj.grade_category) ||
    (gradeObj.grade_number != null ? `L${gradeObj.grade_number}` : null) ||
    'N/A'
  );
}

export function getDepartmentName(departmentObj) {
  if (!departmentObj || typeof departmentObj !== 'object') return 'N/A';
  return (
    strOrNull(departmentObj.org_unit_name) ||
    strOrNull(departmentObj.department_name) ||
    'N/A'
  );
}

export function getPositionTitle(positionObj, jobTitle) {
  if (positionObj && typeof positionObj === 'object') {
    const name = strOrNull(positionObj.position_name);
    if (name) return name;
  }
  return jobTitle || 'N/A';
}

export function getPrimarySalaryComponent(components) {
  if (!Array.isArray(components) || components.length === 0) return null;
  return components[0];
}

export function findComponentValue(components, pattern) {
  if (!Array.isArray(components)) return null;
  const match = components.find((c) => {
    const id = String(c?.component_id ?? '').toLowerCase();
    const freq = String(c?.frequency_code ?? '').toLowerCase();
    return pattern.test(id) || pattern.test(freq);
  });
  return match?.amount != null ? safeFiniteNumber(match.amount) : null;
}

export function buildEmploymentTermsParagraph(terms, enterpriseName) {
  const contingencies = [];
  if (terms.background_check_required === 'Y') {
    contingencies.push('successful completion of a background check');
  }
  if (terms.drug_test_required === 'Y') {
    contingencies.push('a drug test');
  }
  if (terms.nda_required === 'Y') {
    contingencies.push('execution of a non-disclosure agreement');
  }

  const parts = [
    contingencies.length
      ? `This offer is contingent upon ${contingencies.join(', ').replace(/, ([^,]*)$/, ', and $1')} and verification of your eligibility to work in the United States.`
      : 'This offer is contingent upon successful completion of a background check and verification of your eligibility to work in the United States.',
    `Your employment with ${enterpriseName} will be at-will, meaning that either you or the company may terminate the employment relationship at any time, with or without cause or notice.`
  ];

  const additionalTerms = strOrNull(terms.additional_terms);
  if (additionalTerms) parts.push(additionalTerms);

  return parts.join(' ');
}

export function resolveSigningBonus(terms, components, currency) {
  if (terms.signing_bonus != null) {
    return formatCurrency(safeFiniteNumber(terms.signing_bonus), currency);
  }
  const signingAmount = findComponentValue(components, /sign/i);
  return signingAmount != null ? formatCurrency(signingAmount, currency) : 'N/A';
}

export function resolveRelocationAssistance(terms) {
  if (terms.relocation_assistance != null) return String(terms.relocation_assistance);
  if (terms.relocation != null) return String(terms.relocation);
  return 'N/A';
}
