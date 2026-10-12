/**
 * Centralised Error Handler
 *
 * Catches all errors forwarded via next(err) and returns a consistent
 * JSON response. Multer-specific error codes are translated to friendly
 * messages and appropriate HTTP status codes.
 */

function errorHandler(err, _req, res, _next) {
  // Default values
  let status = err.status || 500;
  let message = err.message || 'An unexpected error occurred.';

  // ---- Multer errors ----
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'File is too large. Maximum allowed size is 5 MB.';
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    status = 400;
    message = 'Too many files. Maximum 10 files per upload.';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    status = 400;
    message =
      'Unexpected field name. Use "files" as the form-data field name.';
  } else if (err.code === 'UNSUPPORTED_FILE_TYPE') {
    status = 415;
    // message is already set by the fileFilter
  }

  // ---- MongoDB / GridFS errors ----
  if (err.name === 'MongoServerError' || err.name === 'MongoError') {
    status = 503;
    message = 'Database operation failed. Please try again later.';
  }

  // Never leak stack traces in production
  const isDev = process.env.NODE_ENV === 'development';

  console.error(`[error] ${status} – ${message}`);
  if (isDev && err.stack) {
    console.error(err.stack);
  }

  res.status(status).json({
    success: false,
    message,
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = errorHandler;
