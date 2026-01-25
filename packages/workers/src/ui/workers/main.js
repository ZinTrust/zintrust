/* eslint-disable no-console */
// Configuration
const API_BASE = '';

const THEME_KEY = 'zintrust-workers-dashboard-theme';
const AUTO_REFRESH_KEY = 'zintrust-workers-dashboard-auto-refresh';
const PAGE_SIZE_KEY = 'zintrust-workers-dashboard-page-size';
const BULK_AUTO_START_KEY = 'zintrust-workers-dashboard-bulk-auto-start';

let currentPage = 1;
let totalPages = 1;
let totalWorkers = 0;
let autoRefreshEnabled = true;
let refreshTimer = null;
let currentTheme = null;
let bulkAutoStartEnabled = false;
const lastWorkers = [];
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

function changeLimit(newLimit) {
  localStorage.setItem(PAGE_SIZE_KEY, newLimit);
  currentPage = 1;
  fetchData();
}

async function ensureWorkerDetails(workerName, detailRow, driver) {
  if (!workerName || !detailRow) return;
  if (!detailsCache.has(workerName)) {
    try {
      // Validate driver before making request
      if (driver && !['db', 'redis', 'memory'].includes(driver)) {
        console.error('Invalid driver specified');
        return;
      }

      // Fetch base details AND monitoring data in parallel to implement the plan
      const [detailsRes, historyRes, trendRes, slaRes] = await Promise.all([
        fetch(API_BASE + '/api/workers/' + workerName + '/details?driver=' + driver),
        fetch(API_BASE + '/api/workers/' + workerName + '/monitoring/history?limit=50'),
        fetch(API_BASE + '/api/workers/' + workerName + '/monitoring/trend'),
        fetch(API_BASE + '/api/workers/' + workerName + '/sla/status'),
      ]);

      const data = {};

      if (detailsRes.ok) {
        const json = await detailsRes.json();
        Object.assign(data, json);
      }

      if (slaRes.ok) {
        const slaJson = await slaRes.json();
        if (slaJson.status) {
          if (!data.details) data.details = {};
          data.details.sla = slaJson.status;
        }
      }

      // Augment/Overwrite with monitoring data
      if (historyRes.ok) {
        const historyJson = await historyRes.json();
        if (historyJson.history && Array.isArray(historyJson.history)) {
          // Format history as logs
          const formattedLogs = historyJson.history.map((h) => {
            const time = new Date(h.timestamp).toLocaleTimeString();
            const msg = h.message ? ` - ${h.message}` : '';
            return `[${time}] ${h.status.toUpperCase()} (${h.latency}ms)${msg}`;
          });

          if (!data.details) data.details = {};
          // Prepend to existing logs or replace? replacing seems safer for "monitoring history" view
          data.details.recentLogs = formattedLogs;
        }
      }

      if (trendRes.ok) {
        const trendJson = await trendRes.json();
        if (trendJson.trend) {
          if (!data.details) data.details = {};
          if (!data.details.metrics) data.details.metrics = {};
          // Add trend uptime to metrics
          data.details.metrics.uptimeTrend = (trendJson.trend.uptime * 100).toFixed(1) + '%';
          if (trendJson.trend.samples) data.details.metrics.samples = trendJson.trend.samples;
        }
      }

      if (detailsCache.size >= MAX_CACHE_SIZE) {
        const firstKey = detailsCache.keys().next().value;
        detailsCache.delete(firstKey);
      }
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
    const key = el.getAttribute('data-key');
    let value = get(details, key);

    // Format specific fields
    if (key === 'metrics.processed' && value != null) value = Number(value).toLocaleString();
    if (key === 'metrics.avgTime' && value != null) value = value + 'ms';
    if (key === 'metrics.memory' && value != null) value = value + 'MB';

    if (value !== null && value !== undefined) {
      el.textContent = value;
    }
  });

  // Special handling for new trend metrics if element exists (it needs to be added to HTML to show up)
  // For now, we just ensure existing data populates.

  // Handle logs if present
  const logsContainer = detailRow.querySelector('.logs-content');
  if (logsContainer && details.recentLogs && Array.isArray(details.recentLogs)) {
    if (details.recentLogs.length === 0) {
      logsContainer.innerHTML = '<div style="color: var(--muted)">No recent logs</div>';
    } else {
      logsContainer.innerHTML = details.recentLogs
        .map((log) => {
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

          return '<div style="color: ' + color + '">' + log + '</div>';
        })
        .join('');
    }
  } else if (logsContainer) {
    logsContainer.innerHTML = '<div style="color: var(--muted)">No logs available</div>';
  }

  // Render SLA Scorecard if container/data exists
  const slaContainer = detailRow.querySelector('.sla-scorecard-container');
  if (slaContainer && details.sla) {
    const s = details.sla;
    const checksHtml = Object.entries(s.checks || {})
      .map(([key, val]) => {
        const color =
          val.status === 'pass'
            ? 'var(--success)'
            : val.status === 'fail'
              ? 'var(--danger)'
              : 'var(--warning)';
        return `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
           <span>${key}</span>
           <span style="color:${color}">${val.value} (msg: ${val.status})</span>
         </div>`;
      })
      .join('');

    slaContainer.innerHTML = `
      <div style="border: 1px solid var(--border); border-radius: 6px; padding: 10px; background: var(--input-bg);">
         <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid var(--border); padding-bottom:4px;">
            <strong style="font-size:13px">SLA Status</strong>
            <span class="status-badge status-${s.status === 'pass' ? 'active' : s.status === 'fail' ? 'error' : 'warning'}">${s.status.toUpperCase()}</span>
         </div>
         <div class="sla-checks">${checksHtml || '<div class="text-muted">No checks</div>'}</div>
         <div style="margin-top:6px; font-size:10px; color:var(--muted); text-align:right">Evaluated: ${new Date(s.evaluatedAt).toLocaleTimeString()}</div>
      </div>
    `;
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
  select.innerHTML = '<option value="">All Drivers</option>';
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
  list.innerHTML = '';
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
  const detailsId = `details-${worker.name.replace(/[^a-z0-9]/gi, '-')}`;

  const row = document.createElement('tr');
  row.className = 'expander';
  row.setAttribute('onclick', `toggleDetails('${detailsId}')`);
  row.setAttribute('data-worker-name', worker.name);
  row.setAttribute('data-worker-driver', worker.driver);

  row.innerHTML = `
          <td>
              <div class="worker-name">${worker.name}</div>
              <div class="worker-queue">${worker.queueName}</div>
          </td>
          <td>
              <span class="status-badge status-${worker.status}">
                  <span class="status-dot"></span>
                  ${worker.status.charAt(0).toUpperCase() + worker.status.slice(1)}
              </span>
          </td>
          <td>
              <div class="health-indicator">
                  <span class="health-dot health-${worker.health.status}"></span>
                  ${worker.health.status.charAt(0).toUpperCase() + worker.health.status.slice(1)}
              </div>
          </td>
          <td><span class="driver-badge">${worker.driver}</span></td>
          <td><span class="version-badge">v${worker.version}</span></td>
          <td>
              <div class="performance-icons">
                  <div class="perf-icon processed" title="Processed Jobs">
                      <svg class="icon" viewBox="0 0 24 24">
                          <line x1="12" y1="20" x2="12" y2="10" />
                          <line x1="18" y1="20" x2="18" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="16" />
                      </svg>
                      <span>${worker.processed.toLocaleString()}</span>
                  </div>
                  <div class="perf-icon time" title="Avg Time">
                      <svg class="icon" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>${worker.avgTime}ms</span>
                  </div>
                  <div class="perf-icon memory" title="Memory Usage">
                      <svg class="icon" viewBox="0 0 24 24">
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
                      <span>${worker.memory}MB</span>
                  </div>
              </div>
          </td>
          <td>
              <div class="actions-cell">
                  <button class="action-btn start" title="Start" onclick="event.stopPropagation(); startWorker('${worker.name}', '${worker.driver}')">
                      <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  </button>
                  <button class="action-btn stop" title="Stop" onclick="event.stopPropagation(); stopWorker('${worker.name}', '${worker.driver}')">
                      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
                  </button>
                  <button class="action-btn restart" title="Restart" onclick="event.stopPropagation(); restartWorker('${worker.name}', '${worker.driver}')">
                      <svg viewBox="0 0 24 24">
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                  </button>
                  <button class="action-btn delete" title="Delete" onclick="event.stopPropagation(); deleteWorker('${worker.name}', '${worker.driver}')">
                      <svg viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                  </button>
              </div>
          </td>
`;
  return { row, detailsId };
}

function createDetailRow(worker, detailsId) {
  const detailRow = document.createElement('tr');
  detailRow.className = 'expandable-row';
  detailRow.id = detailsId;
  detailRow.setAttribute('data-worker-name', worker.name);
  detailRow.setAttribute('data-worker-driver', worker.driver);
  detailRow.innerHTML = `
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
                    <span>Processor Path</span>
                    <span data-key="configuration.processorPath">-</span>
                  </div>
                </div>


                <div class="detail-section">
                  <h4>Performance Metrics</h4>
                  <div class="detail-item">
                    <span>Processed Jobs</span>
                    <span data-key="metrics.processed">${worker.processed != null ? worker.processed.toLocaleString() : '-'}</span>
                  </div>
                  <div class="detail-item">
                    <span>Failed Jobs</span>
                    <span data-key="metrics.failed">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Success Rate</span>
                    <span data-key="metrics.successRate">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Avg Processing Time</span>
                    <span data-key="metrics.avgTime">${worker.avgTime != null ? worker.avgTime + 'ms' : '-'}</span>
                  </div>
                </div>


                <div class="detail-section">
                  <h4>Health & Status</h4>
                  <!-- Container for SLA Scorecard injected via JS -->
                  <div class="sla-scorecard-container" style="margin-bottom: 12px;"></div>

                  <div class="detail-item">
                    <span>Last Health Check</span>
                    <span data-key="health.lastCheck">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Response Time</span>
                    <span data-key="health.responseTime">-</span>
                  </div>
                  <div class="detail-item">
                    <span>Memory Usage</span>
                    <span data-key="metrics.memory">${worker.memory == null ? '-' : worker.memory + 'MB'}</span>
                  </div>
                  <div class="detail-item">
                    <span>Uptime</span>
                    <span data-key="metrics.uptime">-</span>
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
  return detailRow;
}

function renderWorkers(data) {
  const tbody = document.getElementById('workers-tbody');
  if (!tbody) return;

  const expandedWorkers = new Set(
    Array.from(tbody.querySelectorAll('.expandable-row.open'))
      .map((row) => row.getAttribute('id')?.replace('details-', ''))
      .filter(Boolean)
  );

  tbody.innerHTML = '';

  if (!data.workers || data.workers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4">No workers found</td></tr>';
    updateQueueSummary(data.queueData);
    updateDriverFilter(data.drivers);
    updateDriversList(data.drivers);
    updatePagination(data.pagination);
    return;
  }

  data.workers.forEach((worker) => {
    const { row, detailsId } = createWorkerRow(worker);
    const detailRow = createDetailRow(worker, detailsId);

    const normalizedName = worker.name.replace(/[^a-z0-9]/gi, '-');
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
      const workerName = row.getAttribute('data-worker-name') || rowId.replace('details-', '');
      const workerDriver = row.getAttribute('data-worker-driver');
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
    `Showing ${pagination.total === 0 ? 0 : start}-${end} of ${pagination.total} workers`;

  document.getElementById('prev-btn').disabled = !pagination.hasPrev;
  document.getElementById('next-btn').disabled = !pagination.hasNext;

  // Update page numbers
  const pageNumbers = document.getElementById('page-numbers');
  pageNumbers.innerHTML = '';

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
      icon.innerHTML =
        '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    } else {
      label.textContent = 'Auto Refresh';
      icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
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

  const storedBulkAutoStart = localStorage.getItem(BULK_AUTO_START_KEY);
  if (storedBulkAutoStart === 'true') {
    bulkAutoStartEnabled = true;
    updateBulkAutoStartButton('Auto Start: On');
  } else if (storedBulkAutoStart === 'false') {
    bulkAutoStartEnabled = false;
    updateBulkAutoStartButton('Auto Start: Off');
  }

  // Load initial data
  fetchData();
});
