/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* global document, alert, confirm */
/* eslint-disable no-console */
// Configuration
const API_BASE = '';

const THEME_KEY = 'zintrust-workers-dashboard-theme';
const AUTO_REFRESH_KEY = 'zintrust-workers-dashboard-auto-refresh';
const PAGE_SIZE_KEY = 'zintrust-workers-dashboard-page-size';
const _BULK_AUTO_START_KEY = 'zintrust-workers-dashboard-bulk-auto-start';

let currentPage = 1;
let totalPages = 1;
let totalWorkers = 0;
let autoRefreshEnabled = true;
let refreshTimer = null;
let currentTheme = null;
const _bulkAutoStartEnabled = false;
const _lastWorkers = [];
const detailsCache = new Map();
const MAX_CACHE_SIZE = 50;

// Theme management
function getPreferredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  const prefersLight =
    globalThis.window.matchMedia &&
    globalThis.window.matchMedia('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

function applyTheme(nextTheme) {
  currentTheme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(THEME_KEY, nextTheme);
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// Data fetching
async function fetchData() {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const content = document.getElementById('workers-content');
  const searchBtn = document.getElementById('search-btn');

  // Only show full loading state if we have no content yet
  if (content.style.display === 'none') {
    loading.style.display = 'block';
  } else {
    content.style.opacity = '0.5';
  }

  error.style.display = 'none';
  if (searchBtn) searchBtn.disabled = true;

  try {
    const limit = localStorage.getItem(PAGE_SIZE_KEY) || '100';
    // Update limit select if needed
    const limitSelect = document.getElementById('limit-select');
    if (limitSelect && limitSelect.value !== limit) limitSelect.value = limit;

    const statusFilter = document.getElementById('status-filter');
    const driverFilter = document.getElementById('driver-filter');
    const sortSelect = document.getElementById('sort-select');
    const searchInput = document.getElementById('search-input');

    const params = new URLSearchParams({
      page: currentPage.toString(),
      limit: limit,
      status: statusFilter ? statusFilter.value : '',
      driver: driverFilter ? driverFilter.value : '',
      sortBy: sortSelect ? sortSelect.value : 'name',
      sortOrder: 'asc',
      search: searchInput ? searchInput.value : '',
    });

    const response = await fetch(API_BASE + '/api/workers?' + params.toString());
    if (!response.ok) {
      console.error('Failed to fetch workers:', response.statusText);
      loading.style.display = 'none';
      error.style.display = 'block';
      content.style.opacity = '1';
      return;
    }

    const data = await response.json();
    renderWorkers(data);

    loading.style.display = 'none';
    content.style.display = 'block';
    content.style.opacity = '1';
  } catch (err) {
    console.error('Error fetching workers:', err);
    loading.style.display = 'none';
    error.style.display = 'block';
    content.style.opacity = '1';
  } finally {
    if (searchBtn) searchBtn.disabled = false;
  }
}

function changeLimit(_newLimit) {
  localStorage.setItem(PAGE_SIZE_KEY, _newLimit);
  currentPage = 1;
  fetchData();
}

// Make functions globally available for HTML onclick/onchange handlers
globalThis.changeLimit = changeLimit;
globalThis.toggleAutoRefresh = toggleAutoRefresh;
globalThis.fetchData = fetchData;
globalThis.showAddWorkerModal = showAddWorkerModal;
globalThis.loadPage = loadPage;
globalThis.startWorker = startWorker;
globalThis.stopWorker = stopWorker;
globalThis.restartWorker = restartWorker;
globalThis.deleteWorker = deleteWorker;
globalThis.toggleAutoStart = toggleAutoStart;
globalThis.toggleDetails = toggleDetails;

// Helper functions to reduce complexity
function validateDriver(driver) {
  return !driver || ['db', 'redis', 'memory'].includes(driver);
}

async function fetchWorkerData(workerName, driver) {
  const [detailsRes, historyRes, trendRes, slaRes] = await Promise.all([
    fetch(API_BASE + '/api/workers/' + workerName + '/details?driver=' + driver),
    fetch(API_BASE + '/api/workers/' + workerName + '/monitoring/history?limit=50'),
    fetch(API_BASE + '/api/workers/' + workerName + '/monitoring/trend'),
    fetch(API_BASE + '/api/workers/' + workerName + '/sla/status'),
  ]);

  return { detailsRes, historyRes, trendRes, slaRes };
}

async function processDetailsResponse(detailsRes, data) {
  if (!detailsRes.ok) return;
  const json = await detailsRes.json();
  Object.assign(data, json);
}

async function processSlaResponse(slaRes, data) {
  if (!slaRes.ok) return;
  const slaJson = await slaRes.json();
  if (slaJson.status) {
    if (!data.details) data.details = {};
    data.details.sla = slaJson.status;
  }
}

async function processHistoryResponse(historyRes, data) {
  if (!historyRes.ok) return;
  const historyJson = await historyRes.json();
  if (!historyJson.history || !Array.isArray(historyJson.history)) return;

  const formattedLogs = historyJson.history.map((h) => {
    const time = new Date(h.timestamp).toLocaleTimeString();
    const msg = h.message ? ` - ${h.message}` : '';
    return `[${time}] ${h.status.toUpperCase()} (${h.latency}ms)${msg}`;
  });

  if (!data.details) data.details = {};
  data.details.recentLogs = formattedLogs;
}

async function processTrendResponse(trendRes, data) {
  if (!trendRes.ok) return;
  const trendJson = await trendRes.json();
  if (!trendJson.trend) return;

  if (!data.details) data.details = {};
  if (!data.details.metrics) data.details.metrics = {};
  data.details.metrics.uptimeTrend = (trendJson.trend.uptime * 100).toFixed(1) + '%';
  if (trendJson.trend.samples) data.details.metrics.samples = trendJson.trend.samples;
}

function manageCacheSize() {
  if (detailsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = detailsCache.keys().next().value;
    detailsCache.delete(firstKey);
  }
}

async function ensureWorkerDetails(workerName, detailRow, driver) {
  if (!workerName || !detailRow) return;

  if (!detailsCache.has(workerName)) {
    try {
      if (!validateDriver(driver)) {
        console.error('Invalid driver specified');
        return;
      }

      const responses = await fetchWorkerData(workerName, driver);
      const data = {};

      await processDetailsResponse(responses.detailsRes, data);
      await processSlaResponse(responses.slaRes, data);
      await processHistoryResponse(responses.historyRes, data);
      await processTrendResponse(responses.trendRes, data);

      manageCacheSize();
      detailsCache.set(workerName, data);
    } catch (err) {
      console.error('Failed to load worker details:', err);
    }
  }

  const cached = detailsCache.get(workerName);
  const detailsData = cached?.details ?? cached;
  updateDetailViews(detailRow, detailsData);
}

function updateDetailViews(detailRow, details) {
  if (!details) return;

  // Helper to safe access nested properties
  const get = (obj, path) => path.split('.').reduce((o, i) => (o ? o[i] : null), obj);

  // Update simple data attributes
  detailRow.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    let value = get(details, key);

    // Format specific fields
    if (key === 'metrics.processed' && value !== null) value = Number(value).toLocaleString();
    if (key === 'metrics.avgTime' && value !== null) value = value + 'ms';
    if (key === 'metrics.memory' && value !== null) value = value + 'MB';

    if (value !== null && value !== undefined) {
      el.textContent = value;
    }
  });

  // Delegate to specialized functions
  updateLogsContainer(detailRow, details);
  updateSLAContainer(detailRow, details);
}

