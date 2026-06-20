// ==========================================
// TTGODMODE — Frontend App
// ==========================================

const DOM = {
  urlInput: document.getElementById('urlInput'),
  urlCount: document.getElementById('urlCount'),
  downloadBtn: document.getElementById('downloadBtn'),
  clearBtn: document.getElementById('clearBtn'),
  summaryBar: document.getElementById('summaryBar'),
  queueSection: document.getElementById('queueSection'),
  queueList: document.getElementById('queueList'),
  downloadAllZipBtn: document.getElementById('downloadAllZipBtn'),
  toastContainer: document.getElementById('toastContainer'),
  statTotal: document.getElementById('statTotal'),
  statComplete: document.getElementById('statComplete'),
  statDownloading: document.getElementById('statDownloading'),
  statFailed: document.getElementById('statFailed'),
  metaToggle: document.getElementById('metaToggle'),
  metaToggleSection: document.getElementById('metaToggleSection'),
  metaTechniques: document.getElementById('metaTechniques'),
  metaBadge: document.getElementById('metaBadge'),
  ffmpegWarning: document.getElementById('ffmpegWarning'),
};

let currentSessionId = null;
let eventSource = null;
let downloadItems = {};
let ffmpegAvailable = true;

// ==========================================
// FFmpeg Check
// ==========================================

async function checkFFmpeg() {
  try {
    const res = await fetch('/api/check-ffmpeg');
    const data = await res.json();
    ffmpegAvailable = data.available;
    if (!ffmpegAvailable) {
      DOM.ffmpegWarning.style.display = 'flex';
    }
  } catch (e) {
    // Silently fail — assume available
  }
}

checkFFmpeg();

// ==========================================
// Metadata Toggle
// ==========================================

DOM.metaToggle.addEventListener('change', () => {
  const isOn = DOM.metaToggle.checked;

  if (isOn) {
    DOM.metaToggleSection.classList.add('active');
    DOM.metaTechniques.classList.remove('hidden');
    DOM.metaBadge.textContent = 'ON';
    DOM.metaBadge.classList.add('active');
    DOM.downloadBtn.innerHTML = '<span>⚡</span> GOD MODE Download + Randomize';
  } else {
    DOM.metaToggleSection.classList.remove('active');
    DOM.metaTechniques.classList.add('hidden');
    DOM.metaBadge.textContent = 'OFF';
    DOM.metaBadge.classList.remove('active');
    DOM.downloadBtn.innerHTML = '<span>⚡</span> GOD MODE Download';
  }
});

// ==========================================
// URL Parsing
// ==========================================

function parseUrls(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      return line.length > 0 && (
        line.includes('tiktok.com') ||
        line.includes('vt.tiktok.com') ||
        line.includes('vm.tiktok.com')
      );
    });
}

function updateUrlCount() {
  const urls = parseUrls(DOM.urlInput.value);
  DOM.urlCount.textContent = urls.length;
  DOM.downloadBtn.disabled = urls.length === 0;
}

DOM.urlInput.addEventListener('input', updateUrlCount);

DOM.clearBtn.addEventListener('click', () => {
  DOM.urlInput.value = '';
  updateUrlCount();
});

// ==========================================
// Toast Notifications
// ==========================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: '⚡', meta: '🎲' };
  toast.innerHTML = `<span>${icons[type] || '⚡'}</span> ${message}`;
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// Queue UI
// ==========================================

function createQueueItem(url, index) {
  const item = document.createElement('div');
  item.className = 'queue-item';
  item.id = `queue-item-${index}`;
  item.innerHTML = `
    <div class="queue-item-number">${index + 1}</div>
    <div class="queue-item-info">
      <div class="queue-item-url" title="${url}">${url}</div>
      <div class="queue-item-title" id="title-${index}"></div>
      <div class="queue-item-status" id="status-${index}">
        <span class="status-badge status-waiting">⏳ Waiting</span>
      </div>
      <div class="progress-container" id="progress-container-${index}" style="display:none;">
        <div class="progress-bar" id="progress-bar-${index}" style="width: 0%"></div>
      </div>
      <div class="queue-item-meta-info" id="meta-info-${index}" style="display:none;"></div>
    </div>
    <div class="queue-item-actions" id="actions-${index}"></div>
  `;
  return item;
}

