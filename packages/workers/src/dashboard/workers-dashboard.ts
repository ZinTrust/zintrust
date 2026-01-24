import type { WorkersDashboardUiOptions } from './types';
import { getWorkersDashboardStyles } from './workers-dashboard-ui';

export type {
  GetWorkersQuery,
  QueueData,
  RawWorkerData,
  WorkerConfiguration,
  WorkerData,
  WorkerDetails,
  WorkerHealth,
  WorkerMetrics,
  WorkersDashboardUiOptions,
  WorkersListResponse,
} from './types';

const getHeaderTopSection = (): string => `
        <div class="header-top">
          <div style="display: flex; align-items: center; gap: 16px">
            <div class="logo-frame">
              <img
                src="/zintrust.svg"
                alt="ZinTrust"
                class="logo logo-img"
              />
            </div>
            <h1>Workers Dashboard</h1>
          </div>
          <div class="header-actions">
            <button id="theme-toggle" class="theme-toggle">
              <svg class="icon" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                />
              </svg>
              Theme
            </button>
            <button id="auto-refresh-toggle" class="btn" onclick="toggleAutoRefresh()">
              <svg id="auto-refresh-icon" class="icon" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span id="auto-refresh-label">Auto Refresh</span>
            </button>
            <button id="bulk-auto-start-toggle" class="btn" onclick="toggleBulkAutoStart()">
              <svg id="bulk-auto-start-icon" class="icon" viewBox="0 0 24 24">
                <path d="M12 2v20M2 12h20" />
              </svg>
              <span id="bulk-auto-start-label">Auto Start: Off</span>
            </button>
            <button class="btn" onclick="fetchData()">
              <svg class="icon" viewBox="0 0 24 24">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
            <button class="btn btn-primary" onclick="showAddWorkerModal()">
              <svg class="icon" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Worker
            </button>
          </div>
        </div>
`;

const getNavigationBar = (): string => `
        <div class="nav-bar">
          <nav class="nav-links">
            <a href="/queue-monitor" class="nav-link">Queue Monitor</a>
            <a href="/telemetry" class="nav-link">Telemetry</a>
            <a href="/metrics" class="nav-link">Metrics</a>
          </nav>
        </div>
`;

const getFilterBar = (): string => `
        <div class="filters-bar">
          <div class="filter-group">
            <label>Status:</label>
            <select id="status-filter">
              <option value="">All Status</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="error">Error</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Driver:</label>
            <select id="driver-filter">
              <option value="">All Drivers</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Sort:</label>
            <select id="sort-select">
              <option value="name">Sort by Name</option>
              <option value="status">Sort by Status</option>
              <option value="driver">Sort by Driver</option>
              <option value="health">Sort by Health</option>
              <option value="version">Sort by Version</option>
              <option value="processed">Sort by Performance</option>
            </select>
          </div>
          <div style="flex-grow: 1"></div>
          <div class="search-box">
            <svg class="search-icon" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="search-input" placeholder="Search workers...">
          </div>
        </div>
`;

const getDashboardHeader = (): string => `
      <div class="header">
        ${getHeaderTopSection()}
        ${getNavigationBar()}
        ${getFilterBar()}
      </div>
`;

const getDashboardLoadingStates = (): string => `
            <div id="loading" style="text-align: center; padding: 40px; color: var(--muted);">
                <div>Loading workers...</div>
            </div>

            <div id="error" style="display: none; text-align: center; padding: 40px; color: var(--danger);">
                <div>Failed to load workers data</div>
                <button class="btn" onclick="fetchData()" style="margin-top: 16px;">Retry</button>
            </div>

            <div id="workers-content" style="display: none;">
              <div class="summary-bar" id="queue-summary">
                <div class="summary-item">
                    <span class="summary-label">Queue Driver</span>
                    <span class="summary-value" id="queue-driver">-</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Queues</span>
                    <span class="summary-value" id="queue-total">0</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Jobs</span>
                    <span class="summary-value" id="queue-jobs">0</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Processing</span>
                    <span class="summary-value" id="queue-processing">0</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Failed</span>
                    <span class="summary-value" id="queue-failed">0</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Drivers</span>
                    <div class="drivers-list" id="drivers-list"></div>
                </div>
              </div>
              <div class="table-container">
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 250px">Worker</th>
                                <th style="width: 120px">Status</th>
                                <th style="width: 120px">Health</th>
                                <th style="width: 100px">Driver</th>
                                <th style="width: 100px">Version</th>
                                <th style="width: 320px">Performance</th>
                                <th style="width: 180px">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="workers-tbody">
                            <!-- Workers will be populated here -->
                        </tbody>
                    </table>
                </div>

                <div class="pagination">
                    <div class="pagination-info" id="pagination-info">
                        Showing 0-0 of 0 workers
                    </div>
                    <div class="pagination-controls">
                        <button class="page-btn" id="prev-btn" onclick="loadPage('prev')" disabled>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div id="page-numbers" style="display:flex; gap:8px;"></div>
                        <button class="page-btn" id="next-btn" onclick="loadPage('next')" disabled>
                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>

                        <div class="page-size-selector">
                            <label>Show:</label>
                            <select id="limit-select" onchange="changeLimit(this.value)">
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                    </div>
                </div>
              </div>
            </div>
`;