function updateLogsContainer(detailRow, details) {
  // Handle logs if present
  const logsContainer = detailRow.querySelector('.logs-content');
  if (logsContainer && details.recentLogs && Array.isArray(details.recentLogs)) {
    // Clear existing content safely
    while (logsContainer.firstChild) {
      logsContainer.firstChild.remove();
    }

    if (details.recentLogs.length === 0) {
      const noLogsMsg = document.createElement('div');
      noLogsMsg.style.color = 'var(--muted)';
      noLogsMsg.textContent = 'No recent logs';
      logsContainer.appendChild(noLogsMsg);
    } else {
      details.recentLogs.forEach((log) => {
        let color = 'var(--text)';
        if (
          log.toLowerCase().includes('failed') ||
          log.toLowerCase().includes('error') ||
          log.toLowerCase().includes('down') ||
          log.toLowerCase().includes('unhealthy')
        )
          color = 'var(--danger)';
        else if (log.toLowerCase().includes('success') || log.toLowerCase().includes('healthy'))
          color = 'var(--success)';
        else if (log.toLowerCase().includes('processing')) color = 'var(--info)';

        const logElement = document.createElement('div');
        logElement.style.color = color;
        logElement.textContent = log; // Safe: textContent doesn't execute HTML
        logsContainer.appendChild(logElement);
      });
    }
  } else if (logsContainer) {
    // Clear existing content safely
    while (logsContainer.firstChild) {
      logsContainer.firstChild.remove();
    }
    const noLogsMsg = document.createElement('div');
    noLogsMsg.style.color = 'var(--muted)';
    noLogsMsg.textContent = 'No logs available';
    logsContainer.appendChild(noLogsMsg);
  }
}

