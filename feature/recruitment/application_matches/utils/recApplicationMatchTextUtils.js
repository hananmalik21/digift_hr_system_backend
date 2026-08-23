/**
 * Deterministic text similarity for application matching.
 * Jaro–Winkler returns 0–100 to align with Oracle UTL_MATCH.JARO_WINKLER_SIMILARITY.
 */

const TITLE_SYNONYM_GROUPS = [
  [
    'ai engineer',
    'artificial intelligence engineer',
    'generative ai engineer',
    'gen ai engineer',
    'gen-ai engineer',
    'genai engineer',
    'machine learning engineer',
    'ml engineer',
    'llm engineer',
    'nlp engineer',
    'deep learning engineer'
  ],
  ['software engineer', 'software developer', 'backend engineer', 'full stack engineer', 'fullstack engineer'],
  ['data scientist', 'applied scientist', 'research scientist'],
  ['data engineer', 'analytics engineer'],
  ['product manager', 'technical product manager'],
  ['ui ux designer', 'ux designer', 'ui designer', 'product designer']
];

const ROLE_CATEGORIES = [
  {
    code: 'AI_ML',
    keywords: [
      'ai',
      'artificial intelligence',
      'machine learning',
      'ml',
      'llm',
      'gen-ai',
      'genai',
      'generative',
      'nlp',
      'deep learning',
      'langchain',
      'rag'
    ]
  },
  {
    code: 'SOFTWARE',
    keywords: ['software', 'backend', 'frontend', 'full stack', 'fullstack', 'developer', 'programmer', 'sde']
  },
  { code: 'DATA', keywords: ['data scientist', 'data engineer', 'analytics', 'bi '] },
  { code: 'DESIGN', keywords: ['ui', 'ux', 'designer', 'design'] },
  { code: 'FINANCE', keywords: ['finance', 'accountant', 'accounting', 'controller', 'treasury', 'audit'] },
  { code: 'HR', keywords: ['human resources', 'hr ', 'recruiter', 'talent', 'people partner'] },
  { code: 'SALES', keywords: ['sales', 'account executive', 'business development', 'bdm'] },
  { code: 'MARKETING', keywords: ['marketing', 'brand', 'content', 'growth'] },
  { code: 'OPERATIONS', keywords: ['operations', 'supply chain', 'logistics'] },
  { code: 'MANAGEMENT', keywords: ['manager', 'director', 'head of', 'vp ', 'vice president'] }
];

export function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function roundScore(value) {
  return Math.round(clampScore(value));
}

export function round1(value) {
  return Math.round(clampScore(value) * 10) / 10;
}

export function strOrEmpty(v) {
  if (v == null) return '';
  return String(v).trim();
}

export function normalizeText(value) {
  return strOrEmpty(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value) {
  const n = normalizeText(value);
  return n ? n.split(' ').filter(Boolean) : [];
}

function jaroSimilarity(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (!len1 || !len2) return 0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches += 1;
      break;
    }
  }

  if (!matches) return 0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k += 1;
    if (s1[i] !== s2[k]) t += 1;
    k += 1;
  }

  const m = matches;
  return (m / len1 + m / len2 + (m - t / 2) / m) / 3;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} 0–100
 */
export function jaroWinklerSimilarity(a, b) {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);
  if (!s1 && !s2) return 100;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;

  const jaro = jaroSimilarity(s1, s2);
  let prefix = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  while (prefix < maxPrefix && s1[prefix] === s2[prefix]) prefix += 1;
  const jw = jaro + prefix * 0.1 * (1 - jaro);
  return Math.round(jw * 100);
}

export function tokenOverlapScore(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = new Set([...ta, ...tb]).size;
  return Math.round((inter / union) * 100);
}

export function containsNormalized(haystack, needle) {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!h || !n) return false;
  if (h.includes(n)) return true;
  const compactH = h.replace(/\s+/g, '');
  const compactN = n.replace(/\s+/g, '');
  return compactN.length >= 3 && compactH.includes(compactN);
}

