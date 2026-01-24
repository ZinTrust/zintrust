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

const getDashboardHeader = (): string => `
      <div class="header">
        <div class="header-top">
          <div style="display: flex; align-items: center; gap: 16px">
            <div class="logo-frame">
              <img
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230ea5e9'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='white' font-family='Arial' font-size='40' font-weight='bold'%3EZ%3C/text%3E%3C/svg%3E"
                alt="ZinTrust"
                class="logo-img"
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
        <div class="filters-bar">
          <div class="filter-group">
            <label>Status:</label>
            <select id="status-filter">
              <option value="">All Status</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Driver:</label>
            <select id="driver-filter">
              <option value="">All Drivers</option>
              <option value="db">Database</option>
              <option value="redis">Redis</option>
              <option value="memory">Memory</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Sort:</label>
            <select id="sort-select">
              <option value="name">Sort by Name</option>
              <option value="status">Sort by Status</option>
              <option value="driver">Sort by Driver</option>
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

                const params = new URLSearchParams({
                    page: currentPage.toString(),
                    limit: limit,
                    status: document.getElementById('status-filter').value,
                    driver: document.getElementById('driver-filter').value,
                    sort: document.getElementById('sort-select').value,
                    search: document.getElementById('search-input').value
                });

                const response = await fetch(\`\${API_BASE}/api/workers?\${params}\`);
                if (!response.ok) throw new Error('Failed to fetch workers');

                const data: WorkersListResponse = await response.json();
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
                        <button class="action-btn start" title="Start" onclick="event.stopPropagation(); startWorker('\${worker.name}')">
                            <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        </button>
                        <button class="action-btn stop" title="Stop" onclick="event.stopPropagation(); stopWorker('\${worker.name}')">
                            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
                        </button>
                        <button class="action-btn restart" title="Restart" onclick="event.stopPropagation(); restartWorker('\${worker.name}')">
                            <svg viewBox="0 0 24 24">
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                        </button>
                    </div>
                </td>
`;

const getDetailRowTemplate = (): string => `
                <td colspan="7" class="details-cell" style="padding:0; border-bottom:0;">
                    <div class="details-content">
                        <div class="details-grid">
                            <div class="detail-section">
                                <h4>Configuration</h4>
                                <div class="detail-item">
                                    <span>Queue Name</span>
                                    <span>\${worker.queueName}</span>
                                </div>
                                <div class="detail-item">
                                    <span>Concurrency</span>
                                    <span>5 jobs</span>
                                </div>
                                <div class="detail-item">
                                    <span>Auto Start</span>
                                    <label class="auto-switch-toggle" onclick="event.stopPropagation()">
                                        <input type="checkbox" \${worker.autoSwitch ? 'checked' : ''} onchange="toggleAutoSwitch('\${worker.name}', this.checked)">
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="detail-section">
                                <h4>System</h4>
                                <div class="detail-item">
                                    <span>Node Version</span>
                                    <span>v20.10.0</span>
                                </div>
                                <div class="detail-item">
                                    <span>PID</span>
                                    <span>12345</span>
                                </div>
                                <div class="detail-item">
                                    <span>Uptime</span>
                                    <span>3d 2h 15m</span>
                                </div>
                            </div>
                        </div>
                        <div class="recent-logs">
                            <h4>Recent Logs</h4>
                            <div class="log-entry">
                                <span class="log-time">10:45:22</span>
                                <span class="log-msg">Job #4922 completed successfully</span>
                            </div>
                            <div class="log-entry error">
                                <span class="log-time">10:44:15</span>
                                <span class="log-msg">Connection timeout while fetching storage</span>
                            </div>
                            <div class="log-entry">
                                <span class="log-time">10:42:01</span>
                                <span class="log-msg">Processing job #4921</span>
                            </div>
                        </div>
                    </div>
                </td>
`;