function updateSLAContainer(detailRow, details) {
  // Render SLA Scorecard if container/data exists
  const slaContainer = detailRow.querySelector('.sla-scorecard-container');
  if (slaContainer && details.sla) {
    const s = details.sla;

    // Clear existing content safely
    while (slaContainer.firstChild) {
      slaContainer.firstChild.remove();
    }

    // Create main container
    const mainDiv = document.createElement('div');
    mainDiv.style.border = '1px solid var(--border)';
    mainDiv.style.borderRadius = '6px';
    mainDiv.style.padding = '10px';
    mainDiv.style.background = 'var(--input-bg)';

    // Create header
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.marginBottom = '8px';
    headerDiv.style.borderBottom = '1px solid var(--border)';
    headerDiv.style.paddingBottom = '4px';

    const titleStrong = document.createElement('strong');
    titleStrong.style.fontSize = '13px';
    titleStrong.textContent = 'SLA Status';

    const statusSpan = document.createElement('span');
    // Extract nested ternary for better readability
    let statusClass;
    if (s.status === 'pass') {
      statusClass = 'active';
    } else if (s.status === 'fail') {
      statusClass = 'error';
    } else {
      statusClass = 'warning';
    }
    statusSpan.className = `status-badge status-${statusClass}`;
    statusSpan.textContent = s.status.toUpperCase();

    headerDiv.appendChild(titleStrong);
    headerDiv.appendChild(statusSpan);
    mainDiv.appendChild(headerDiv);

    // Create checks container
    const checksDiv = document.createElement('div');
    checksDiv.className = 'sla-checks';

    if (s.checks && Object.keys(s.checks).length > 0) {
      Object.entries(s.checks).forEach(([key, val]) => {
        // Extract nested ternary for better readability
        let color;
        if (val.status === 'pass') {
          color = 'var(--success)';
        } else if (val.status === 'fail') {
          color = 'var(--danger)';
        } else {
          color = 'var(--warning)';
        }

        const checkDiv = document.createElement('div');
        checkDiv.style.display = 'flex';
        checkDiv.style.justifyContent = 'space-between';
        checkDiv.style.fontSize = '12px';
        checkDiv.style.marginBottom = '4px';

        const keySpan = document.createElement('span');
        keySpan.textContent = key; // Safe: textContent

        const valueSpan = document.createElement('span');
        valueSpan.style.color = color;
        valueSpan.textContent = `${val.value} (msg: ${val.status})`; // Safe: textContent

        checkDiv.appendChild(keySpan);
        checkDiv.appendChild(valueSpan);
        checksDiv.appendChild(checkDiv);
      });
    } else {
      const noChecksDiv = document.createElement('div');
      noChecksDiv.className = 'text-muted';
      noChecksDiv.textContent = 'No checks';
      checksDiv.appendChild(noChecksDiv);
    }

    mainDiv.appendChild(checksDiv);

    // Create footer
    const footerDiv = document.createElement('div');
    footerDiv.style.marginTop = '6px';
    footerDiv.style.fontSize = '10px';
    footerDiv.style.color = 'var(--muted)';
    footerDiv.style.textAlign = 'right';
    footerDiv.textContent = `Evaluated: ${new Date(s.evaluatedAt).toLocaleTimeString()}`;

    mainDiv.appendChild(footerDiv);
    slaContainer.appendChild(mainDiv);
  }
}

function updateQueueSummary(queueData) {
  if (!queueData) return;
  const driverEl = document.getElementById('queue-driver');
  const totalEl = document.getElementById('queue-total');
  const jobsEl = document.getElementById('queue-jobs');
  const processingEl = document.getElementById('queue-processing');
  const failedEl = document.getElementById('queue-failed');

  if (driverEl) driverEl.textContent = queueData.driver || '-';
  if (totalEl) totalEl.textContent = String(queueData.totalQueues ?? 0);
  if (jobsEl) jobsEl.textContent = String(queueData.totalJobs ?? 0);
  if (processingEl) processingEl.textContent = String(queueData.processingJobs ?? 0);
  if (failedEl) failedEl.textContent = String(queueData.failedJobs ?? 0);
}