const getThemeManagementScripts = (): string => `
        // Theme management
        function getPreferredTheme() {
            const stored = localStorage.getItem(THEME_KEY);
            if (stored === 'light' || stored === 'dark') {
                return stored;
            }
            const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
            return prefersLight ? 'light' : 'dark';
        }

        function applyTheme(nextTheme) {
            currentTheme = nextTheme;
            document.documentElement.setAttribute('data-theme', nextTheme);
            localStorage.setItem(THEME_KEY, nextTheme);
        }

        function toggleTheme() {
            applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
        }
`;

const getDataFetchingScripts = (options: WorkersDashboardUiOptions): string => `
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
                const limit = localStorage.getItem(PAGE_SIZE_KEY) || '${options.pageSize}';
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
                    search: searchInput ? searchInput.value : ''
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
`;

const getWorkerRowTemplate = (): string => `
                <td>
                    <div class="worker-name">\${worker.name}</div>
                    <div class="worker-queue">\${worker.queueName}</div>
                </td>
                <td>
                    <span class="status-badge status-\${worker.status}">
                        <span class="status-dot"></span>
                        \${worker.status.charAt(0).toUpperCase() + worker.status.slice(1)}
                    </span>
                </td>
                <td>
                    <div class="health-indicator">
                        <span class="health-dot health-\${worker.health.status}"></span>
                        \${worker.health.status.charAt(0).toUpperCase() + worker.health.status.slice(1)}
                    </div>
                </td>
                <td><span class="driver-badge">\${worker.driver}</span></td>
                <td><span class="version-badge">v\${worker.version}</span></td>
                <td>
                    <div class="performance-icons">
                        <div class="perf-icon processed" title="Processed Jobs">
                            <svg class="icon" viewBox="0 0 24 24">
                                <line x1="12" y1="20" x2="12" y2="10" />
                                <line x1="18" y1="20" x2="18" y2="4" />
                                <line x1="6" y1="20" x2="6" y2="16" />
                            </svg>
                            <span>\${worker.processed.toLocaleString()}</span>
                        </div>
                        <div class="perf-icon time" title="Avg Time">
                            <svg class="icon" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span>\${worker.avgTime}ms</span>
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
                            <span>\${worker.memory}MB</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="action-btn start" title="Start" onclick="event.stopPropagation(); startWorker('\${worker.name}', '\${worker.driver}')">
                            <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        </button>
                        <button class="action-btn stop" title="Stop" onclick="event.stopPropagation(); stopWorker('\${worker.name}', '\${worker.driver}')">
                            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
                        </button>
                        <button class="action-btn restart" title="Restart" onclick="event.stopPropagation(); restartWorker('\${worker.name}', '\${worker.driver}')">
                            <svg viewBox="0 0 24 24">
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                        </button>
                        <button class="action-btn delete" title="Delete" onclick="event.stopPropagation(); deleteWorker('\${worker.name}', '\${worker.driver}')">
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

const getConfigSection = (): string => `
                      <div class="detail-section">
                        <h4>Configuration</h4>
                        <div class="detail-item">
                          <span>Queue Name</span>
                          <span data-key="configuration.queueName">\${worker.queueName}</span>
                        </div>
                        <div class="detail-item">
                          <span>Concurrency</span>
                          <span data-key="configuration.concurrency">-</span>
                        </div>
                        <div class="detail-item">
                          <span>Auto Start</span>
                          <label class="auto-switch-toggle" onclick="event.stopPropagation()">
                            <input type="checkbox" \${worker.autoStart ? 'checked' : ''} onchange="toggleAutoStart('\${worker.name}', '\${worker.driver}', this.checked)">
                            <span class="toggle-slider"></span>
                          </label>
                        </div>
                        <div class="detail-item">
                          <span>Processor Path</span>
                          <span data-key="configuration.processorPath">-</span>
                        </div>
                      </div>