function updateQueueItemStatus(index, status, detail = '') {
  const statusEl = document.getElementById(`status-${index}`);
  const progressContainer = document.getElementById(`progress-container-${index}`);
  const progressBar = document.getElementById(`progress-bar-${index}`);
  const queueItem = document.getElementById(`queue-item-${index}`);

  if (!statusEl) return;

  const statusMap = {
    waiting: '<span class="status-badge status-waiting">⏳ Waiting</span>',
    downloading: `<div class="spinner"></div> <span class="status-badge status-downloading">⬇ Downloading</span> <span>${detail}</span>`,
    meta_processing: `<div class="spinner meta"></div> <span class="status-badge status-meta">🎲 Randomizing</span> <span>${detail}</span>`,
    complete: '<span class="status-badge status-complete">✅ Complete</span>',
    error: `<span class="status-badge status-error">❌ Failed</span> <span style="color:#ef4444;font-size:12px">${detail}</span>`,
  };

  statusEl.innerHTML = statusMap[status] || '';

  if (status === 'downloading') {
    progressContainer.style.display = 'block';
    progressBar.className = 'progress-bar downloading';
    if (queueItem) queueItem.classList.remove('meta-processing');
  } else if (status === 'meta_processing') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar meta-processing';
    if (queueItem) queueItem.classList.add('meta-processing');
  } else if (status === 'complete') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar complete';
    if (queueItem) queueItem.classList.remove('meta-processing');
  } else if (status === 'error') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar error';
    if (queueItem) queueItem.classList.remove('meta-processing');
  }
}

function updateProgress(index, percent) {
  const progressBar = document.getElementById(`progress-bar-${index}`);
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
}

function addDownloadButton(index, filename) {
  const actionsEl = document.getElementById(`actions-${index}`);
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="btn-download-single" onclick="downloadFile('${encodeURIComponent(filename)}')">
        💾 Save
      </button>
    `;
  }
}

function updateTitle(index, title) {
  const titleEl = document.getElementById(`title-${index}`);
  if (titleEl && title) {
    titleEl.textContent = title;
  }
}

function showMetaInfo(index, metaInfo) {
  const metaInfoEl = document.getElementById(`meta-info-${index}`);
  if (metaInfoEl && metaInfo) {
    metaInfoEl.style.display = 'flex';
    metaInfoEl.innerHTML = `🎲 Meta: ${metaInfo.artist} · ${metaInfo.title} · ${metaInfo.encoder}`;
  }
}

function updateSummaryStats() {
  const items = Object.values(downloadItems);
  const total = items.length;
  const complete = items.filter(i => i.status === 'complete').length;
  const downloading = items.filter(i => i.status === 'downloading' || i.status === 'meta_processing').length;
  const failed = items.filter(i => i.status === 'error').length;

  DOM.statTotal.textContent = total;
  DOM.statComplete.textContent = complete;
  DOM.statDownloading.textContent = downloading;
  DOM.statFailed.textContent = failed;

  // Show ZIP button when all done
  if (complete > 0 && downloading === 0 && (complete + failed === total)) {
    DOM.downloadAllZipBtn.classList.remove('hidden');
  }
}

// ==========================================
// Download Actions
// ==========================================

function downloadFile(filename) {
  const a = document.createElement('a');
  a.href = `/api/download-file/${filename}?sessionId=${currentSessionId}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

DOM.downloadAllZipBtn.addEventListener('click', () => {
  if (!currentSessionId) return;
  const a = document.createElement('a');
  a.href = `/api/download-all?sessionId=${currentSessionId}`;
  a.download = 'ttgodmode-videos.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Preparing ZIP file...', 'info');
});

// ==========================================
// SSE Progress Listener
// ==========================================

