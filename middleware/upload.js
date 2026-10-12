/**
 * Multer Upload Middleware
 *
 * Uses memory storage as a temporary bridge before streaming to GridFS.
 * Trade-off: the file lives in RAM briefly, but this keeps Multer simple
 * and avoids writing to disk. The MAX_FILE_SIZE limit keeps memory use bounded.
 *
 * File-signature (magic-byte) validation is performed for the supported types
 * so we don't rely solely on the client-supplied MIME type or extension.
 */

const multer = require('multer');
const path = require('path');

// ---------------------------------------------------------------------------
// Allowed types — extension ↔ MIME mapping
// ---------------------------------------------------------------------------
const ALLOWED_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

// Flat set of accepted MIME types (for quick lookup)
const ALLOWED_MIMES = new Set(Object.values(ALLOWED_TYPES));

// ---------------------------------------------------------------------------
// Magic-byte signatures for supported binary formats
// ---------------------------------------------------------------------------
const MAGIC_BYTES = {
  'application/pdf': { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },       // %PDF
  'image/png':       { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },       // .PNG
  'image/jpeg':      { offset: 0, bytes: [0xff, 0xd8, 0xff] },             // JFIF / EXIF
  'image/gif':       { offset: 0, bytes: [0x47, 0x49, 0x46] },             // GIF
  'image/webp':      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },       // WEBP (at offset 8)
};

/**
 * Inspect the first bytes of a buffer and return true when they match the
 * expected magic bytes for the given MIME type. For types without a known
 * signature (e.g. text/plain, SVG) we fall back to extension + mime check only.
 */
function validateMagicBytes(buffer, mime) {
  const sig = MAGIC_BYTES[mime];
  if (!sig) return true; // no signature to check — accept based on extension + mime

  if (buffer.length < sig.offset + sig.bytes.length) return false;

  return sig.bytes.every((b, i) => buffer[sig.offset + i] === b);
}

// ---------------------------------------------------------------------------
// Multer configuration
// ---------------------------------------------------------------------------
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024;

const storage = multer.memoryStorage();

/**
 * fileFilter — runs *before* the full file is buffered. We validate the
 * extension and declared MIME type here. Magic-byte validation happens in the
 * controller after the buffer is available.
 */
function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  // 1. Extension must be in allowlist
  if (!ALLOWED_TYPES[ext]) {
    const err = new Error(
      `File type "${ext}" is not allowed. Accepted: ${Object.keys(ALLOWED_TYPES).join(', ')}`
    );
    err.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(err, false);
  }

  // 2. Declared MIME must be in allowlist
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    const err = new Error(
      `MIME type "${file.mimetype}" is not allowed. Accepted: ${[...ALLOWED_MIMES].join(', ')}`
    );
    err.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(err, false);
  }

  cb(null, true);
}

const upload = multer({
  storage,
  limits: { fileSize: maxFileSize },
  fileFilter,
});

module.exports = {
  upload,
  validateMagicBytes,
  ALLOWED_TYPES,
  ALLOWED_MIMES,
  maxFileSize,
};