export function skillNamesEquivalent(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.replace(/\s+/g, '') === nb.replace(/\s+/g, '')) return true;
  return jaroWinklerSimilarity(na, nb) >= 92;
}

export function titleSynonymBoost(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  for (const group of TITLE_SYNONYM_GROUPS) {
    const inA = group.some((g) => na.includes(g) || g.includes(na));
    const inB = group.some((g) => nb.includes(g) || g.includes(nb));
    if (inA && inB) return 94;
  }
  return 0;
}

export function inferRoleCategory(title) {
  const n = ` ${normalizeText(title)} `;
  if (!n.trim()) return null;
  for (const cat of ROLE_CATEGORIES) {
    if (cat.keywords.some((k) => n.includes(` ${k} `) || n.includes(k))) {
      return cat.code;
    }
  }
  return 'OTHER';
}

/**
 * Title similarity with role-category override so "Finance Manager" does not
 * look similar to "Gen-AI Engineer" just because both contain "engineer"-adjacent tokens.
 */
export function titleSimilarityScore(candidateTitle, requisitionTitle) {
  const cand = strOrEmpty(candidateTitle);
  const req = strOrEmpty(requisitionTitle);
  if (!cand || !req) return null;

  const jw = jaroWinklerSimilarity(cand, req);
  const overlap = tokenOverlapScore(cand, req);
  const synonym = titleSynonymBoost(cand, req);
  let score = Math.max(jw, overlap, synonym);

  const catA = inferRoleCategory(cand);
  const catB = inferRoleCategory(req);
  if (catA && catB && catA !== 'OTHER' && catB !== 'OTHER' && catA !== catB) {
    score = Math.min(score, 38);
  } else if (catA && catB && catA === catB && catA !== 'OTHER') {
    score = Math.max(score, 78);
  }

  return clampScore(score);
}

export function splitCertList(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => strOrEmpty(s)).filter(Boolean);
  }
  return String(raw)
    .split(/[,;\n|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseYearBandFromText(text) {
  const s = strOrEmpty(text);
  if (!s) return null;
  const plus = s.match(/(\d+)\s*\+\s*(?:years?)?/i);
  if (plus) {
    const min = Number(plus[1]);
    return { min, max: null, label: `${min}+ years` };
  }
  const range = s.match(/(\d+)\s*[-–—to]+\s*(\d+)/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return { min, max, label: `${min}–${max} years` };
  }
  return null;
}

export function parseYearBandFromCode(code) {
  const key = strOrEmpty(code).toUpperCase().replace(/[\s-]+/g, '_');
  if (!key) return null;
  const plus = key.match(/_(\d+)_PLUS$/);
  if (plus) {
    const min = Number(plus[1]);
    return { min, max: null, label: `${min}+ years` };
  }
  const range = key.match(/_(\d+)_(\d+)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return { min, max, label: `${min}–${max} years` };
  }
  return null;
}

export function yearsBetween(startDate, endDate, currentJobFlag) {
  const start = startDate ? new Date(startDate) : null;
  if (!start || !Number.isFinite(start.getTime())) return null;
  const end =
    currentJobFlag === 'Y' || currentJobFlag === true || !endDate
      ? new Date()
      : new Date(endDate);
  if (!Number.isFinite(end.getTime()) || end <= start) return 0;
  return Math.round(((end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
}

export function addDaysIso(fromDate, days) {
  const base = fromDate instanceof Date ? fromDate : new Date();
  if (!Number.isFinite(base.getTime())) return null;
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function parseNoticePeriodDays(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/immediate|serving|available/.test(s) && !/\d/.test(s)) return 0;
  const months = s.match(/(\d+)\s*month/);
  if (months) return Number(months[1]) * 30;
  const weeks = s.match(/(\d+)\s*week/);
  if (weeks) return Number(weeks[1]) * 7;
  const days = s.match(/(\d+)/);
  if (days) return Number(days[1]);
  return null;
}
