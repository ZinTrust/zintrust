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

// Helper function to get DOM elements
function getDomElements() {
  return {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    content: document.getElementById('workers-content'),
    searchBtn: document.getElementById('search-btn'),
  };
}

// Helper function to show loading state
function showLoadingState(elements) {
  if (elements.content.style.display === 'none') {
    elements.loading.style.display = 'block';
  } else {
    elements.content.style.opacity = '0.5';
  }
  elements.error.style.display = 'none';
  if (elements.searchBtn) elements.searchBtn.disabled = true;
}

// Helper function to hide loading state
function hideLoadingState(elements) {
  elements.loading.style.display = 'none';
  elements.content.style.display = 'block';
  elements.content.style.opacity = '1';
  if (elements.searchBtn) elements.searchBtn.disabled = false;
}

// Helper function to handle fetch error
function handleFetchError(elements, error) {
  console.error('Error fetching workers:', error);
  hideLoadingState(elements);
  elements.error.style.display = 'block';
}

// Helper function to validate worker data
function validateWorkerData(data) {
  if (!data || !data.workers || !Array.isArray(data.workers)) {
    console.error('Invalid worker data structure:', data);
    return false;
  }
  return true;
}

// Data fetching
async function fetchData() {
  const elements = getDomElements();

  showLoadingState(elements);

  try {
    const query = elements.searchBtn
      ? elements.searchBtn.parentElement?.parentElement?.querySelector('input')?.value
      : '';
    const limit = localStorage.getItem(PAGE_SIZE_KEY) || '100';

    const params = new URLSearchParams({
      page: currentPage.toString(),
      limit: limit,
      status: document.getElementById('status-filter')?.value || '',
      driver: document.getElementById('driver-filter')?.value || '',
      sortBy: document.getElementById('sort-select')?.value || 'name',
      sortOrder: 'asc',
      search: query,
    });

    const response = await fetch(API_BASE + '/api/workers?' + params.toString());
    if (!response.ok) {
      console.error('Failed to fetch workers:', response.statusText);
      hideLoadingState(elements);
      elements.error.style.display = 'block';
      return;
    }

    const data = await response.json();
    console.log('Worker data received:', data);

    if (!validateWorkerData(data)) {
      elements.error.style.display = 'block';
      hideLoadingState(elements);
      return;
    }

    console.log('Rendering', data.workers.length, 'workers');
    renderWorkers(data);
    hideLoadingState(elements);
  } catch (err) {
    handleFetchError(elements, err);
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

// Helper to safe access nested properties (shared across functions)
const get = (obj, path) => path.split('.').reduce((o, i) => (o ? o[i] : null), obj);

// Helper function to resolve metric value from different data sources
function resolveMetricValue(details, key, originalValue) {
  if (!key.startsWith('metrics.')) return originalValue;

  const metricKey = key.replace('metrics.', '');
  // Try to get from details.metrics first, then from details directly, then from worker
  return (
    get(details, `metrics.${metricKey}`) ||
    get(details, metricKey) ||
    get(details, `details.metrics.${metricKey}`) ||
    originalValue
  );
}

// Helper function to format metric values
function formatMetricValue(key, value) {
  if (value === null || value === undefined) return value;

  switch (key) {
    case 'metrics.processed':
      return Number(value).toLocaleString();
    case 'metrics.avgTime':
      return value + 'ms';
    case 'metrics.memory':
      return value + 'MB';
    case 'metrics.cpu':
      return value + '%';
    case 'metrics.uptime':
      return formatUptime(value);
    case 'health.lastCheck':
      return formatTimeAgo(value);
    default:
      return value;
  }
}

// Helper function to update a single element
function updateDetailElement(el, details) {
  const key = el.dataset.key;
  let value = get(details, key);

  // Resolve metric values from different sources
  value = resolveMetricValue(details, key, value);

  // Format the value
  value = formatMetricValue(key, value);

  // Update element if value is valid
  if (value !== null && value !== undefined && value !== '') {
    el.textContent = value;
  }
}

function updateDetailViews(detailRow, details) {
  if (!details) return;

  // Update all data-key elements
  detailRow.querySelectorAll('[data-key]').forEach(updateDetailElement);

  // Delegate to specialized functions
  updateLogsContainer(detailRow, details);
  updateSLAContainer(detailRow, details);
}

// Helper function to format uptime
function formatUptime(seconds) {
  if (!seconds || seconds === 'N/A') return 'N/A';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
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
  row.dataset.workerName = worker.name;
  row.dataset.workerDriver = worker.driver;

  // Create cells using helper functions
  const nameCell = createNameCell(worker, detailsId);
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

function createNameCell(worker, detailsId) {
  const nameCell = document.createElement('td');

  // Create expandable container
  const nameContainer = document.createElement('div');
  nameContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  `;
  nameContainer.setAttribute('onclick', `toggleDetails('${detailsId}')`);
  nameContainer.setAttribute('title', 'Click to expand worker details');

  // Add expand/collapse icon
  const expandIcon = document.createElement('div');
  expandIcon.className = 'expand-icon';
  expandIcon.id = `expand-icon-${detailsId}`;
  expandIcon.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  `;
  expandIcon.style.cssText = `
    transition: transform 0.2s ease;
    color: var(--muted);
    flex-shrink: 0;
  `;

  // Add worker name
  const nameDiv = document.createElement('div');
  nameDiv.className = 'worker-name';
  nameDiv.textContent = worker.name; // Safe: textContent

  // Add queue name
  const queueDiv = document.createElement('div');
  queueDiv.className = 'worker-queue';
  queueDiv.textContent = worker.queueName; // Safe: textContent
  queueDiv.style.marginLeft = '24px'; // Align with worker name

  // Assemble the structure
  nameContainer.appendChild(expandIcon);
  nameContainer.appendChild(nameDiv);

  nameCell.appendChild(nameContainer);
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

// Helper function to safely extract performance metrics
function getPerformanceMetrics(worker) {
  if (!worker) return { processed: 0, avgTime: 0, memory: 0 };

  const metrics = worker.metrics || {};
  return {
    processed: metrics.processed || worker.processed || 0,
    avgTime: metrics.avgTime || worker.avgTime || 0,
    memory: metrics.memory || worker.memory || 0,
  };
}

// Helper function to create performance icon HTML
function createPerformanceIconHtml(type, value, unit) {
  const icons = {
    processed: `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    `,
    time: `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    `,
    memory: `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    `,
  };

  const titles = {
    processed: 'Processed Jobs',
    time: 'Avg Time',
    memory: 'Memory Usage',
  };

  return `
    <div class="perf-icon ${type}" title="${titles[type]}">
      ${icons[type]}
      <span>${value}${unit}</span>
    </div>
  `;
}

function createPerformanceCell(worker) {
  const perfCell = document.createElement('td');
  const perfDiv = document.createElement('div');
  perfDiv.className = 'performance-icons';

  const metrics = getPerformanceMetrics(worker);
  const processedValue = metrics.processed ? metrics.processed.toLocaleString() : '0';

  perfDiv.innerHTML = `
    ${createPerformanceIconHtml('processed', processedValue, '')}
    ${createPerformanceIconHtml('time', metrics.avgTime, 'ms')}
    ${createPerformanceIconHtml('memory', metrics.memory, 'MB')}
  `;

  perfCell.appendChild(perfDiv);
  return perfCell;
}

function createActionCell(worker) {
  const actionCell = document.createElement('td');
  const actionDiv = document.createElement('div');
  actionDiv.className = 'actions-cell';

  // Toggle visibility based on status
  if (worker.status === 'running') {
    const stopBtn = createActionButton('stop', 'Stop', () =>
      stopWorker(worker.name, worker.driver)
    );
    actionDiv.appendChild(stopBtn);
  } else {
    const startBtn = createActionButton('start', 'Start', () =>
      startWorker(worker.name, worker.driver)
    );
    actionDiv.appendChild(startBtn);
  }

  const restartBtn = createActionButton('restart', 'Restart', () =>
    restartWorker(worker.name, worker.driver)
  );
  const deleteBtn = createActionButton('delete', 'Delete', () =>
    deleteWorker(worker.name, worker.driver)
  );
  const viewJsonBtn = createActionButton('view', 'View JSON', () =>
    viewWorkerJson(worker.name, worker.driver)
  );
  const editJsonBtn = createActionButton('edit', 'Edit JSON', () =>
    editWorkerJson(worker.name, worker.driver)
  );

  actionDiv.appendChild(restartBtn);
  actionDiv.appendChild(deleteBtn);
  actionDiv.appendChild(viewJsonBtn);
  actionDiv.appendChild(editJsonBtn);
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

// Helper functions for creating specific SVG icons
function createStartIcon() {
  const svg = createSvgElement();
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '5 3 19 12 5 21 5 3');
  polygon.setAttribute('fill', 'currentColor');
  svg.appendChild(polygon);
  return svg;
}

function createStopIcon() {
  const svg = createSvgElement();
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '3');
  rect.setAttribute('y', '3');
  rect.setAttribute('width', '18');
  rect.setAttribute('height', '18');
  rect.setAttribute('rx', '2');
  rect.setAttribute('ry', '2');
  rect.setAttribute('fill', 'currentColor');
  svg.appendChild(rect);
  return svg;
}

function createRestartIcon() {
  const svg = createSvgElement();
  const polyline1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline1.setAttribute('points', '23 4 23 10 17 10');
  const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline2.setAttribute('points', '1 20 1 14 7 14');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15');
  svg.appendChild(polyline1);
  svg.appendChild(polyline2);
  svg.appendChild(path);
  return svg;
}

function createDeleteIcon() {
  const svg = createSvgElement();
  const deletePolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  deletePolyline.setAttribute('points', '3 6 5 6 21 6');
  const deletePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  deletePath.setAttribute(
    'd',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'
  );
  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '10');
  line1.setAttribute('y1', '11');
  line1.setAttribute('x2', '10');
  line1.setAttribute('y2', '17');
  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '14');
  line2.setAttribute('y1', '11');
  line2.setAttribute('x2', '14');
  line2.setAttribute('y2', '17');
  svg.appendChild(deletePolyline);
  svg.appendChild(deletePath);
  svg.appendChild(line1);
  svg.appendChild(line2);
  return svg;
}

function createViewIcon() {
  const svg = createSvgElement();
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '3');
  svg.appendChild(path);
  svg.appendChild(circle);
  return svg;
}