function updateDriverFilter(drivers) {
  const select = document.getElementById('driver-filter');
  if (!select || !Array.isArray(drivers)) return;
  const currentValue = select.value;

  // Clear existing options safely
  while (select.firstChild) {
    select.firstChild.remove();
  }

  // Add "All Drivers" option
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All Drivers';
  select.appendChild(allOption);
  drivers.forEach((driver) => {
    const option = document.createElement('option');
    option.value = driver;
    option.textContent = driver.charAt(0).toUpperCase() + driver.slice(1);
    select.appendChild(option);
  });
  if (drivers.includes(currentValue)) {
    select.value = currentValue;
  }
}

function updateDriversList(drivers) {
  const list = document.getElementById('drivers-list');
  if (!list) return;

  // Clear existing content safely
  while (list.firstChild) {
    list.firstChild.remove();
  }
  if (!Array.isArray(drivers) || drivers.length === 0) {
    return;
  }
  drivers.forEach((driver) => {
    const chip = document.createElement('span');
    chip.className = 'driver-chip';
    chip.textContent = driver;
    list.appendChild(chip);
  });
}

function createWorkerRow(worker) {
  const detailsId = `details-${worker.name.replaceAll(/[^a-z0-9]/gi, '-')}`;

  const row = document.createElement('tr');
  row.className = 'expander';
  row.setAttribute('onclick', `toggleDetails('${detailsId}')`);
  row.dataset.workerName = worker.name;
  row.dataset.workerDriver = worker.driver;

  // Create cells using helper functions
  const nameCell = createNameCell(worker);
  const statusCell = createStatusCell(worker);
  const healthCell = createHealthCell(worker);
  const driverCell = createDriverCell(worker);
  const versionCell = createVersionCell(worker);
  const perfCell = createPerformanceCell();
  const actionCell = createActionCell(worker);

  // Append all cells to row
  row.appendChild(nameCell);
  row.appendChild(statusCell);
  row.appendChild(healthCell);
  row.appendChild(driverCell);
  row.appendChild(versionCell);
  row.appendChild(perfCell);
  row.appendChild(actionCell);

  return { row, detailsId };
}

function createNameCell(worker) {
  const nameCell = document.createElement('td');
  const nameDiv = document.createElement('div');
  nameDiv.className = 'worker-name';
  nameDiv.textContent = worker.name; // Safe: textContent
  const queueDiv = document.createElement('div');
  queueDiv.className = 'worker-queue';
  queueDiv.textContent = worker.queueName; // Safe: textContent
  nameCell.appendChild(nameDiv);
  nameCell.appendChild(queueDiv);
  return nameCell;
}

function createStatusCell(worker) {
  const statusCell = document.createElement('td');
  const statusSpan = document.createElement('span');
  statusSpan.className = `status-badge status-${worker.status}`;
  const statusDot = document.createElement('span');
  statusDot.className = 'status-dot';
  const statusText = document.createTextNode(
    worker.status.charAt(0).toUpperCase() + worker.status.slice(1)
  );
  statusSpan.appendChild(statusDot);
  statusSpan.appendChild(statusText);
  statusCell.appendChild(statusSpan);
  return statusCell;
}

function createHealthCell(worker) {
  const healthCell = document.createElement('td');
  const healthDiv = document.createElement('div');
  healthDiv.className = 'health-indicator';
  const healthDot = document.createElement('span');
  healthDot.className = `health-dot health-${worker.health.status}`;
  const healthText = document.createTextNode(
    worker.health.status.charAt(0).toUpperCase() + worker.health.status.slice(1)
  );
  healthDiv.appendChild(healthDot);
  healthDiv.appendChild(healthText);
  healthCell.appendChild(healthDiv);
  return healthCell;
}

function createDriverCell(worker) {
  const driverCell = document.createElement('td');
  const driverSpan = document.createElement('span');
  driverSpan.className = 'driver-badge';
  driverSpan.textContent = worker.driver; // Safe: textContent
  driverCell.appendChild(driverSpan);
  return driverCell;
}

