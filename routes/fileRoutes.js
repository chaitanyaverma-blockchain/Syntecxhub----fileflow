/**
 * File Routes
 *
 * Maps HTTP methods + paths to controller handlers.
 * Ensures the database is available (503 if not) before executing handlers.
 */

const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/upload');
const { isDBConnected, connectDB } = require('../config/db');
const {
  uploadFiles,
  listFiles,
  getFileInfo,
  downloadFile,
  deleteFile,
} = require('../controllers/fileController');

/**
 * Middleware: Verify database connectivity.
 * If disconnected, attempts an on-demand reconnect. If still disconnected,
 * returns 503 Service Unavailable.
 */
async function requireDB(_req, res, next) {
  if (!isDBConnected()) {
    await connectDB();
  }

  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      message: 'Database service is unavailable. Please ensure MongoDB is running or configure MONGODB_URI in .env.',
    });
  }

  next();
}

// Require database for all file endpoints
router.use(requireDB);

// Upload one or more files (field name: "files", max 10 at a time)
router.post('/upload', upload.array('files', 10), uploadFiles);

// List all uploaded files
router.get('/', listFiles);

// Get metadata for a specific file
router.get('/:id/info', getFileInfo);

// Download / view a specific file
router.get('/:id', downloadFile);

// Delete a specific file
router.delete('/:id', deleteFile);

module.exports = router;
