/**
 * String Utilities - Helper functions for string and object transformations
 */

/**
 * Convert object keys from uppercase to lowercase
 * Handles nested objects and arrays recursively
 * @param {*} obj - Object, array, or primitive value to transform
 * @returns {*} - Transformed object with lowercase keys
 */
export function toLowerCaseKeys(obj) {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => toLowerCaseKeys(item));
  }

  // Handle primitive types (string, number, boolean, etc.)
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj;
  }

  // Handle objects
  const transformed = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const lowerKey = key.toLowerCase();
      transformed[lowerKey] = toLowerCaseKeys(obj[key]);
    }
  }
  return transformed;
}

/**
 * Generate page numbers array for pagination display
 * Shows page numbers with ellipsis for large page counts
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {number} maxPages - Maximum number of page numbers to show (default: 7)
 * @returns {Array} - Array of page numbers and ellipsis strings
 */
export function generatePageNumbers(currentPage, totalPages, maxPages = 7) {
  if (totalPages <= maxPages) {
    // If total pages is less than max, show all pages
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = [];
  const halfMax = Math.floor(maxPages / 2);

  // Always show first page
  pages.push(1);

  if (currentPage <= halfMax + 1) {
    // Near the beginning: show [1, 2, 3, 4, 5, ..., totalPages]
    for (let i = 2; i <= maxPages - 1; i++) {
      pages.push(i);
    }
    pages.push('...');
    pages.push(totalPages);
  } else if (currentPage >= totalPages - halfMax) {
    // Near the end: show [1, ..., totalPages-4, totalPages-3, totalPages-2, totalPages-1, totalPages]
    pages.push('...');
    for (let i = totalPages - (maxPages - 2); i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // In the middle: show [1, ..., current-1, current, current+1, ..., totalPages]
    pages.push('...');
    for (let i = currentPage - 1; i <= currentPage + 1; i++) {
      pages.push(i);
    }
    pages.push('...');
    pages.push(totalPages);
  }

  return pages;
}

