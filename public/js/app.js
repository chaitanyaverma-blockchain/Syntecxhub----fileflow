/**
 * FileFlow — Frontend Application
 *
 * Connects every GUI action to the real Express API.
 * Uses XMLHttpRequest for uploads (progress events) and fetch() everywhere else.
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------
  const API_BASE = ''; // same origin — leave empty; change if backend runs elsewhere

  // ---------------------------------------------------------------------------
  // DOM References
  // ---------------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const statusDot      = $('#status-dot');
  const statusText     = $('#status-text');
  const btnRefreshH    = $('#btn-refresh-header');
  const btnRefreshF    = $('#btn-refresh-files');
  const dropzone       = $('#dropzone');
  const fileInput      = $('#file-input');
  const fileQueue      = $('#file-queue');
  const fileQueueList  = $('#file-queue-list');
  const btnClearQueue  = $('#btn-clear-queue');
  const btnUpload      = $('#btn-upload');
  const uploadProgress = $('#upload-progress');
  const progressFill   = $('#progress-fill');
  const progressLabel  = $('#progress-label');
  const filesLoading   = $('#files-loading');
  const filesError     = $('#files-error');
  const filesErrorMsg  = $('#files-error-msg');
  const filesEmpty     = $('#files-empty');
  const fileTableWrap  = $('#file-table-wrap');
  const fileTableBody  = $('#file-table-body');
  const fileCards      = $('#file-cards');
  const searchInput    = $('#search-input');
  const btnRetry       = $('#btn-retry');
  const toastContainer = $('#toast-container');
  const modalOverlay   = $('#modal-overlay');
  const modalBody      = $('#modal-body');
  const modalCancel    = $('#modal-cancel');
  const modalConfirm   = $('#modal-confirm');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let selectedFiles = [];   // Files selected for upload (from input or drop)
  let allFiles      = [];   // Files returned by the API
  let deleteTarget  = null; // File ID pending deletion
  let isUploading   = false;

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Human-readable file size */
  function fmtSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + units[i];
  }

  /** Human-readable date */
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    }) + ' ' + d.toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit',
    });
  }

  /** Extract extension from filename */
  function ext(name) {
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot + 1).toUpperCase();
  }

  /** Sanitise text for safe insertion into HTML */
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // Toast notifications
  // ---------------------------------------------------------------------------
  function showToast(message, type = 'success', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span>${esc(message)}</span>
      <button class="toast__close" aria-label="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    toast.querySelector('.toast__close').addEventListener('click', () => toast.remove());
    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, duration);
  }

  // ---------------------------------------------------------------------------
  // API Status Check
  // ---------------------------------------------------------------------------
  async function checkAPI() {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.database === 'connected') {
          statusDot.className = 'status-dot connected';
          statusText.textContent = 'Connected';
        } else {
          statusDot.className = 'status-dot warning';
          statusText.textContent = 'DB Offline';
        }
      } else {
        throw new Error();
      }
    } catch {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'API Offline';
    }
  }

  // ---------------------------------------------------------------------------
  // File Queue (selected files before upload)
  // ---------------------------------------------------------------------------

  function updateQueue() {
    if (selectedFiles.length === 0) {
      fileQueue.hidden = true;
      btnUpload.disabled = true;
      return;
    }
    fileQueue.hidden = false;
    btnUpload.disabled = false;

    fileQueueList.innerHTML = selectedFiles.map((f, i) => `
      <li class="file-queue__item">
        <div class="file-queue__item-info">
          <span class="file-queue__item-ext">${esc(ext(f.name))}</span>
          <span class="file-queue__item-name" title="${esc(f.name)}">${esc(f.name)}</span>
        </div>
        <span class="file-queue__item-size">${fmtSize(f.size)}</span>
        <button class="file-queue__remove" data-index="${i}" aria-label="Remove ${esc(f.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </li>`).join('');

    // Remove-from-queue handlers
    fileQueueList.querySelectorAll('.file-queue__remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedFiles.splice(Number(btn.dataset.index), 1);
        updateQueue();
      });
    });
  }

  function addFiles(fileList) {
    for (const f of fileList) {
      // Avoid duplicates (same name + size)
      const dup = selectedFiles.some((s) => s.name === f.name && s.size === f.size);
      if (!dup) selectedFiles.push(f);
    }
    updateQueue();
  }

  // ---------------------------------------------------------------------------
  // Drag & Drop
  // ---------------------------------------------------------------------------
  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('active'); });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('active'); });
  });
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // Click / keyboard on dropzone opens file picker
  dropzone.addEventListener('click', (e) => {
    // Don't open picker if user clicked the Browse button (label does it natively)
    if (e.target.closest('.dropzone__browse')) return;
    fileInput.click();
  });
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) addFiles(fileInput.files);
    fileInput.value = ''; // reset so the same file can be re-selected
  });

  btnClearQueue.addEventListener('click', () => {
    selectedFiles = [];
    updateQueue();
  });

  // ---------------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------------
  function uploadFiles() {
    if (selectedFiles.length === 0 || isUploading) return;

    isUploading = true;
    btnUpload.disabled = true;
    btnUpload.textContent = 'Uploading…';
    uploadProgress.hidden = false;
    progressFill.style.width = '0%';
    progressLabel.textContent = '0 %';

    const formData = new FormData();
    selectedFiles.forEach((f) => formData.append('files', f));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/files/upload`);

    // Progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        progressLabel.textContent = pct + ' %';
      }
    });

    xhr.addEventListener('load', () => {
      isUploading = false;
      btnUpload.textContent = 'Upload';

      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          showToast(data.message || 'Files uploaded successfully!', 'success');
          selectedFiles = [];
          updateQueue();
          fetchFiles();
        } else {
          showToast(data.message || 'Upload failed.', 'error');
        }
      } catch {
        showToast('Upload failed — invalid server response.', 'error');
      }

      setTimeout(() => { uploadProgress.hidden = true; }, 1500);
    });

    xhr.addEventListener('error', () => {
      isUploading = false;
      btnUpload.disabled = false;
      btnUpload.textContent = 'Upload';
      showToast('Network error — could not reach the server.', 'error');
      uploadProgress.hidden = true;
    });

    xhr.addEventListener('abort', () => {
      isUploading = false;
      btnUpload.disabled = false;
      btnUpload.textContent = 'Upload';
      uploadProgress.hidden = true;
    });

    // Do NOT manually set Content-Type — let the browser set the multipart boundary
    xhr.send(formData);
  }

  btnUpload.addEventListener('click', uploadFiles);

  // ---------------------------------------------------------------------------
  // Fetch & Render File List
  // ---------------------------------------------------------------------------
  async function fetchFiles() {
    showFilesState('loading');
    checkAPI();

    try {
      const res = await fetch(`${API_BASE}/api/files`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || `Server returned ${res.status}`);
      }
      allFiles = data.files || [];
      renderFiles(allFiles);
    } catch (err) {
      showFilesState('error', err.message);
    }
  }

  /** Show one of: loading | error | empty | table */
  function showFilesState(state, message) {
    filesLoading.hidden  = state !== 'loading';
    filesError.hidden    = state !== 'error';
    filesEmpty.hidden    = state !== 'empty';
    fileTableWrap.hidden = state !== 'table';
    fileCards.hidden      = state !== 'table';

    if (state === 'error') {
      filesErrorMsg.textContent = message || 'Could not load files.';
    }

    // Ensure mobile cards visibility
    if (state === 'table') {
      fileCards.style.display = '';
    } else {
      fileCards.style.display = 'none';
    }
  }

  function renderFiles(files) {
    // Apply search filter
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? files.filter((f) => (f.originalName || f.filename).toLowerCase().includes(q))
      : files;

    if (filtered.length === 0 && files.length === 0) {
      showFilesState('empty');
      return;
    }

    if (filtered.length === 0) {
      // Search produced no results but files exist
      showFilesState('table');
      fileTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--clr-text-muted)">No files match your search.</td></tr>`;
      fileCards.innerHTML = `<p style="text-align:center;color:var(--clr-text-muted);padding:2rem">No files match your search.</p>`;
      return;
    }

    showFilesState('table');

    // Desktop table
    fileTableBody.innerHTML = filtered.map((f) => `
      <tr>
        <td class="file-table__name" title="${esc(f.originalName || f.filename)}">${esc(f.originalName || f.filename)}</td>
        <td><span class="file-table__type">${esc(ext(f.originalName || f.filename))}</span></td>
        <td class="file-table__size">${fmtSize(f.size)}</td>
        <td class="file-table__date">${fmtDate(f.uploadDate)}</td>
        <td>
          <div class="file-table__actions">
            <a class="action-btn" href="${API_BASE}/api/files/${f.id}" target="_blank" title="View / Download" aria-label="View ${esc(f.filename)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </a>
            <a class="action-btn" href="${API_BASE}/api/files/${f.id}?download=true" title="Download" aria-label="Download ${esc(f.filename)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </a>
            <button class="action-btn action-btn--danger" data-delete="${f.id}" data-name="${esc(f.originalName || f.filename)}" title="Delete" aria-label="Delete ${esc(f.filename)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join('');

    // Mobile cards
    fileCards.innerHTML = filtered.map((f) => `
      <div class="file-card">
        <div class="file-card__header">
          <span class="file-card__name">${esc(f.originalName || f.filename)}</span>
          <span class="file-table__type">${esc(ext(f.originalName || f.filename))}</span>
        </div>
        <div class="file-card__meta">
          <span>${fmtSize(f.size)}</span>
          <span>${fmtDate(f.uploadDate)}</span>
        </div>
        <div class="file-card__actions">
          <a class="btn btn--secondary btn--sm" href="${API_BASE}/api/files/${f.id}" target="_blank">View</a>
          <a class="btn btn--secondary btn--sm" href="${API_BASE}/api/files/${f.id}?download=true">Download</a>
          <button class="btn btn--danger btn--sm" data-delete="${f.id}" data-name="${esc(f.originalName || f.filename)}">Delete</button>
        </div>
      </div>`).join('');

    // Bind delete buttons
    document.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteTarget = btn.dataset.delete;
        modalBody.textContent = `Are you sure you want to delete "${btn.dataset.name}"? This action cannot be undone.`;
        modalOverlay.hidden = false;
      });
    });
  }

  // Search
  searchInput.addEventListener('input', () => renderFiles(allFiles));

  // Retry on error
  btnRetry.addEventListener('click', fetchFiles);

  // ---------------------------------------------------------------------------
  // Delete File
  // ---------------------------------------------------------------------------
  modalCancel.addEventListener('click', () => {
    modalOverlay.hidden = true;
    deleteTarget = null;
  });
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.hidden = true;
      deleteTarget = null;
    }
  });

  modalConfirm.addEventListener('click', async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    modalOverlay.hidden = true;
    deleteTarget = null;

    try {
      const res = await fetch(`${API_BASE}/api/files/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || 'File deleted.', 'success');
        fetchFiles();
      } else {
        showToast(data.message || 'Deletion failed.', 'error');
      }
    } catch {
      showToast('Network error — could not delete file.', 'error');
    }
  });

  // ---------------------------------------------------------------------------
  // Refresh Buttons
  // ---------------------------------------------------------------------------
  function refreshWithSpin(btn) {
    btn.classList.add('spin');
    fetchFiles().finally(() => {
      setTimeout(() => btn.classList.remove('spin'), 600);
    });
  }
  btnRefreshH.addEventListener('click', () => refreshWithSpin(btnRefreshH));
  btnRefreshF.addEventListener('click', () => refreshWithSpin(btnRefreshF));

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  checkAPI();
  fetchFiles();
})();