const getRenderingScripts = (): string => `
        /**
         * Creates the main worker row HTML
         */
        function createWorkerRow(worker) {
            const rowId = \`worker-\${worker.name.replace(/[^a-z0-9]/gi, '-')}\`;
            const detailsId = \`details-\${worker.name.replace(/[^a-z0-9]/gi, '-')}\`;

            const row = document.createElement('tr');
            row.className = 'expander';
            row.setAttribute('onclick', \`toggleDetails('\${detailsId}')\`);
            row.setAttribute('data-worker-name', worker.name);

            row.innerHTML = \`${getWorkerRowTemplate()}\`;
            return { row, detailsId };
        }

        /**
         * Creates the detail row HTML for a worker
         */
        function createDetailRow(worker, detailsId) {
            const detailRow = document.createElement('tr');
            detailRow.className = 'expandable-row';
            detailRow.id = detailsId;
            detailRow.innerHTML = \`${getDetailRowTemplate()}\`;
            return detailRow;
        }

        /**
         * Renders the workers table with the provided data
         */
        function renderWorkers(data) {
            const tbody = document.getElementById('workers-tbody');
            if (!tbody) return;

            // Capture currently expanded rows
            const expandedWorkers = new Set(
                Array.from(tbody.querySelectorAll('.expanded-row.open'))
                     .map(row => row.getAttribute('id')?.replace('details-', ''))
                     .filter(Boolean)
            );

            // Clear existing rows
            tbody.innerHTML = '';

            // Process each worker
            data.workers.forEach(worker => {
                const { row, detailsId } = createWorkerRow(worker);
                const detailRow = createDetailRow(worker, detailsId);

                // Add to DOM
                tbody.appendChild(row);
                tbody.appendChild(detailRow);
            });

            updatePagination(data.pagination);
        }

        function toggleDetails(rowId) {
            const row = document.getElementById(rowId);
            if (row) {
                row.classList.toggle('open');
            }
        }
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
        // Worker actions
        async function startWorker(name) {
            try {
                await fetch(\`\${API_BASE}/api/workers/\${name}/start\`, { method: 'POST' });
                fetchData();
            } catch (err) {
                console.error('Failed to start worker:', err);
            }
        }

        async function stopWorker(name) {
            try {
                await fetch(\`\${API_BASE}/api/workers/\${name}/stop\`, { method: 'POST' });
                fetchData();
            } catch (err) {
                console.error('Failed to stop worker:', err);
            }
        }

        async function restartWorker(name) {
            try {
                await fetch(\`\${API_BASE}/api/workers/\${name}/restart\`, { method: 'POST' });
                fetchData();
            } catch (err) {
                console.error('Failed to restart worker:', err);
            }
        }

        async function toggleAutoSwitch(name, enabled) {
            try {
                await fetch(\`\${API_BASE}/api/workers/\${name}/auto-switch\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled })
                });
            } catch (err) {
                console.error('Failed to toggle auto-switch:', err);
            }
        }

        function showAddWorkerModal() {
            // TODO: Implement add worker modal
            alert('Add Worker functionality coming soon!');
        }
`;

const getAutoRefreshScripts = (options: WorkersDashboardUiOptions): string => `
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
            setAutoRefresh(storedAutoRefresh === 'true' || ${options.autoRefresh});

            // Load initial data
            fetchData();
        });
`;

const getDashboardScripts = (options: WorkersDashboardUiOptions): string => `
    <script>
        // Configuration
        const API_BASE = window.location.pathname.endsWith('/')
            ? window.location.pathname.slice(0, -1)
            : window.location.pathname;

        const THEME_KEY = 'zintrust-workers-dashboard-theme';
        const AUTO_REFRESH_KEY = 'zintrust-workers-dashboard-auto-refresh';
        const PAGE_SIZE_KEY = 'zintrust-workers-dashboard-page-size';

        let currentPage = 1;
        let totalPages = 1;
        let totalWorkers = 0;
        let autoRefreshEnabled = ${options.autoRefresh};
        let refreshTimer = null;
        let currentTheme = null;

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
