/**
 * Database Configuration — MongoDB Connection
 *
 * Manages the MongoDB client lifecycle: connect, access db/bucket, and close.
 * Includes graceful connection checks and state management.
 */

const { MongoClient } = require('mongodb');

let client = null;
let db = null;
let isConnecting = false;

/**
 * Connect to MongoDB using the URI and DB name from environment variables.
 * Returns the db instance on success, or null on failure (does not crash the process).
 */
async function connectDB() {
  if (db) return db;
  if (isConnecting) return null;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;

  if (!uri || !dbName) {
    console.warn('[db] MONGODB_URI or DB_NAME is missing from environment.');
    return null;
  }

  isConnecting = true;
  try {
    const newClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });

    await newClient.connect();
    const newDb = newClient.db(dbName);

    // Ping to verify the connection is active
    await newDb.command({ ping: 1 });

    client = newClient;
    db = newDb;
    console.log(`[db] Connected to MongoDB – database: "${dbName}"`);
    return db;
  } catch (err) {
    client = null;
    db = null;
    console.warn(`[db] MongoDB connection notice: ${err.message}`);
    return null;
  } finally {
    isConnecting = false;
  }
}

/** Check if the database is currently connected and ready. */
function isDBConnected() {
  return db !== null;
}

/** Return the database instance (or null if not yet connected). */
function getDB() {
  return db;
}

/** Return the underlying MongoClient (or null). */
function getClient() {
  return client;
}

/**
 * Gracefully close the MongoDB connection.
 * Safe to call even if the client was never connected.
 */
async function closeDB() {
  if (client) {
    try {
      await client.close();
    } catch (_) {}
    client = null;
    db = null;
    console.log('[db] MongoDB connection closed.');
  }
}

module.exports = { connectDB, getDB, getClient, isDBConnected, closeDB };