function createVersionCell(worker) {
  const versionCell = document.createElement('td');
  const versionSpan = document.createElement('span');
  versionSpan.className = 'version-badge';
  versionSpan.textContent = `v${worker.version}`; // Safe: textContent
  versionCell.appendChild(versionSpan);
  return versionCell;
}

function createPerformanceCell() {
  const perfCell = document.createElement('td');
  const perfDiv = document.createElement('div');
  perfDiv.className = 'performance-icons';

  // Add performance icons (SVG is safe as it's static)
  perfDiv.innerHTML = `
    <div class="perf-icon processed" title="Processed Jobs">
      <svg class="icon" viewBox="0 0 24 24">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
        <polyline points="23 6 23 12 17 12" />
        <polyline points="1 18 1 12 7 12" />
      </svg>
    </div>
    <div class="perf-icon avg-time" title="Average Time">
      <svg class="icon" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 12 12" />
      </svg>
    </div>
    <div class="perf-icon memory" title="Memory Usage">
      <svg class="icon" viewBox="0 0 24 24">
        <path d="M13 2H3a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-6-6z" />
        <polyline points="13 2 13 8 20 8" />
      </svg>
    </div>
  `;
  perfCell.appendChild(perfDiv);
  return perfCell;
}

function createActionCell(worker) {
  const actionCell = document.createElement('td');
  const actionDiv = document.createElement('div');
  actionDiv.className = 'actions-cell';

  const startBtn = createActionButton('start', 'Start', () =>
    startWorker(worker.name, worker.driver)
  );
  const stopBtn = createActionButton('stop', 'Stop', () => stopWorker(worker.name, worker.driver));
  const restartBtn = createActionButton('restart', 'Restart', () =>
    restartWorker(worker.name, worker.driver)
  );
  const deleteBtn = createActionButton('delete', 'Delete', () =>
    deleteWorker(worker.name, worker.driver)
  );

  actionDiv.appendChild(startBtn);
  actionDiv.appendChild(stopBtn);
  actionDiv.appendChild(restartBtn);
  actionDiv.appendChild(deleteBtn);
  actionCell.appendChild(actionDiv);
  return actionCell;
}

function createActionButton(type, title, onClickHandler) {
  const button = document.createElement('button');
  button.className = `action-btn ${type}`;
  button.title = title;
  button.onclick = function (event) {
    event.stopPropagation();
    onClickHandler();
  };

  // Create SVG icon based on button type
  const svg = createButtonIcon(type);
  button.appendChild(svg);

  return button;
}

function createButtonIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.viewBox = '0 0 24 24';

  switch (type) {
    case 'start': {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.points = '5 3 19 12 5 21 5 3';
      svg.appendChild(polygon);
      break;
    }
    case 'stop': {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.x = '3';
      rect.y = '3';
      rect.width = '18';
      rect.height = '18';
      rect.rx = '2';
      rect.ry = '2';
      svg.appendChild(rect);
      break;
    }
    case 'restart': {
      const polyline1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline1.points = '23 4 23 10 17 10';
      const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline2.points = '1 20 1 14 7 14';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.d = 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15';
      svg.appendChild(polyline1);
      svg.appendChild(polyline2);
      svg.appendChild(path);
      break;
    }
    case 'delete': {
      const deletePolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      deletePolyline.points = '3 6 5 6 21 6';
      const deletePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      deletePath.d =
        'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2';
      const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.x1 = '10';
      line1.y1 = '11';
      line1.x2 = '10';
      line1.y2 = '17';
      const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line2.x1 = '14';
      line2.y1 = '11';
      line2.x2 = '14';
      line2.y2 = '17';
      svg.appendChild(deletePolyline);
      svg.appendChild(deletePath);
      svg.appendChild(line1);
      svg.appendChild(line2);
      break;
    }
  }

  return svg;
}

function createDetailRow(worker, detailsId) {
  const detailRow = document.createElement('tr');
  detailRow.className = 'expandable-row';
  detailRow.id = detailsId;
  detailRow.dataset.workerName = worker.name;
  detailRow.dataset.workerDriver = worker.driver;

  // Delegate HTML creation to specialized function
  detailRow.innerHTML = createDetailRowHTML(worker);

  return detailRow;
}

