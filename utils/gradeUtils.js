/**
 * Grade number format: prefix (family) + numeric rank, e.g. P1, P2, SM2, EX1.
 * Utilities for parsing, comparing, and validating grade numbers against GRADE_CATEGORY.
 * Used by: grades controller (category vs number validation), job_levels model (min/max range),
 * and ENT.TRG_JOB_LEVEL_GRADE_RANGE trigger (same logic in PL/SQL).
 * GRADE_CATEGORY validation uses a dynamic map (e.g. from ENT_LOOKUP_VALUES) when provided.
 */

/**
 * Build format regex for a prefix: ^P[0-9]+$, ^EX[0-9]+$, etc.
 */
function getFormatRegexForPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') return null;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}[0-9]+$`);
}

/**
 * Extract family prefix from grade number (e.g. "P3" → "P", "SM2" → "SM").
 * @param {string} gradeNumber - e.g. "P3", "SM2", "EX1"
 * @returns {string} Uppercase prefix or empty string
 */
export function extractPrefix(gradeNumber) {
  if (gradeNumber == null || typeof gradeNumber !== 'string') return '';
  const m = String(gradeNumber).trim().match(/^[A-Z]+/i);
  return m ? m[0].toUpperCase() : '';
}

/**
 * Extract numeric rank from grade number (e.g. "P3" → 3, "SM2" → 2).
 * @param {string} gradeNumber - e.g. "P3", "SM2"
 * @returns {number} Rank as number, or 0 if not found
 */
export function extractRank(gradeNumber) {
  if (gradeNumber == null || typeof gradeNumber !== 'string') return 0;
  const m = String(gradeNumber).trim().match(/[0-9]+$/);
  return m ? parseInt(m[0], 10) : 0;
}

/**
 * Map GRADE_CATEGORY to expected prefix.
 * Uses dynamic categoryToPrefixMap when provided (e.g. from ENT_LOOKUP_VALUES); otherwise
 * treats a short (1–3 char) uppercase category as the prefix so codes like "P", "EX" work.
 * @param {string} gradeCategory - e.g. "PROFESSIONAL", "P", "MANAGEMENT"
 * @param {Object.<string, string>|null|undefined} [categoryToPrefixMap] - optional map from category/code to prefix (from lookup). When omitted, short uppercase category is used as prefix.
 * @returns {string} Expected prefix e.g. "P", "M", or empty if unknown
 */
export function mapCategoryToPrefix(gradeCategory, categoryToPrefixMap = null) {
  if (gradeCategory == null || typeof gradeCategory !== 'string') return '';
  const key = String(gradeCategory).trim().toUpperCase();
  if (key === '') return '';
  if (categoryToPrefixMap && typeof categoryToPrefixMap === 'object') {
    const prefix = categoryToPrefixMap[key];
    if (prefix != null && String(prefix).trim() !== '') return String(prefix).trim().toUpperCase();
    return '';
  }
  if (key.length <= 3 && /^[A-Z]+$/.test(key)) return key;
  return '';
}

/**
 * Compare two grade numbers by family and rank.
 * @param {string} g1 - Grade number e.g. "P2"
 * @param {string} g2 - Grade number e.g. "P4"
 * @returns {'NOT_COMPARABLE'|'GREATER'|'LESS'|'EQUAL'}
 */
export function compareGrades(g1, g2) {
  const prefix1 = extractPrefix(g1);
  const prefix2 = extractPrefix(g2);
  if (prefix1 !== prefix2) return 'NOT_COMPARABLE';

  const rank1 = extractRank(g1);
  const rank2 = extractRank(g2);
  if (rank1 > rank2) return 'GREATER';
  if (rank1 < rank2) return 'LESS';
  return 'EQUAL';
}

/**
 * Validate that grade_number belongs to the given grade_category (prefix match + format).
 * Uses dynamic categoryToPrefixMap when provided (e.g. from ENT_LOOKUP_VALUES); when omitted,
 * accepts any short (1–3 char) uppercase category as the prefix.
 * @param {string} gradeNumber - e.g. "P3"
 * @param {string} gradeCategory - e.g. "PROFESSIONAL", "P"
 * @param {Object.<string, string>|null|undefined} [categoryToPrefixMap] - optional map from category/code to prefix (from lookup). When omitted, short uppercase category is used as prefix.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateGradeNumberForCategory(gradeNumber, gradeCategory, categoryToPrefixMap = null) {
  const num = (gradeNumber ?? '').toString().trim();
  const cat = (gradeCategory ?? '').toString().trim().toUpperCase();

  if (!num) return { valid: false, error: 'GRADE_NUMBER is required' };
  if (!cat) return { valid: false, error: 'GRADE_CATEGORY is required' };

  const expectedPrefix = mapCategoryToPrefix(cat, categoryToPrefixMap);
  if (!expectedPrefix) {
    return { valid: false, error: `Unknown GRADE_CATEGORY: ${gradeCategory}` };
  }

  const actualPrefix = extractPrefix(num);
  if (actualPrefix !== expectedPrefix) {
    return {
      valid: false,
      error: 'GRADE_NUMBER does not belong to selected GRADE_CATEGORY'
    };
  }

  const regex = getFormatRegexForPrefix(expectedPrefix);
  if (regex && !regex.test(num)) {
    return {
      valid: false,
      error: 'GRADE_NUMBER does not belong to selected GRADE_CATEGORY'
    };
  }

  return { valid: true };
}

/**
 * Validate min and max grade range: same family, max rank >= min rank.
 * @param {string} minGradeNumber - e.g. "P2"
 * @param {string} maxGradeNumber - e.g. "P5"
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateMinMaxGradeRange(minGradeNumber, maxGradeNumber) {
  const minP = extractPrefix(minGradeNumber);
  const maxP = extractPrefix(maxGradeNumber);

  if (minP !== maxP) {
    return {
      valid: false,
      error: 'Min Grade and Max Grade must belong to same grade family'
    };
  }

  const minRank = extractRank(minGradeNumber);
  const maxRank = extractRank(maxGradeNumber);
  if (maxRank < minRank) {
    return {
      valid: false,
      error: 'Max Grade must be greater than or equal to Min Grade'
    };
  }

  return { valid: true };
}

/**
 * Filter grades to allowed max-grade options for a given min grade (same family, rank >= min rank).
 * @param {string} minGradeNumber - e.g. "P2"
 * @param {Array<{ grade_number?: string, grade_id?: number }>} grades - List of grades
 * @returns {Array} Sorted by rank ascending
 */
export function getAllowedMaxGrades(minGradeNumber, grades) {
  const prefix = extractPrefix(minGradeNumber);
  const minRank = extractRank(minGradeNumber);
  if (!prefix || !Array.isArray(grades)) return [];

  return grades
    .filter((g) => {
      const gn = g?.grade_number ?? g?.GRADE_NUMBER ?? '';
      return extractPrefix(gn) === prefix && extractRank(gn) >= minRank;
    })
    .sort((a, b) => {
      const ra = extractRank(a?.grade_number ?? a?.GRADE_NUMBER);
      const rb = extractRank(b?.grade_number ?? b?.GRADE_NUMBER);
      return ra - rb;
    });
}
