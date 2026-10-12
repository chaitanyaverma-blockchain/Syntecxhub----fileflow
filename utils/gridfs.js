/**
 * GridFS Utility
 *
 * Creates and exposes a single GridFSBucket instance backed by the connected
 * database. The bucket is created lazily on first access so callers don't
 * need to worry about timing relative to the DB connection.
 */

const { GridFSBucket } = require('mongodb');
const { getDB } = require('../config/db');

const BUCKET_NAME = 'uploads'; // GridFS collections: uploads.files & uploads.chunks

let bucket = null;

/**
 * Return the shared GridFSBucket, creating it on first call.
 * Throws if the database isn't connected yet.
 */
function getBucket() {
  if (bucket) return bucket;

  const db = getDB();
  if (!db) {
    throw new Error('Database is not connected. Cannot create GridFS bucket.');
  }

  bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
  console.log(`[gridfs] Bucket "${BUCKET_NAME}" initialised.`);
  return bucket;
}

/**
 * Reset the cached bucket (used during graceful shutdown).
 */
function resetBucket() {
  bucket = null;
}

module.exports = { getBucket, resetBucket, BUCKET_NAME };
