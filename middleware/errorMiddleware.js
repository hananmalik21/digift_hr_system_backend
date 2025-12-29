import { sendErrorResponse } from '../utils/errors/errorHandler.js';
import { NotFoundError } from '../utils/errors/index.js';

/**
 * Express Error Middleware
 * Catches all errors and formats them consistently
 * Must be added after all routes in app
 */
export const errorMiddleware = (err, req, res, next) => {
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Send formatted error response
  sendErrorResponse(err, req, res);
};

/**
 * 404 Not Found Handler
 * Catches requests to non-existent routes
 */
export const notFoundHandler = (req, res) => {
  const notFoundError = new NotFoundError(
    `Endpoint not found: ${req.method} ${req.path}`
  );
  sendErrorResponse(notFoundError, req, res);
};