`;

const getMetricsSection = (): string => `
                      <div class="detail-section">
                        <h4>Performance Metrics</h4>
                        <div class="detail-item">
                          <span>Processed Jobs</span>
                          <span data-key="metrics.processed">\${worker.processed != null ? worker.processed.toLocaleString() : '-'}</span>
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
                          <span data-key="metrics.avgTime">\${worker.avgTime != null ? worker.avgTime + 'ms' : '-'}</span>
                        </div>
                      </div>
`;

const getHealthSection = (): string => `
                      <div class="detail-section">
                        <h4>Health & Status</h4>
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
                          <span data-key="metrics.memory">\${worker.memory != null ? worker.memory + 'MB' : '-'}</span>
                        </div>
                        <div class="detail-item">
                          <span>Uptime</span>
                          <span data-key="metrics.uptime">-</span>
                        </div>
                      </div>
`;

const getLogsSection = (): string => `
                      <div class="detail-section">
                        <h4>Recent Logs</h4>
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
`;

const getDetailRowTemplate = (): string => `
                <td colspan="7" class="details-cell">
                  <div class="details-content">
                    <div class="details-grid">
                      ${getConfigSection()}
                      ${getMetricsSection()}
                      ${getHealthSection()}
                      ${getLogsSection()}
                    </div>
                  </div>
                </td>
