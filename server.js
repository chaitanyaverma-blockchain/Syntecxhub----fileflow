/**
 * Server Entry Point
 *
 * Loads environment variables, starts the Express HTTP server, mounts routes,
 * and manages database connection with automatic reconnection.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const { connectDB, closeDB, isDBConnected } = require('./config/db');
const { resetBucket } = require('./utils/gridfs');
const fileRoutes = require('./routes/fileRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS — allow all origins in development; tighten in production
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.CORS_ORIGIN || false
      : true,
  })
);

// Request logging (skip in test environments)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// JSON body parser
app.use(express.json());

// Serve static frontend assets from /public (excluding index.html root intercept)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ---------------------------------------------------------------------------
// Health Check & Root Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /
 * Health check endpoint as required by spec.
 * Serves the web dashboard for browser requests (Accept: text/html),
 * and returns JSON status for API / Postman / curl clients.
 */
app.get('/', (req, res) => {
  const acceptsHtml = req.accepts(['html', 'json']) === 'html';
  if (acceptsHtml) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }

  res.json({
    success: true,
    message: 'FileFlow API is running.',
    database: isDBConnected() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health
 * Explicit JSON health-check endpoint for frontend dashboard & monitors.
 */
app.get('/api/health', async (_req, res) => {
  if (!isDBConnected()) {
    await connectDB();
  }

  const dbStatus = isDBConnected();
  res.json({
    success: true,
    message: dbStatus
      ? 'FileFlow API and Database are operational.'
      : 'FileFlow API is running, but MongoDB is disconnected.',
    api: 'online',
    database: dbStatus ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/files', fileRoutes);

// Catch-all: serve index.html for unknown frontend routes
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Centralized Error Handling
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server Startup
// ---------------------------------------------------------------------------

async function start() {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 FileFlow Web Server running on: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });

  // Attempt initial MongoDB connection
  console.log('[server] Attempting connection to MongoDB...');
  const connected = await connectDB();

  if (!connected) {
    console.warn('\n[!] NOTICE: MongoDB is currently disconnected.');
    console.warn(`    The web UI is accessible at http://localhost:${PORT}`);
    console.warn('    To enable file uploads and storage:');
    console.warn('    1. Start local MongoDB (mongod), OR');
    console.warn('    2. Update MONGODB_URI in .env with your MongoDB Atlas connection string.\n');

    // Periodic reconnection attempt every 10 seconds in the background
    const interval = setInterval(async () => {
      const ok = await connectDB();
      if (ok) {
        console.log('[server] MongoDB connection established successfully!');
        clearInterval(interval);
      }
    }, 10000);
    interval.unref(); // Don't block event loop on process exit
  }
}

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received – shutting down…`);
  resetBucket();
  await closeDB();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
