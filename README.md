# FileFlow — File Uploader

A full-stack file management application built with **Node.js**, **Express**, and **MongoDB GridFS**. Upload, browse, download, and delete files through a clean web dashboard.

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green)
![Express](https://img.shields.io/badge/Express-v5-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-GridFS-brightgreen)

---

## Features

- **Drag & drop** file uploads with progress tracking
- **Multi-file upload** (up to 10 files at once)
- **MongoDB GridFS** storage — files are stored as chunks, not blobs in documents
- **File type validation** — extension, MIME type, and magic-byte signature checks
- **Streaming downloads** — files are streamed from GridFS without loading into memory
- **Inline preview** for images, PDFs, and text files
- **Responsive dashboard** — table on desktop, card layout on mobile
- **Search** files by name
- **Delete** with confirmation dialog
- **Toast notifications** for success/error feedback
- **Real API status indicator** — only shows "Connected" after a live health check
- **Centralized error handling** with proper HTTP status codes

---

## Technology Stack

| Layer      | Technology                         |
| ---------- | ---------------------------------- |
| Frontend   | HTML5, CSS3, Vanilla JavaScript    |
| Backend    | Node.js, Express 5                 |
| Storage    | MongoDB GridFS                     |
| Upload     | Multer 2 (memory storage)          |
| Logging    | Morgan                             |
| Env        | dotenv                             |
| CORS       | cors                               |

---

## Folder Structure

```
file-uploader/
├── public/                    # Frontend (served as static files)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── assets/
├── config/
│   └── db.js                  # MongoDB connection manager
├── controllers/
│   └── fileController.js      # Upload, list, info, download, delete handlers
├── routes/
│   └── fileRoutes.js          # Express route definitions
├── middleware/
│   ├── upload.js              # Multer config + file validation
│   └── errorHandler.js        # Centralized error-handling middleware
├── utils/
│   └── gridfs.js              # GridFSBucket factory
├── server.js                  # Express app entry point
├── package.json
├── .env                       # Environment variables (not committed)
├── .env.example               # Template for .env
├── .gitignore
└── README.md
```

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- **MongoDB** — one of:
  - Local MongoDB Community Server (v6+)
  - MongoDB Atlas (free tier works)

---

## Installation

```bash
# 1. Clone or download the project
cd file-uploader

# 2. Install dependencies
npm install

# 3. Copy the environment template
cp .env.example .env

# 4. Edit .env with your MongoDB connection details (see below)
```

---

## MongoDB Setup

### Option A: Local MongoDB

1. [Install MongoDB Community Server](https://www.mongodb.com/try/download/community)
2. Start the `mongod` service
3. Your `.env` should contain:

```env
MONGODB_URI=mongodb://localhost:27017
DB_NAME=fileflow_db
```

### Option B: MongoDB Atlas (cloud)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a database user
3. Whitelist your IP address (or allow `0.0.0.0/0` for development)
4. Click **Connect → Drivers** and copy the connection string
5. Update `.env`:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DB_NAME=fileflow_db
```

> Replace `<username>`, `<password>`, and `<cluster>` with your actual values.

---

## Environment Variables

| Variable        | Default                         | Description                           |
| --------------- | ------------------------------- | ------------------------------------- |
| `MONGODB_URI`   | `mongodb://localhost:27017`     | MongoDB connection string             |
| `DB_NAME`       | `fileflow_db`                   | Database name                         |
| `PORT`          | `3000`                         | HTTP server port                      |
| `MAX_FILE_SIZE` | `5242880` (5 MB)               | Maximum upload size in bytes          |
| `NODE_ENV`      | `development`                  | `development` or `production`         |
| `CORS_ORIGIN`   | _(all origins in dev)_         | Allowed origin in production          |

---

## Running the Application

### Development

```bash
npm run dev
```

Uses Node.js `--watch` for auto-restart on file changes.

### Production

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API Endpoints

### Health Check

```
GET /api/health
```

**Response** `200`:
```json
{
  "success": true,
  "message": "FileFlow API is running.",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Upload Files

```
POST /api/files/upload
Content-Type: multipart/form-data
```

- **Field name**: `files`
- **Max files**: 10
- **Max size**: 5 MB each
- **Allowed types**: PDF, PNG, JPG/JPEG, GIF, WEBP, SVG, TXT

**Response** `201`:
```json
{
  "success": true,
  "message": "2 file(s) uploaded successfully.",
  "results": [
    {
      "success": true,
      "file": {
        "id": "65a5b3c4d2f1a82e3c4d5e6f",
        "filename": "document.pdf",
        "originalName": "document.pdf",
        "contentType": "application/pdf",
        "size": 123456,
        "uploadDate": "2024-01-15T10:30:00.000Z"
      }
    }
  ]
}
```

---

### List All Files

```
GET /api/files
```

**Response** `200`:
```json
{
  "success": true,
  "count": 3,
  "files": [
    {
      "id": "65a5b3c4d2f1a82e3c4d5e6f",
      "filename": "document.pdf",
      "contentType": "application/pdf",
      "size": 123456,
      "uploadDate": "2024-01-15T10:30:00.000Z",
      "originalName": "document.pdf"
    }
  ]
}
```

---

### Get File Info

```
GET /api/files/:id/info
```

**Response** `200`: Same structure as a single file object above.

**Error** `400`: Invalid ID format
**Error** `404`: File not found

---

### Download / View File

```
GET /api/files/:id
GET /api/files/:id?download=true    # Force download
```

- Safe file types (images, PDF, text) are served with `Content-Disposition: inline`
- Other types default to `Content-Disposition: attachment`
- Add `?download=true` to force a download for any type

---

### Delete File

```
DELETE /api/files/:id
```

**Response** `200`:
```json
{
  "success": true,
  "message": "File \"document.pdf\" deleted successfully."
}
```

---

## Example Postman Requests

### Upload a file

- **Method**: POST
- **URL**: `http://localhost:3000/api/files/upload`
- **Body**: form-data
  - Key: `files` (type: File)
  - Value: select a file from your computer
- **Headers**: Do NOT set Content-Type manually — Postman handles it

### List files

- **Method**: GET
- **URL**: `http://localhost:3000/api/files`

### Download a file

- **Method**: GET
- **URL**: `http://localhost:3000/api/files/<file-id>`
- Click **Send and Download** in Postman

### Delete a file

- **Method**: DELETE
- **URL**: `http://localhost:3000/api/files/<file-id>`

---

## Supported File Types & Limits

| Type       | Extensions         | MIME Types                |
| ---------- | ------------------ | ------------------------- |
| PDF        | `.pdf`             | `application/pdf`         |
| PNG        | `.png`             | `image/png`               |
| JPEG       | `.jpg`, `.jpeg`    | `image/jpeg`              |
| GIF        | `.gif`             | `image/gif`               |
| WebP       | `.webp`            | `image/webp`              |
| SVG        | `.svg`             | `image/svg+xml`           |
| Plain Text | `.txt`             | `text/plain`              |

**Size limit**: 5 MB per file (configurable via `MAX_FILE_SIZE` in `.env`).

### File Signature Validation

For binary formats (PDF, PNG, JPEG, GIF, WebP), the server checks magic bytes to verify the file content matches its declared type. Text and SVG files are validated by extension and MIME type only, since they don't have reliable magic-byte signatures.

**Limitation**: A malicious user could still embed harmful content within a valid file container. For production use, consider integrating a malware scanner.

---

## Error Responses

All errors use a consistent format:

```json
{
  "success": false,
  "message": "A clear explanation of the error"
}
```

| Status | Meaning                               |
| ------ | ------------------------------------- |
| 400    | Invalid request or file ID            |
| 404    | File not found                        |
| 413    | File exceeds size limit               |
| 415    | Unsupported file type                 |
| 500    | Unexpected server error               |
| 503    | Database operation failed             |

Stack traces are included in development mode only (`NODE_ENV=development`).

---

## Security Considerations

⚠️ **This application has no authentication or authorization.** The upload and delete API endpoints are publicly accessible.

**Do NOT deploy this application publicly without adding:**

1. **Authentication** — API keys, JWT, OAuth, or session-based auth
2. **Rate limiting** — to prevent abuse (e.g., `express-rate-limit`)
3. **CORS restrictions** — set `CORS_ORIGIN` in production
4. **HTTPS** — always use TLS in production
5. **Input sanitization** — filenames are sanitized, but additional hardening is recommended
6. **Abuse protection** — CAPTCHA, upload quotas, IP banning

**What IS implemented:**

- File type allowlist (extension + MIME + magic bytes)
- File size limits
- Path traversal prevention (filenames are sanitized)
- Safe Content-Disposition headers
- No raw HTML rendering of user-provided filenames
- Secrets kept in `.env` (not committed)
- No sensitive data exposed in error responses (in production mode)
- Malformed ObjectId validation

---

## Troubleshooting

### `ECONNREFUSED` — Cannot connect to MongoDB

```
[server] Failed to start: connect ECONNREFUSED ::1:27017
```

**Fix**: Make sure MongoDB is running. Start the `mongod` service or update `MONGODB_URI` to point to your MongoDB Atlas cluster.

### `MongoServerError: bad auth`

**Fix**: Double-check the username/password in your Atlas connection string.

### `413 — File too large`

**Fix**: The default limit is 5 MB. Increase `MAX_FILE_SIZE` in `.env` (value is in bytes).

### `415 — Unsupported file type`

**Fix**: Only the file types listed above are allowed. Edit the `ALLOWED_TYPES` object in `middleware/upload.js` to add more.

### Port already in use

```
Error: listen EADDRINUSE :::3000
```

**Fix**: Another process is using port 3000. Change `PORT` in `.env` or stop the conflicting process.

### Upload fails with "Unexpected field"

**Fix**: The form-data field name must be `files` (not `file`, not `upload`).

---

## License

ISC
