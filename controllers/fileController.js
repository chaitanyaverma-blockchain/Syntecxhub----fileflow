/**
 * File Controller
 *
 * Implements all file operations: upload, list, info, download/view, delete.
 * Every handler is an async function that passes errors to the centralised
 * Express error handler via next().
 */

const { ObjectId } = require('mongodb');
const { Readable } = require('stream');
const path = require('path');
const { getBucket } = require('../utils/gridfs');
const { validateMagicBytes } = require('../middleware/upload');

// MIME types considered safe for inline preview in the browser
const INLINE_SAFE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'application/pdf',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate and convert a string to a MongoDB ObjectId. Returns null on failure. */
function toObjectId(str) {
  if (!str || !ObjectId.isValid(str)) return null;
  // ObjectId.isValid accepts 12-char strings too — double-check length
  if (typeof str === 'string' && str.length !== 24) return null;
  return new ObjectId(str);
}

/** Sanitise a filename so it can't be used for path traversal. */
function safeFilename(raw) {
  return path.basename(raw).replace(/[^\w.\-()[\] ]/g, '_');
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/files/upload
 * Accepts one or more files via multipart/form-data (field name: "files").
 * Streams each buffer into GridFS and returns metadata for every uploaded file.
 */
async function uploadFiles(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided.' });
    }

    const bucket = getBucket();
    const results = [];

    for (const file of req.files) {
      // Magic-byte validation (runs after the buffer is available)
      if (!validateMagicBytes(file.buffer, file.mimetype)) {
        // Skip this file — report it as rejected
        results.push({
          originalName: file.originalname,
          success: false,
          message: `File signature does not match declared type "${file.mimetype}".`,
        });
        continue;
      }

      const safeName = safeFilename(file.originalname);

      // Stream the in-memory buffer into GridFS
      const uploadStream = bucket.openUploadStream(safeName, {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          encoding: file.encoding,
          size: file.size,
        },
      });

      // Pipe the buffer into the upload stream
      await new Promise((resolve, reject) => {
        const readable = Readable.from(file.buffer);
        readable
          .pipe(uploadStream)
          .on('error', reject)
          .on('finish', resolve);
      });

      results.push({
        success: true,
        file: {
          id: uploadStream.id.toString(),
          filename: safeName,
          originalName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          uploadDate: new Date().toISOString(),
        },
      });
    }

    // Determine overall status: 201 if at least one file succeeded, else 400
    const anySuccess = results.some((r) => r.success);
    const status = anySuccess ? 201 : 400;

    res.status(status).json({
      success: anySuccess,
      message: anySuccess
        ? `${results.filter((r) => r.success).length} file(s) uploaded successfully.`
        : 'All files were rejected.',
      results,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files
 * Returns metadata for every file stored in the GridFS bucket, newest first.
 */
async function listFiles(_req, res, next) {
  try {
    const bucket = getBucket();
    const cursor = bucket.find({}, { sort: { uploadDate: -1 } });
    const files = await cursor.toArray();

    const mapped = files.map((f) => ({
      id: f._id.toString(),
      filename: f.filename,
      contentType: f.contentType || 'application/octet-stream',
      size: f.length,
      uploadDate: f.uploadDate,
      originalName: f.metadata?.originalName || f.filename,
    }));

    res.json({ success: true, count: mapped.length, files: mapped });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/:id/info
 * Returns metadata for a single file identified by its GridFS ObjectId.
 */
async function getFileInfo(req, res, next) {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid file ID format.' });
    }

    const bucket = getBucket();
    const cursor = bucket.find({ _id: oid });
    const files = await cursor.toArray();

    if (files.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'File not found.' });
    }

    const f = files[0];
    res.json({
      success: true,
      file: {
        id: f._id.toString(),
        filename: f.filename,
        contentType: f.contentType || 'application/octet-stream',
        size: f.length,
        uploadDate: f.uploadDate,
        originalName: f.metadata?.originalName || f.filename,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/:id
 * Streams the file content from GridFS. Uses Content-Disposition "inline" for
 * browser-safe types and "attachment" for everything else.
 * Accepts an optional ?download=true query param to force download.
 */
async function downloadFile(req, res, next) {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid file ID format.' });
    }

    const bucket = getBucket();
    const cursor = bucket.find({ _id: oid });
    const files = await cursor.toArray();

    if (files.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'File not found.' });
    }

    const fileMeta = files[0];
    const contentType = fileMeta.contentType || 'application/octet-stream';
    const safeName = safeFilename(fileMeta.filename);
    const forceDownload = req.query.download === 'true';

    // Decide disposition
    const disposition =
      !forceDownload && INLINE_SAFE.has(contentType) ? 'inline' : 'attachment';

    res.set({
      'Content-Type': contentType,
      'Content-Length': fileMeta.length,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(safeName)}"`,
    });

    const downloadStream = bucket.openDownloadStream(oid);

    downloadStream.on('error', (err) => {
      // If headers haven't been sent yet we can still respond with JSON
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: 'Error streaming file from storage.',
        });
      }
      // Otherwise just destroy the response — the client will see a broken download
      res.destroy();
      console.error('[download] Stream error after headers sent:', err.message);
    });

    downloadStream.pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/files/:id
 * Deletes a file and its chunks from GridFS.
 */
async function deleteFile(req, res, next) {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid file ID format.' });
    }

    const bucket = getBucket();

    // Verify existence first
    const cursor = bucket.find({ _id: oid });
    const files = await cursor.toArray();

    if (files.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'File not found.' });
    }

    await bucket.delete(oid);

    res.json({
      success: true,
      message: `File "${files[0].filename}" deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFiles,
  listFiles,
  getFileInfo,
  downloadFile,
  deleteFile,
};
