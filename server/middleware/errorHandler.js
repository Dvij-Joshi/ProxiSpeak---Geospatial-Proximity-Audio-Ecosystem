/**
 * Global error handling middleware for Express.
 * Must be registered AFTER all routes in index.js.
 *
 * Usage in index.js:
 *   import { errorHandler, notFound } from './middleware/errorHandler.js';
 *   app.use(notFound);
 *   app.use(errorHandler);
 */

/**
 * 404 handler — catches requests that didn't match any route.
 */
export const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Central error handler — formats all errors as consistent JSON responses.
 */
export const errorHandler = (err, req, res, _next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${statusCode}] ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: err.name || 'INTERNAL_ERROR',
    message: err.message,
    // Only include stack trace in development
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};