function createDetailRowHTML(worker) {
  return `
          <td colspan="7" class="details-cell">
            <div class="details-content">
              <div class="details-grid">

                <div class="detail-section">
                  <h4>Configuration</h4>
                  <div class="detail-item">
                    <span>Queue Name</span>
                    <span data-key="configuration.queueName">${worker.queueName}</span>
                  </div>
                  <div class="detail-item">
                    <span>Concurrency</span>
                    <span data-key="configuration.concurrency">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Auto Start</span>
                    <label class="auto-start-toggle" onclick="event.stopPropagation()">
                      <input type="checkbox" ${worker.autoStart ? 'checked' : ''} onchange="toggleAutoStart('${worker.name}', '${worker.driver}', this.checked)">
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                  <div class="detail-item">
                    <span>Driver</span>
                    <span data-key="configuration.driver">${worker.driver}</span>
                  </div>
                  <div class="detail-item">
                    <span>Version</span>
                    <span data-key="configuration.version">v${worker.version}</span>
                  </div>
                </div>

                <div class="detail-section">
                  <h4>Metrics</h4>
                  <div class="detail-item">
                    <span>Processed</span>
                    <span data-key="metrics.processed">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Failed</span>
                    <span data-key="metrics.failed">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Avg Time</span>
                    <span data-key="metrics.avgTime">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Memory</span>
                    <span data-key="metrics.memory">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Uptime Trend</span>
                    <span data-key="metrics.uptimeTrend">-</span>
                  </div>
                  </div>
                  <!-- Added via new plan logic: Trend (via JS update only for now) -->
                </div>


                <div class="detail-section">
                  <h4>Recent Logs (History)</h4>
                  <div class="recent-logs-container" style="
                      font-family: monospace;
                      font-size: 11px;
                      line-height: 1.6;
                      color: var(--text);
                      background: var(--input-bg);
                      padding: 12px;
                      border-radius: 8px;
                      border: 1px solid var(--border);
                      max-height: 200px;
                      overflow-y: auto;
                    ">
                    <div class="logs-content">Loading logs...</div>
                  </div>
                </div>

              </div>
            </div>
          </td>
`;
}

function renderWorkers(data) {
  const tbody = document.getElementById('workers-tbody');
  if (!tbody) return;

  const expandedWorkers = new Set(
    Array.from(tbody.querySelectorAll('.expandable-row.open'))
      .map((row) => row.getAttribute('id')?.replace('details-', ''))
      .filter(Boolean)
  );

  // Clear existing content safely
  while (tbody.firstChild) {
    tbody.firstChild.remove();
  }

  if (!data.workers || data.workers.length === 0) {
    const noWorkersRow = document.createElement('tr');
    const noWorkersCell = document.createElement('td');
    noWorkersCell.colSpan = '7';
    noWorkersCell.className = 'text-center p-4';
    noWorkersCell.textContent = 'No workers found';
    noWorkersRow.appendChild(noWorkersCell);
    tbody.appendChild(noWorkersRow);

    updateQueueSummary(data.queueData);
    updateDriverFilter(data.drivers);
    updateDriversList(data.drivers);
    updatePagination(data.pagination);
    return;
  }

  data.workers.forEach((worker) => {
    const { row, detailsId } = createWorkerRow(worker);
    const detailRow = createDetailRow(worker, detailsId);

    const normalizedName = worker.name.replaceAll(/[^a-z0-9]/gi, '-');
    if (expandedWorkers.has(normalizedName)) {
      detailRow.classList.add('open');
      ensureWorkerDetails(worker.name, detailRow, worker.driver);
    }

    tbody.appendChild(row);
    tbody.appendChild(detailRow);
  });

  updateQueueSummary(data.queueData);
  updateDriverFilter(data.drivers);
  updateDriversList(data.drivers);
  updatePagination(data.pagination);
}

function toggleDetails(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    const isOpen = row.classList.toggle('open');
    if (isOpen) {
      const workerName = row.dataset.workerName || rowId.replace('details-', '');
      const workerDriver = row.dataset.workerDriver;
      ensureWorkerDetails(workerName, row, workerDriver);
    }
  }
}

function updatePagination(pagination) {
  currentPage = pagination.page;
  totalPages = pagination.totalPages;
  totalWorkers = pagination.total;

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);

  document.getElementById('pagination-info').textContent =
    `Showing ${totalWorkers === 0 ? 0 : start}-${end} of ${totalWorkers} workers`;

  document.getElementById('prev-btn').disabled = !pagination.hasPrev;
  document.getElementById('next-btn').disabled = !pagination.hasNext;

  // Update page numbers
  const pageNumbers = document.getElementById('page-numbers');

  // Clear existing content safely
  while (pageNumbers.firstChild) {
    pageNumbers.firstChild.remove();
  }

  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    btn.textContent = i.toString();
    btn.onclick = () => goToPage(i);
    pageNumbers.appendChild(btn);
  }
}