function createEditIcon() {
  const svg = createSvgElement();
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7');
  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');
  svg.appendChild(path);
  svg.appendChild(path2);
  return svg;
}

// Create base SVG element with common attributes
function createSvgElement() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function createButtonIcon(type) {
  switch (type) {
    case 'start':
      return createStartIcon();
    case 'stop':
      return createStopIcon();
    case 'restart':
      return createRestartIcon();
    case 'delete':
      return createDeleteIcon();
    case 'view':
      return createViewIcon();
    case 'edit':
      return createEditIcon();
    default:
      return createSvgElement();
  }
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

// Helper function to create Configuration section HTML
function createConfigurationSection(worker) {
  return `
    <div class="detail-section">
      <h4>Configuration</h4>
      <div class="detail-item">
        <span>Queue Name</span>
        <span data-key="configuration.queueName">${worker.queueName}</span>
      </div>
      <div class="detail-item">
        <span>Worker Name</span>
        <span data-key="configuration.name">${worker.name}</span>
      </div>
      <div class="detail-item">
        <span>Driver</span>
        <span data-key="configuration.driver">${worker.driver}</span>
      </div>
      <div class="detail-item">
        <span>Version</span>
        <span data-key="configuration.version">v${worker.version}</span>
      </div>
      <div class="detail-item">
        <span>Auto Start</span>
        <label class="auto-start-toggle" onclick="event.stopPropagation()">
          <input type="checkbox" ${worker.autoStart ? 'checked' : ''} onchange="toggleAutoStart('${worker.name}', '${worker.driver}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="detail-item">
        <span>Status</span>
        <span data-key="configuration.status">${worker.status}</span>
      </div>
    </div>
  `;
}

// Helper function to create Performance Metrics section HTML
function createPerformanceMetricsSection(worker) {
  return `
    <div class="detail-section">
      <h4>Performance Metrics</h4>
      <div class="detail-item">
        <span>Processed Jobs</span>
        <span data-key="metrics.processed">${worker.processed.toLocaleString()}</span>
      </div>
      <div class="detail-item">
        <span>Failed Jobs</span>
        <span data-key="metrics.failed">${worker.failed || 0}</span>
      </div>
      <div class="detail-item">
        <span>Average Time</span>
        <span data-key="metrics.avgTime">${worker.avgTime}ms</span>
      </div>
      <div class="detail-item">
        <span>Memory Usage</span>
        <span data-key="metrics.memory">${worker.memory}MB</span>
      </div>
      <div class="detail-item">
        <span>CPU Usage</span>
        <span data-key="metrics.cpu">${worker.cpu || 'N/A'}</span>
      </div>
      <div class="detail-item">
        <span>Uptime</span>
        <span data-key="metrics.uptime">${worker.uptime || 'N/A'}</span>
      </div>
    </div>
  `;
}

// Helper function to create Health & Status section HTML
function createHealthStatusSection(worker) {
  return `
    <div class="detail-section">
      <h4>Health & Status</h4>
      <div class="detail-item">
        <span>Health Status</span>
        <span data-key="health.status">${worker.health?.status || 'unknown'}</span>
      </div>
      <div class="detail-item">
        <span>Last Check</span>
        <span data-key="health.lastCheck" class="last-check">${formatTimeAgo(worker.health?.lastCheck)}</span>
      </div>
      <div class="detail-item">
        <span>Health Checks</span>
        <div class="health-checks">
          ${renderHealthChecks(worker.health?.checks)}
        </div>
      </div>
      <div class="detail-item">
        <span>Worker Status</span>
        <span data-key="status" class="status-badge status-${worker.status}">${worker.status}</span>
      </div>
    </div>
  `;
}

// Helper function to render health checks
function renderHealthChecks(checks) {
  if (!checks || !Array.isArray(checks) || checks.length === 0) {
    return '<span class="no-checks">No health checks available</span>';
  }

  return checks
    .map(
      (check) => `
    <div class="health-check">
      <span class="check-name">${check.name}</span>
      <span class="check-status status-${check.status}">${check.status}</span>
      ${check.message ? `<span class="check-message">${check.message}</span>` : ''}
    </div>
  `
    )
    .join('');
}

// Helper function to format time as "ago"
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never';

  const now = new Date();
  const checkTime = new Date(timestamp);
  const diffMs = now - checkTime;

  if (diffMs < 0) return 'Just now';

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return diffSeconds <= 1 ? 'Just now' : `${diffSeconds}s ago`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return checkTime.toLocaleDateString();
  }
}

