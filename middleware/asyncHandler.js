/**
 * Async Handler Wrapper
 * Wraps async route handlers to automatically catch errors
 * and pass them to Express error middleware
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