function loadPage(direction) {
  if (direction === 'prev' && currentPage > 1) {
    currentPage--;
  } else if (direction === 'next' && currentPage < totalPages) {
    currentPage++;
  }
  fetchData();
}

function goToPage(page) {
  currentPage = page;
  fetchData();
}

// Worker actions
async function startWorker(name, driver) {
  try {
    await fetch(`${API_BASE}/api/workers/${name}/start?driver=${driver}`, { method: 'POST' });
    fetchData();
  } catch (err) {
    console.error('Failed to start worker:', err);
  }
}

async function stopWorker(name, driver) {
  try {
    await fetch(`${API_BASE}/api/workers/${name}/stop?driver=${driver}`, { method: 'POST' });
    fetchData();
  } catch (err) {
    console.error('Failed to stop worker:', err);
  }
}

async function restartWorker(name, driver) {
  try {
    await fetch(`${API_BASE}/api/workers/${name}/restart?driver=${driver}`, {
      method: 'POST',
    });
    fetchData();
  } catch (err) {
    console.error('Failed to restart worker:', err);
  }
}

async function deleteWorker(name, driver) {
  if (!confirm(`Are you sure you want to delete worker "${name}"? This action cannot be undone.`)) {
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/workers/${name}?driver=${driver}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete worker');
    fetchData();
  } catch (err) {
    console.error('Failed to delete worker:', err);
    alert('Failed to delete worker: ' + err.message);
  }
}

async function toggleAutoStart(name, driver, enabled) {
  try {
    await fetch(`${API_BASE}/api/workers/${name}/auto-start?driver=${driver}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  } catch (err) {
    console.error('Failed to toggle auto-start:', err);
  }
}

function showAddWorkerModal() {
  // TODO: Implement add worker modal
  alert('Add Worker functionality coming soon!');
}

function toggleAutoRefresh() {
  setAutoRefresh(!autoRefreshEnabled);
}

// Auto-refresh
function setAutoRefresh(enabled) {
  autoRefreshEnabled = enabled;
  localStorage.setItem(AUTO_REFRESH_KEY, enabled.toString());

  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  if (enabled) {
    refreshTimer = setInterval(fetchData, 30000);
  }

  const btn = document.getElementById('auto-refresh-toggle');
  const icon = document.getElementById('auto-refresh-icon');
  const label = document.getElementById('auto-refresh-label');

  if (btn && icon && label) {
    if (enabled) {
      label.textContent = 'Pause Refresh';
      // Clear existing content
      while (icon.firstChild) {
        icon.firstChild.remove();
      }
      // Create pause icon
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect1.setAttribute('x', '6');
      rect1.setAttribute('y', '4');
      rect1.setAttribute('width', '4');
      rect1.setAttribute('height', '16');
      const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect2.setAttribute('x', '14');
      rect2.setAttribute('y', '4');
      rect2.setAttribute('width', '4');
      rect2.setAttribute('height', '16');
      svg.appendChild(rect1);
      svg.appendChild(rect2);
      icon.appendChild(svg);
    } else {
      label.textContent = 'Auto Refresh';
      // Clear existing content
      while (icon.firstChild) {
        icon.firstChild.remove();
      }
      // Create play icon
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '5 3 19 12 5 21 5 3');
      svg.appendChild(polygon);
      icon.appendChild(svg);
    }
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme
  currentTheme = getPreferredTheme();
  applyTheme(currentTheme);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Set up event listeners
  document.getElementById('status-filter').addEventListener('change', fetchData);
  document.getElementById('driver-filter').addEventListener('change', fetchData);
  document.getElementById('sort-select').addEventListener('change', fetchData);

  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      currentPage = 1;
      fetchData();
    });
  }
  document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentPage = 1;
      fetchData();
    }
  });

  // Initialize auto-refresh
  const storedAutoRefresh = localStorage.getItem(AUTO_REFRESH_KEY);
  if (storedAutoRefresh === null) {
    // Only use default if no value is stored
    setAutoRefresh(true);
  } else {
    // Use stored value
    setAutoRefresh(storedAutoRefresh === 'true');
  }
  // Load initial data
  fetchData();
});