// Helper function to create Recent Logs section HTML
function createRecentLogsSection(worker) {
  return `
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
        <div class="logs-content">
          ${
            worker.details?.recentLogs
              ?.map(
                (log) => `
            <div class="log-entry log-${log.level.toLowerCase()}">
              <span class="log-timestamp">[${log.timestamp}]</span>
              <span class="log-level">${log.level.toUpperCase()}</span>
              <span class="log-message">${log.message}</span>
            </div>
          `
              )
              .join('') || '<div class="no-logs">No recent logs available</div>'
          }
        </div>
      </div>
    </div>
  `;
}

function createDetailRowHTML(worker) {
  return `
          <td colspan="7" class="details-cell">
            <div class="details-content">
              <div class="details-grid">
                ${createConfigurationSection(worker)}
                ${createPerformanceMetricsSection(worker)}
                ${createHealthStatusSection(worker)}
                ${createRecentLogsSection(worker)}
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

    // Rotate expand icon
    const expandIcon = document.getElementById(`expand-icon-${rowId}`);
    if (expandIcon) {
      expandIcon.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
    }

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

// Helper function to create modal overlay
function createModalOverlay() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  `;
  return modal;
}

// Helper function to create modal content
function createModalContent() {
  const content = document.createElement('div');
  content.className = 'modal-content json-modal';
  content.style.cssText = `
    background: var(--card);
    padding: 24px;
    border-radius: 12px;
    max-width: 90%;
    max-height: 90%;
    overflow: auto;
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--border);
    min-width: 400px;
  `;
  return content;
}