`;

const getDetailFormattingScripts = (): string => String.raw`
        function updateDetailViews(detailRow, details) {
            if (!details) return;

            // Helper to safe access nested properties
            const get = (obj, path) => path.split('.').reduce((o, i) => o ? o[i] : null, obj);

            // Update simple data attributes
            detailRow.querySelectorAll('[data-key]').forEach(el => {
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

            // Handle logs if present
            const logsContainer = detailRow.querySelector('.logs-content');
            if (logsContainer && details.recentLogs && Array.isArray(details.recentLogs)) {
                if (details.recentLogs.length === 0) {
                    logsContainer.innerHTML = '<div style="color: var(--muted)">No recent logs</div>';
                } else {
                    logsContainer.innerHTML = details.recentLogs.map(log => {
                        let color = 'var(--text)';
                        if (log.toLowerCase().includes('failed') || log.toLowerCase().includes('error')) color = 'var(--danger)';
                        else if (log.toLowerCase().includes('success')) color = 'var(--success)';
                        else if (log.toLowerCase().includes('processing')) color = 'var(--info)';

                        return \`<div style="color: \${color}">\${log}</div>\`;
                    }).join('');
                }
            } else if (logsContainer) {
                logsContainer.innerHTML = '<div style="color: var(--muted)">No logs available</div>';
            }
        }
`;

const getDetailRenderingScripts = (): string => String.raw`
        async function ensureWorkerDetails(workerName, detailRow, driver) {
            if (!workerName || !detailRow) return;
            if (!detailsCache.has(workerName)) {
                try {
                    // Validate driver before making request
                    if (driver && !['db', 'redis', 'memory'].includes(driver)) {
                        console.error('Invalid driver specified');
                        return;
                    }

                    const response = await fetch(API_BASE + '/api/workers/' + workerName + '/details?driver=' + driver);
                    if (!response.ok) {
                        console.error('Failed to load worker details:', response.statusText);
                        return;
                    }
                    const data = await response.json();
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
`;

const getSummaryRenderingScripts = (): string => `
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

        function syncBulkAutoStartState(workers) {
            if (!Array.isArray(workers)) return;
            lastWorkers = workers;
            const enabledCount = workers.filter((worker) => worker.autoStart).length;
            if (enabledCount === workers.length && workers.length > 0) {
                bulkAutoStartEnabled = true;
                updateBulkAutoStartButton('Auto Start: On');
            } else if (enabledCount === 0) {
                bulkAutoStartEnabled = false;
                updateBulkAutoStartButton('Auto Start: Off');
            } else {
                updateBulkAutoStartButton('Auto Start: Mixed');
            }
        }
`;

const getTableRenderingScripts = (): string => `
        function createWorkerRow(worker) {
            const detailsId = \`details-\${worker.name.replace(/[^a-z0-9]/gi, '-')}\`;

            const row = document.createElement('tr');
            row.className = 'expander';
            row.setAttribute('onclick', \`toggleDetails('\${detailsId}')\`);
            row.setAttribute('data-worker-name', worker.name);
            row.setAttribute('data-worker-driver', worker.driver);

            row.innerHTML = \`${getWorkerRowTemplate()}\`;
            return { row, detailsId };
        }

        function createDetailRow(worker, detailsId) {
            const detailRow = document.createElement('tr');
            detailRow.className = 'expandable-row';
            detailRow.id = detailsId;
            detailRow.setAttribute('data-worker-name', worker.name);
            detailRow.setAttribute('data-worker-driver', worker.driver);
            detailRow.innerHTML = \`${getDetailRowTemplate()}\`;
            return detailRow;
        }

        function renderWorkers(data) {
            const tbody = document.getElementById('workers-tbody');
            if (!tbody) return;

            const expandedWorkers = new Set(
                Array.from(tbody.querySelectorAll('.expandable-row.open'))
                     .map(row => row.getAttribute('id')?.replace('details-', ''))
                     .filter(Boolean)
            );

            tbody.innerHTML = '';

            if (!data.workers || data.workers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4">No workers found</td></tr>';
                updateQueueSummary(data.queueData);
                updateDriverFilter(data.drivers);
                updateDriversList(data.drivers);
                syncBulkAutoStartState([]);
                updatePagination(data.pagination);
                return;
            }

            data.workers.forEach(worker => {
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
            syncBulkAutoStartState(data.workers);
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
`;

const getRenderingScripts = (): string => `
        ${getDetailRenderingScripts()}
        ${getDetailFormattingScripts()}
        ${getSummaryRenderingScripts()}
        ${getTableRenderingScripts()}
`;

const getPaginationScripts = (): string => `
        function updatePagination(pagination) {
            currentPage = pagination.page;
            totalPages = pagination.totalPages;
            totalWorkers = pagination.total;

            const start = (pagination.page - 1) * pagination.limit + 1;
            const end = Math.min(pagination.page * pagination.limit, pagination.total);

            document.getElementById('pagination-info').textContent =
                \`Showing \${pagination.total === 0 ? 0 : start}-\${end} of \${pagination.total} workers\`;

            document.getElementById('prev-btn').disabled = !pagination.hasPrev;
            document.getElementById('next-btn').disabled = !pagination.hasNext;

            // Update page numbers
            const pageNumbers = document.getElementById('page-numbers');
            pageNumbers.innerHTML = '';

            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, currentPage + 2);

            for (let i = startPage; i <= endPage; i++) {
                const btn = document.createElement('button');
                btn.className = \`page-btn \${i === currentPage ? 'active' : ''}\`;
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
`;

const getWorkerActionScripts = (): string => `
        ${getWorkerLifecycleScripts()}
        ${getWorkerAutoStartScripts()}
        ${getWorkerBulkScripts()}
        ${getWorkerModalScripts()}
`;

const getWorkerLifecycleScripts = (): string => `
        // Worker actions
        async function startWorker(name, driver) {
            try {
                await fetch(\`\${API_BASE}/api/workers/\${name}/start?driver=\${driver}\`, { method: 'POST' });
                fetchData();
            } catch (err) {
                console.error('Failed to start worker:', err);
            }
        }

        async function stopWorker(name, driver) {
            try {
                await fetch(\`\${API_BASE}/api/workers/\${name}/stop?driver=\${driver}\`, { method: 'POST' });
                fetchData();
            } catch (err) {
                console.error('Failed to stop worker:', err);
            }
        }

        async function restartWorker(name, driver) {
            try {
                await fetch(\`\${API_BASE}/api/workers/\${name}/restart?driver=\${driver}\`, { method: 'POST' });
                fetchData();
            } catch (err) {
                console.error('Failed to restart worker:', err);
            }
        }

        async function deleteWorker(name, driver) {
            if (!confirm(\`Are you sure you want to delete worker "\${name}"? This action cannot be undone.\`)) {
                return;
            }
            try {
                const response = await fetch(\`\${API_BASE}/api/workers/\${name}?driver=\${driver}\`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Failed to delete worker');
                fetchData();
            } catch (err) {
                console.error('Failed to delete worker:', err);
                alert('Failed to delete worker: ' + err.message);
            }
        }
`;

const getWorkerAutoStartScripts = (): string => `
        async function toggleAutoStart(name, driver, enabled) {
            try {
                await fetch(\`\${API_BASE}/api/workers/\${name}/auto-start?driver=\${driver}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled })
                });
            } catch (err) {
                console.error('Failed to toggle auto-start:', err);
            }
        }
`;

const getWorkerBulkScripts = (): string => `
        function updateBulkAutoStartButton(label) {
            const buttonLabel = document.getElementById('bulk-auto-start-label');
            if (buttonLabel) {
                buttonLabel.textContent = label;
            }
        }

        async function toggleBulkAutoStart() {
            if (!Array.isArray(lastWorkers) || lastWorkers.length === 0) return;
            const nextEnabled = !bulkAutoStartEnabled;
            bulkAutoStartEnabled = nextEnabled;
            localStorage.setItem(BULK_AUTO_START_KEY, nextEnabled.toString());
            updateBulkAutoStartButton(nextEnabled ? 'Auto Start: On' : 'Auto Start: Off');

            try {
                const CHUNK_SIZE = 10;
                const workersToUpdate = lastWorkers.map(w => w.name);

                for (let i = 0; i < workersToUpdate.length; i += CHUNK_SIZE) {
                    const chunk = workersToUpdate.slice(i, i + CHUNK_SIZE);
                    await fetch(API_BASE + '/api/workers/auto-start/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ workers: chunk, enabled: nextEnabled })
                    });
                }
                fetchData();
            } catch (err) {
                console.error('Failed to toggle bulk auto-start:', err);
            }
        }
`;

const getWorkerModalScripts = (): string => `
        function showAddWorkerModal() {
            // TODO: Implement add worker modal
            alert('Add Worker functionality coming soon!');
        }
`;

const getAutoRefreshScripts = (options: WorkersDashboardUiOptions): string => `
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
                refreshTimer = setInterval(fetchData, ${options.refreshIntervalMs});
            }

            const btn = document.getElementById('auto-refresh-toggle');
            const icon = document.getElementById('auto-refresh-icon');
            const label = document.getElementById('auto-refresh-label');

            if (btn && icon && label) {
                if (enabled) {
                     label.textContent = 'Pause Refresh';
                     icon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
                } else {
                     label.textContent = 'Auto Refresh';
                     icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
                }
            }
        }
`;

const getEventListenersScripts = (options: WorkersDashboardUiOptions): string => `
        // Event listeners
        document.addEventListener('DOMContentLoaded', function() {
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
                setAutoRefresh(${options.autoRefresh});
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
`;

const getDashboardScripts = (options: WorkersDashboardUiOptions): string => `
    <script>
        // Configuration
        const API_BASE = '';

        const THEME_KEY = 'zintrust-workers-dashboard-theme';
        const AUTO_REFRESH_KEY = 'zintrust-workers-dashboard-auto-refresh';
        const PAGE_SIZE_KEY = 'zintrust-workers-dashboard-page-size';
        const BULK_AUTO_START_KEY = 'zintrust-workers-dashboard-bulk-auto-start';

        let currentPage = 1;
        let totalPages = 1;
        let totalWorkers = 0;
        let autoRefreshEnabled = ${options.autoRefresh};
        let refreshTimer = null;
        let currentTheme = null;
        let bulkAutoStartEnabled = false;
        let lastWorkers = [];
        const detailsCache = new Map();
        const MAX_CACHE_SIZE = 50;

        ${getThemeManagementScripts()}
        ${getDataFetchingScripts(options)}
        ${getRenderingScripts()}
        ${getPaginationScripts()}
        ${getWorkerActionScripts()}
        ${getAutoRefreshScripts(options)}
        ${getEventListenersScripts(options)}
    </script>
`;

const getWorkersDashboardHTML = (options: WorkersDashboardUiOptions): string => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workers Dashboard</title>
    <style>
        ${getWorkersDashboardStyles()}
    </style>
</head>
<body>
    <div class="container">
        ${getDashboardHeader()}
        ${getDashboardLoadingStates()}
    </div>
    ${getDashboardScripts(options)}
</body>
</html>
`;

export { getWorkersDashboardHTML };