function connectSSE(sessionId) {
  if (eventSource) {
    eventSource.close();
  }
  eventSource = new EventSource(`/api/progress?sessionId=${sessionId}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleProgressEvent(data);
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  eventSource.onerror = () => {
    console.log('SSE connection closed');
    eventSource.close();
    eventSource = null;
  };
}

function handleProgressEvent(data) {
  const { index, type, percent, detail, filename, title, metaApplied, metaInfo, metaError } = data;

  switch (type) {
    case 'start':
      downloadItems[index] = { status: 'downloading' };
      updateQueueItemStatus(index, 'downloading', 'Starting...');
      break;

    case 'progress':
      downloadItems[index] = { status: 'downloading' };
      updateQueueItemStatus(index, 'downloading', detail || `${percent || 0}%`);
      if (percent) updateProgress(index, percent);
      break;

    case 'title':
      if (title) updateTitle(index, title);
      break;

    case 'meta_start':
      downloadItems[index] = { status: 'meta_processing' };
      updateQueueItemStatus(index, 'meta_processing', detail || 'Randomizing metadata...');
      showToast(`Video #${index + 1}: Randomizing metadata...`, 'meta');
      break;

    case 'complete':
      downloadItems[index] = { status: 'complete', filename };
      updateQueueItemStatus(index, 'complete');
      if (filename) addDownloadButton(index, filename);

      if (metaApplied && metaInfo) {
        showMetaInfo(index, metaInfo);
        showToast(`Video #${index + 1} — GOD MODE ✅`, 'success');
      } else if (metaApplied === false && metaError) {
        showToast(`Video #${index + 1} downloaded (meta failed: ${metaError})`, 'info');
      } else {
        showToast(`Video #${index + 1} downloaded!`, 'success');
      }
      break;

    case 'error':
      downloadItems[index] = { status: 'error' };
      updateQueueItemStatus(index, 'error', detail || 'Unknown error');
      showToast(`Video #${index + 1} failed`, 'error');
      break;

    case 'all_done':
      showToast('All processing finished! ⚡', 'success');
      DOM.downloadBtn.disabled = false;
      DOM.downloadBtn.innerHTML = DOM.metaToggle.checked
        ? '<span>⚡</span> GOD MODE Download + Randomize'
        : '<span>⚡</span> GOD MODE Download';
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      break;
  }

  updateSummaryStats();
}

// ==========================================
// Start Download
// ==========================================

DOM.downloadBtn.addEventListener('click', async () => {
  const urls = parseUrls(DOM.urlInput.value);
  if (urls.length === 0) return;

  const randomizeMeta = DOM.metaToggle.checked;

  // Warn if meta is on but ffmpeg isn't available
  if (randomizeMeta && !ffmpegAvailable) {
    showToast('FFmpeg not detected! Videos will download without metadata randomization.', 'error');
  }

  // Reset state
  downloadItems = {};
  DOM.queueList.innerHTML = '';
  DOM.queueSection.classList.remove('hidden');
  DOM.summaryBar.classList.remove('hidden');
  DOM.downloadAllZipBtn.classList.add('hidden');
  DOM.downloadBtn.disabled = true;
  DOM.downloadBtn.innerHTML = '<div class="spinner"></div> Processing...';

  // Create queue items
  urls.forEach((url, index) => {
    downloadItems[index] = { status: 'waiting' };
    DOM.queueList.appendChild(createQueueItem(url, index));
  });

  updateSummaryStats();

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, randomizeMeta }),
    });

    const result = await response.json();

    if (result.success) {
      currentSessionId = result.sessionId;
      connectSSE(result.sessionId);
      const modeText = randomizeMeta ? 'GOD MODE' : 'downloading';
      showToast(`Started ${modeText} for ${urls.length} videos`, 'info');
    } else {
      showToast(result.error || 'Failed to start downloads', 'error');
      DOM.downloadBtn.disabled = false;
      DOM.downloadBtn.innerHTML = DOM.metaToggle.checked
        ? '<span>⚡</span> GOD MODE Download + Randomize'
        : '<span>⚡</span> GOD MODE Download';
    }
  } catch (err) {
    showToast('Connection error. Is the server running?', 'error');
    DOM.downloadBtn.disabled = false;
    DOM.downloadBtn.innerHTML = DOM.metaToggle.checked
      ? '<span>⚡</span> GOD MODE Download + Randomize'
      : '<span>⚡</span> GOD MODE Download';
  }
});

// Init
updateUrlCount();