// Helper function to create modal header
function createModalHeader(name, onClose) {
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  `;

  const title = document.createElement('h3');
  title.textContent = `Worker JSON: ${name}`;
  title.style.cssText = `
    margin: 0;
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  closeBtn.className = 'btn-close';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  `;
  closeBtn.onmouseover = function () {
    closeBtn.style.color = 'var(--text)';
  };
  closeBtn.onmouseout = function () {
    closeBtn.style.color = 'var(--muted)';
  };
  closeBtn.onclick = onClose;

  header.appendChild(title);
  header.appendChild(closeBtn);
  return header;
}

// Helper function to create JSON display
function createJsonDisplay(jsonContent) {
  const pre = document.createElement('pre');
  pre.textContent = jsonContent;
  pre.style.cssText = `
    background: var(--input-bg);
    color: var(--text);
    padding: 16px;
    border-radius: 8px;
    overflow: auto;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
    font-size: 13px;
    line-height: 1.5;
    max-height: 500px;
    border: 1px solid var(--border);
    white-space: pre-wrap;
    word-wrap: break-word;
  `;
  return pre;
}

// Helper function to create copy button
function createCopyButton(jsonContent) {
  const actions = document.createElement('div');
  actions.style.cssText = `
    display: flex;
    gap: 12px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  `;

  const copyBtn = document.createElement('button');
  copyBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    Copy JSON
  `;
  copyBtn.className = 'btn';
  copyBtn.style.cssText = `
    display: flex;
    align-items: center;
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.2s;
  `;
  copyBtn.onmouseover = function () {
    copyBtn.style.background = 'var(--accent-hover)';
  };
  copyBtn.onmouseout = function () {
    copyBtn.style.background = 'var(--accent)';
  };
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(jsonContent);
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
      `;
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  actions.appendChild(copyBtn);
  return actions;
}

// Helper function to setup modal event handlers
function setupModalHandlers(modal) {
  // Only close on explicit close button click - not on backdrop click or ESC
  // This ensures developers intentionally close the modal

  // Prevent body scroll when modal is open
  document.body.style.overflow = 'hidden';
  modal.addEventListener('remove', () => {
    document.body.style.overflow = '';
  });
}

// View worker JSON data
async function viewWorkerJson(name, driver) {
  try {
    const response = await fetch(`${API_BASE}/api/workers/${name}/details?driver=${driver}`);
    if (!response.ok) {
      throw new Error('Failed to fetch worker data');
    }

    const data = await response.json();
    const jsonContent = JSON.stringify(data, null, 2);

    // Create modal components
    const modal = createModalOverlay();
    const content = createModalContent();
    const header = createModalHeader(name, () => modal.remove());
    const jsonDisplay = createJsonDisplay(jsonContent);
    const copyButton = createCopyButton(jsonContent);

    // Assemble modal
    content.appendChild(header);
    content.appendChild(jsonDisplay);
    content.appendChild(copyButton);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Setup event handlers
    setupModalHandlers(modal);
  } catch (err) {
    console.error('Failed to view worker JSON:', err);
    alert('Failed to load worker JSON: ' + err.message);
  }
}

// Create modal element with basic styling
function createModal() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;
  return modal;
}

// Create JSON textarea for editing
function createJsonTextarea(jsonContent) {
  const textarea = document.createElement('textarea');
  textarea.value = jsonContent;
  textarea.style.cssText = `
    width: 100%;
    height: 400px;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    resize: vertical;
  `;
  return textarea;
}

// Create save and cancel buttons
function createEditButtons(modal, textarea, name, driver) {
  const buttonDiv = document.createElement('div');
  buttonDiv.style.cssText = `
    margin-top: 15px;
    display: flex;
    gap: 10px;
  `;

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = `
    padding: 8px 16px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding: 8px 16px;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;
  cancelBtn.onclick = () => modal.remove();

  saveBtn.onclick = async () => {
    try {
      const updatedData = JSON.parse(textarea.value);
      // Use the new edit endpoint that has withCreateWorkerValidation
      const updateResponse = await fetch(`${API_BASE}/api/workers/${name}/edit?driver=${driver}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update worker');
      }

      alert('Worker updated successfully!');
      modal.remove();
      fetchData(); // Refresh the data
    } catch (error) {
      alert('Invalid JSON: ' + error.message);
    }
  };

  buttonDiv.appendChild(saveBtn);
  buttonDiv.appendChild(cancelBtn);
  return buttonDiv;
}

// Edit worker JSON data
async function editWorkerJson(name, driver) {
  try {
    // Get direct driver data for editing (raw persisted data without enrichment)
    const response = await fetch(`${API_BASE}/api/workers/${name}/driver-data?driver=${driver}`);
    if (!response.ok) {
      throw new Error('Failed to fetch worker driver data');
    }

    const data = await response.json();
    const jsonContent = JSON.stringify(data.data, null, 2);

    // Create modal components
    const modal = createModal();
    const content = createModalContent();
    const title = document.createElement('h3');
    title.textContent = `Edit Worker JSON: ${name}`;
    title.style.marginBottom = '15px';

    // Add warning about immutable fields
    const warning = document.createElement('div');
    warning.style.cssText = `
      background-color: var(--warning-bg, #fff3cd);
      border: 1px solid var(--warning-border, #ffeaa7);
      color: var(--warning-text, #856404);
      padding: 10px;
      margin-bottom: 15px;
      border-radius: 4px;
      font-size: 14px;
    `;
    warning.innerHTML = `
      <strong>⚠️ Note:</strong> Worker name (<code>${name}</code>) and driver (<code>${driver}</code>) cannot be changed.
      Only other configuration fields can be modified.
    `;

    const textarea = createJsonTextarea(jsonContent);
    const buttonDiv = createEditButtons(modal, textarea, name, driver);

    // Assemble modal
    content.appendChild(title);
    content.appendChild(warning);
    content.appendChild(textarea);
    content.appendChild(buttonDiv);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Only close on explicit close button click - not on backdrop click or ESC
    // This ensures developers intentionally close the modal

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    modal.addEventListener('remove', () => {
      document.body.style.overflow = '';
    });
  } catch (err) {
    console.error('Failed to edit worker JSON:', err);
    alert('Failed to load worker JSON: ' + err.message);
  }
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
