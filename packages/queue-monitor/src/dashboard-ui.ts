export type DashboardUiOptions = {
  basePath: string;
  autoRefresh: boolean;
  refreshIntervalMs: number;
};

const getRootAndThemeVariables = (): string => `
:root {
    --bg: #0b1220;
    --card: rgba(15, 23, 42, 0.65);
    --border: #334155;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --accent: #bae6fd;
    --accent2: #e2e8f0;
    --danger: #ef4444;
    --success: #10b981;
}

html[data-theme="light"] {
    --bg: #f8fafc;
    --card: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #475569;
    --accent: #0284c7;
    --accent2: #0f172a;
    --danger: #dc2626;
    --success: #16a34a;
}`;

const getLogoAndLayoutStyles = (): string => `
.logo-frame {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid rgba(14, 165, 233, 0.35);
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.18), rgba(2, 132, 199, 0.1));
  display: grid;
  place-items: center;
  overflow: hidden;
}

.logo-img {
  width: 26px;
  height: 26px;
  display: block;
}

html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
}

.page { min-height: 100%; padding: 24px; }
.shell { max-width: 1080px; margin: 0 auto; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }

.tile {
    border: 1px solid var(--border);
    background: var(--card);
    border-radius: 12px;
    padding: 20px;
}`;

const getDashboardComponentStyles = (): string => `
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
.brand { display: flex; gap: 12px; align-items: center; }
.brand b { font-size: 16px; color: var(--text); display: block; }
.brand span { font-size: 13px; color: var(--muted); }

select { background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 6px 10px; border-radius: 6px; font-size: 13px; outline: none; }
select:focus { border-color: var(--accent); }

table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th, td { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
th { color: var(--muted); font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
tr:last-child td { border-bottom: none; }
.expandable-row { cursor: pointer; transition: background 0.2s; }
.expandable-row:hover { background: rgba(255,255,255,0.03); }
.expandable-row code { cursor: pointer; color: var(--accent); }
.expandable-row code:hover { text-decoration: underline; }
.detail-row { background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border); }
.detail-cell { padding: 16px 20px !important; }
.detail-content { font-family: monospace; font-size: 12px; line-height: 1.6; }
.detail-content pre { margin: 0; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
.expand-icon { display: inline-block; margin-right: 6px; transition: transform 0.2s; user-select: none; }
.expand-icon.expanded { transform: rotate(90deg); }

.stat-value { font-size: 28px; font-weight: 800; color: var(--text); margin-top: 8px; line-height: 1; }
.stat-label { font-size: 12px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }`;

const getStatusBadgeStyles = (): string => `
.status-badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; letter-spacing: 0.02em; }
.status-completed { background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); }
.status-failed { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
.status-active { background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
.status-waiting { background: rgba(250, 204, 21, 0.1); color: #facc15; border: 1px solid rgba(250, 204, 21, 0.2); }
.status-delayed { background: rgba(168, 85, 247, 0.1); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.2); }
.status-paused { background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); }`;

const getInteractiveStyles = (): string => `
.refresh-btn { background: rgba(255,255,255,0.03); color: var(--text); border: 1px solid var(--border); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }
.refresh-btn:hover { background: rgba(255,255,255,0.08); border-color: var(--muted); }

.nav-links { display: flex; gap: 8px; flex-wrap: wrap; }
.nav-link { text-decoration: none; color: var(--text); border: 1px solid var(--border); padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; transition: all 0.2s; }
.nav-link:hover { border-color: var(--accent); color: var(--accent); }

html[data-theme="light"] .refresh-btn { background: rgba(2, 132, 199, 0.08); }
html[data-theme="light"] .refresh-btn:hover { background: rgba(2, 132, 199, 0.16); }

.retry-btn { background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s; }
.retry-btn:hover { background: rgba(59, 130, 246, 0.2); transform: scale(1.05); }
.retry-btn:disabled { opacity: 0.5; cursor: not-allowed; }

#error-container { display: none; margin-bottom: 2rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 0.5rem; font-size: 13px; font-weight: 600; }
code { background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; color: var(--accent); border: 1px solid var(--border); }

.stat-header { display: flex; align-items: center; gap: 6px; }
.info-icon { width: 16px; height: 16px; border-radius: 50%; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; cursor: help; transition: all 0.2s; }
.info-icon:hover { background: rgba(59, 130, 246, 0.3); transform: scale(1.1); }
.tooltip { position: fixed; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; font-size: 13px; line-height: 1.6; color: var(--text); box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 1000; max-width: 320px; display: none; }
.tooltip.show { display: block; }
.tooltip-title { font-weight: 700; color: var(--accent); margin-bottom: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }`;

const getDashboardStyles = (): string =>
  [
    getRootAndThemeVariables(),
    getLogoAndLayoutStyles(),
    getDashboardComponentStyles(),
    getStatusBadgeStyles(),
    getInteractiveStyles(),
  ].join('\n');

const getHeaderSection = (): string => `
    <header>
        <div class="brand">
            <div class="logo-frame">
                ${getLogoSvg()}
            </div>
            <div>
                <b>ZinTrust</b>
                <span>Queue Monitor</span>
            </div>
        </div>
        <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
            <span id="last-updated" style="color: var(--muted); font-size: 12px;"></span>
            <div class="nav-links">
                <a class="nav-link" href="/workers">Workers</a>
                <a class="nav-link" href="/telemetry">Telemetry</a>
                <a class="nav-link" href="/metrics">Metrics</a>
            </div>
            <button id="theme-toggle" class="refresh-btn" type="button">Light mode</button>
            <button id="auto-refresh-toggle" class="refresh-btn" type="button">Pause auto refresh</button>
        </div>
    </header>
`;

const getLogoSvg = (): string => `
<svg width="26" height="26" viewBox="0 0 100 100" fill="none" class="logo-img" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="zt-g2d" x1="10" y1="50" x2="90" y2="50" gradientUnits="userSpaceOnUse">
            <stop stop-color="#22c55e" />
            <stop offset="1" stop-color="#38bdf8" />
        </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="34" stroke="rgba(255,255,255,0.16)" stroke-width="4" />
    <ellipse cx="50" cy="50" rx="40" ry="18" stroke="url(#zt-g2d)" stroke-width="4" />
    <ellipse cx="50" cy="50" rx="18" ry="40" stroke="url(#zt-g2d)" stroke-width="4" opacity="0.75" />
    <circle cx="50" cy="50" r="6" fill="url(#zt-g2d)" />
    <path d="M40 52C35 52 32 49 32 44C32 39 35 36 40 36H48" stroke="white" stroke-width="6" stroke-linecap="round" />
    <path d="M60 48C65 48 68 51 68 56C68 61 65 64 60 64H52" stroke="white" stroke-width="6" stroke-linecap="round" />
    <path d="M44 50H56" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round" />
</svg>
`;

const getStatsSection = (): string => `
    <div class="grid" id="stats-grid">
        <!-- Stats inserted here -->
    </div>
`;

const getLocksSection = (): string => `
    <div class="tile" style="margin-top: 24px; padding: 0;">
                <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <h3 style="margin: 0; font-size: 14px; font-weight: 800; color: var(--text);">Active Locks</h3>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input id="lock-pattern" placeholder="Pattern (e.g. email-*)" style="background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 6px 10px; border-radius: 6px; font-size: 12px; min-width: 220px;" />
                            <button id="lock-refresh" class="refresh-btn" type="button">Refresh locks</button>
                        </div>
                    </div>
                    <div id="locks-summary" style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--muted);"></div>
                    <div id="locks-histogram" style="font-size: 12px;"></div>
                </div>
        <div style="overflow-x: auto;">
            <table id="locks-table">
                <thead>
                    <tr>
                        <th>Lock Key</th>
                        <th>TTL</th>
                        <th>Expires</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    </div>
`;

const getJobsSection = (): string => `
    <div class="tile" style="margin-top: 24px; padding: 0;">
        <div style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <h3 style="margin: 0; font-size: 14px; font-weight: 800; color: var(--text);">Recent Jobs</h3>
            <select id="queue-select">
                <!-- Queues inserted here -->
            </select>
        </div>
        <div style="overflow-x: auto;">
            <table id="jobs-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Worker Name</th>
                        <th>Queue</th>
                        <th>Status</th>
                        <th>Attempts</th>
                        <th>Time</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    </div>
`;

const getDashboardBody = (): string => `
    <div class="page">
        <div class="shell">
            ${getHeaderSection()}

            <section id="error-container"></section>

            ${getStatsSection()}
            ${getLocksSection()}
            ${getJobsSection()}
        </div>
    </div>
`;

const getDashboardScriptState = (options: DashboardUiOptions): string => String.raw`
        const AUTO_REFRESH = ${options.autoRefresh ? 'true' : 'false'};
        const REFRESH_INTERVAL = ${Math.max(1000, Math.floor(options.refreshIntervalMs || 0))};
    const API_BASE = ${JSON.stringify(options.basePath)};
        const THEME_KEY = 'zintrust-queue-monitor-theme';
        const AUTO_REFRESH_KEY = 'zintrust-queue-monitor-auto-refresh';
        const QUEUE_KEY = 'zintrust-queue-monitor-selected-queue';
        let currentQueue = localStorage.getItem(QUEUE_KEY);
        let autoRefreshEnabled = AUTO_REFRESH;
        let refreshTimer = null;
        let eventSource = null;
        let sseActive = false;
        let lastSseQueue = null;
        let lastSsePattern = null;
        let currentTheme = null;
`;

const getDashboardScriptTheme = (): string => `
        function getPreferredTheme() {
            const stored = localStorage.getItem(THEME_KEY);
            if (stored === 'light' || stored === 'dark') {
                return stored;
            }
            const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
            return prefersLight ? 'light' : 'dark';
        }

        function updateThemeButton() {
            const btn = document.getElementById('theme-toggle');
            if (!btn) return;
            btn.textContent = currentTheme === 'dark' ? 'Light mode' : 'Dark mode';
        }

        function applyTheme(nextTheme) {
            currentTheme = nextTheme;
            document.documentElement.setAttribute('data-theme', nextTheme);
            localStorage.setItem(THEME_KEY, nextTheme);
            updateThemeButton();
        }

        function toggleTheme() {
            applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
        }
`;

const getDashboardScriptAutoRefresh = (): string => `
        function updateAutoRefreshButton() {
            const btn = document.getElementById('auto-refresh-toggle');
            if (!btn) return;
            btn.textContent = autoRefreshEnabled ? 'Pause auto refresh' : 'Resume auto refresh';
        }

        function startAutoRefresh() {
            if (!autoRefreshEnabled || refreshTimer !== null || sseActive) return;
            // Disabled HTTP polling - SSE handles all updates
            // refreshTimer = setInterval(fetchData, REFRESH_INTERVAL);
            console.log('HTTP auto-refresh disabled - using SSE only');
        }

        function stopAutoRefresh() {
            if (refreshTimer === null) return;
            clearInterval(refreshTimer);
            refreshTimer = null;
        }

        function setAutoRefresh(enabled) {
            autoRefreshEnabled = enabled;
            localStorage.setItem(AUTO_REFRESH_KEY, String(enabled));
            if (!enabled) {
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                sseActive = false;
            }

            if (autoRefreshEnabled && !sseActive) {
                if (window.EventSource) {
                    setupEventStream(currentQueue);
                } else {
                    startAutoRefresh();
                }
            } else {
                stopAutoRefresh();
            }
            updateAutoRefreshButton();
        }

        function toggleAutoRefresh() {
            setAutoRefresh(!autoRefreshEnabled);
        }
`;

const getRenderStatsFunction = (): string => `
        function renderStats(data) {
            const grid = document.getElementById('stats-grid');
            grid.innerHTML = '';

            const totalActive = data.queues.reduce((acc, q) => acc + q.counts.active, 0);
            const totalFailed = data.queues.reduce((acc, q) => acc + q.counts.failed, 0);
            const totalDelayed = data.queues.reduce((acc, q) => acc + q.counts.delayed, 0);
            const totalWaiting = data.queues.reduce((acc, q) => acc + q.counts.waiting, 0);

            const cards = [
                {
                    label: 'Active Jobs',
                    value: totalActive,
                    info: 'Jobs currently being processed by workers. These are picked up from the waiting queue and are actively running.'
                },
                {
                    label: 'Failed Jobs',
                    value: totalFailed,
                    color: totalFailed > 0 ? '#f87171' : null,
                    info: 'Jobs that threw an error during processing and exceeded retry attempts. Check error logs for details.'
                },
                {
                    label: 'Delayed',
                    value: totalDelayed,
                    info: 'Jobs scheduled to run at a future time. They will move to waiting queue when their delay time expires.'
                },
                {
                    label: 'Waiting',
                    value: totalWaiting,
                    color: totalWaiting > 0 ? '#facc15' : null,
                    info: 'Jobs ready to be processed, waiting for available workers to pick them up from the queue.'
                },
                {
                    label: 'Queues',
                    value: data.queues.length,
                    info: 'Total number of active job queues in Redis. Each queue can process different types of jobs independently.'
                }
            ];

            cards.forEach(card => {
                const div = document.createElement('div');
                div.className = 'tile';
                const infoIcon = '<span class="info-icon" data-info="' + card.info + '">i</span>';
                div.innerHTML =
                    '<div class="stat-header">' +
                    '<div class="stat-label">' + card.label + '</div>' +
                    infoIcon +
                    '</div>' +
                    '<div class="stat-value" style="' + (card.color ? 'color:' + card.color : '') + '">' +
                    card.value +
                    '</div>';
                grid.appendChild(div);
            });

            document.querySelectorAll('.info-icon').forEach(icon => {
                icon.addEventListener('mouseenter', showTooltip);
                icon.addEventListener('mouseleave', hideTooltip);
            });
        }`;

const getUpdateQueueSelectFunction = (): string => `
        function updateQueueSelect(queues) {
            const select = document.getElementById('queue-select');
            const currentSelection = select.value || currentQueue;
            select.innerHTML = '';

            if (queues.length === 0) return

            queues.forEach(q => {
                const opt = document.createElement('option');
                opt.value = q.name;
                opt.textContent = q.name + ' (' + q.counts.waiting + ' waiting)';
                opt.selected = q.name === currentSelection;
                select.appendChild(opt);
            });
        }`;

const getRenderJobsFunction = (): string => `
        // Track expanded job IDs to preserve state during SSE updates
        let expandedJobIds = new Set();

        function renderJobs(jobs) {
            const tbody = document.querySelector('#jobs-table tbody');

            // Store currently expanded job IDs before clearing
            const currentExpanded = document.querySelectorAll('.expand-icon.expanded');
            currentExpanded.forEach(icon => {
                const row = icon.closest('tr');
                if (row) {
                    const jobId = row.querySelector('code')?.textContent;
                    if (jobId) expandedJobIds.add(jobId);
                }
            });

            tbody.innerHTML = '';

            if (!jobs || jobs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--muted)">No recent jobs found</td></tr>';
                return;
            }

            jobs.forEach((job, idx) => {
                const tr = document.createElement('tr');
                tr.className = 'expandable-row';
                tr.dataset.jobIndex = idx;
                const status = (job.status || (job.failedReason ? 'failed' : 'completed')).toLowerCase();
                const statusMap = {
                    failed: { label: 'Failed', cls: 'status-failed' },
                    completed: { label: 'Completed', cls: 'status-completed' },
                    active: { label: 'Active', cls: 'status-active' },
                    waiting: { label: 'Waiting', cls: 'status-waiting' },
                    delayed: { label: 'Delayed', cls: 'status-delayed' },
                    paused: { label: 'Paused', cls: 'status-paused' }
                };
                const statusInfo = statusMap[status] || statusMap.completed;

                const retryBtn = status === 'failed'
                    ? '<button class="retry-btn" onclick="retryJob(' + "'" + job.id + "'" + ', ' + "'" + (job.queue || currentQueue) + "'" + ')" title="Retry this job">↻ Retry</button>'
                    : '<span style="color: var(--muted); font-size: 11px;">—</span>';

                // Check if this job was previously expanded
                const isExpanded = expandedJobIds.has(job.id);

                tr.innerHTML =
                    '<td><span class="expand-icon' + (isExpanded ? ' expanded' : '') + '">▶</span><code>' + job.id + '</code></td>' +
                    '<td>' + job.name + '</td>' +
                    '<td>' + (job.queue || currentQueue) + '</td>' +
                    '<td><span class="status-badge ' +
                    statusInfo.cls +
                    '">' +
                    statusInfo.label +
                    '</span></td>' +
                    '<td>' + job.attempts + '</td>' +
                    '<td>' + new Date(job.timestamp).toLocaleTimeString() + '</td>' +
                    '<td>' + retryBtn + '</td>';
                if (job.failedReason) {
                    tr.title = 'Click to see error details';
                }

                tr.addEventListener('click', (e) => {
                    if (e.target.classList.contains('retry-btn')) return;
                    toggleJobDetails(tr, job);
                });

                tbody.appendChild(tr);

                // Auto-expand if this job was previously expanded
                if (isExpanded) {
                    setTimeout(() => {
                        toggleJobDetails(tr, job);
                    }, 10); // Small delay to ensure DOM is ready
                }
            });

            // Clean up expanded job IDs that are no longer in the current jobs list
            const currentJobIds = new Set(jobs.map(job => job.id));
            expandedJobIds = new Set([...expandedJobIds].filter(id => currentJobIds.has(id)));
        }`;
const getRenderLocksFunction = (): string => `
    // Track expanded lock keys to preserve state during SSE updates
    let expandedLockKeys = new Set();

    function renderLocks(payload) {
        const tbody = document.querySelector('#locks-table tbody');
        const locks = payload && payload.locks ? payload.locks : [];
        const metrics = payload && payload.metrics ? payload.metrics : null;
        const histogram = payload && payload.histogram ? payload.histogram : [];

        // Update summary and histogram (these don't cause layout shifts)
        updateLocksSummary(document.getElementById('locks-summary'), metrics);
        updateLocksHistogram(document.getElementById('locks-histogram'), histogram);

        if (!locks || locks.length === 0) {
            // Only clear if we have content to replace
            if (tbody.children.length > 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted)">No active locks found</td></tr>';
            }
            expandedLockKeys.clear();
            return;
        }

        // Create a map of current lock keys for efficient lookup
        const currentLockKeys = new Set(locks.map(lock => lock.key));

        // Remove rows for locks that no longer exist
        removeObsoleteLockRows(tbody, currentLockKeys);

        // Get map of existing rows
        const existingRows = getExistingLockRows(tbody);

        // Update existing rows and add new ones
        locks.forEach((lock, idx) => {
            const existingRow = existingRows.get(lock.key);
            if (existingRow) {
                updateExistingLockRow(existingRow, lock, idx);
            } else {
                const tr = createNewLockRow(lock, idx);
                tbody.appendChild(tr);

                // Auto-expand if this lock was previously expanded
                if (expandedLockKeys.has(lock.key)) {
                    setTimeout(() => {
                        toggleLockDetails(tr, lock);
                    }, 10);
                }
            }
        });

        // Clean up expanded lock keys that are no longer in the current locks list
        expandedLockKeys = new Set([...expandedLockKeys].filter(key => currentLockKeys.has(key)));
    }
`;

const getLockHelperFunctions = (): string => `
    function updateLocksSummary(summary, metrics) {
        if (!summary) return;
        if (metrics) {
            const rate = metrics.attempts > 0
                ? (metrics.collisionRate * 100).toFixed(1) + '%'
                : '0%';
            summary.innerHTML =
                '<span><strong>Active</strong> ' + metrics.active + '</span>' +
                '<span><strong>Attempts</strong> ' + metrics.attempts + '</span>' +
                '<span><strong>Collisions</strong> ' + metrics.collisions + '</span>' +
                '<span><strong>Collision rate</strong> ' + rate + '</span>';
        } else {
            summary.textContent = 'No metrics available.';
        }
    }

    function updateLocksHistogram(histogramEl, histogram) {
        if (!histogramEl) return;
        if (histogram.length === 0) {
            histogramEl.textContent = 'No TTL data available.';
        } else {
            histogramEl.innerHTML = histogram.map(bucket => {
                return '<div style="display:flex; justify-content: space-between; gap: 12px; margin: 4px 0;">' +
                    '<span style="color: var(--muted);">' + bucket.label + '</span>' +
                    '<span>' + bucket.count + '</span>' +
                    '</div>';
            }).join('');
        }
    }

    function removeObsoleteLockRows(tbody, currentLockKeys) {
        const rowsToRemove = [];
        for (let i = 0; i < tbody.children.length; i++) {
            const row = tbody.children[i];
            const lockKey = row.querySelector('code')?.textContent;
            if (lockKey && !currentLockKeys.has(lockKey)) {
                rowsToRemove.push(row);
                expandedLockKeys.delete(lockKey);
            }
        }
        rowsToRemove.forEach(row => row.remove());
    }

    function getExistingLockRows(tbody) {
        const existingRows = new Map();
        for (let i = 0; i < tbody.children.length; i++) {
            const row = tbody.children[i];
            const lockKey = row.querySelector('code')?.textContent;
            if (lockKey) {
                existingRows.set(lockKey, row);
            }
        }
        return existingRows;
    }

    function updateExistingLockRow(row, lock, idx) {
        const ttl = typeof lock.ttl === 'number' ? Math.round(lock.ttl / 1000) + 's' : '—';
        const expires = lock.expires ? new Date(lock.expires).toLocaleTimeString() : '—';

        const ttlCell = row.children[1];
        const expiresCell = row.children[2];
        if (ttlCell) ttlCell.textContent = ttl;
        if (expiresCell) expiresCell.textContent = expires;

        row.dataset.lockIndex = idx;
    }

    function createNewLockRow(lock, idx) {
        const tr = document.createElement('tr');
        tr.className = 'expandable-row';
        tr.dataset.lockIndex = idx;

        const ttl = typeof lock.ttl === 'number' ? Math.round(lock.ttl / 1000) + 's' : '—';
        const expires = lock.expires ? new Date(lock.expires).toLocaleTimeString() : '—';
        const isExpanded = expandedLockKeys.has(lock.key);

        tr.innerHTML =
            '<td><span class="expand-icon' + (isExpanded ? ' expanded' : '') + '">▶</span><code>' + lock.key + '</code></td>' +
            '<td>' + ttl + '</td>' +
            '<td>' + expires + '</td>';
        tr.title = 'Click to see lock details';

        tr.addEventListener('click', () => {
            toggleLockDetails(tr, lock);
        });

        return tr;
    }
`;

const getErrorAndTooltipFunctions = (): string => `
        function showError(msg) {
            const el = document.getElementById('error-container');
            el.textContent = msg;
            el.style.display = 'block';
        }

        let tooltipEl = null;
        function showTooltip(e) {
            const info = e.target.getAttribute('data-info');
            if (!info) return;

            if (!tooltipEl) {
                tooltipEl = document.createElement('div');
                tooltipEl.className = 'tooltip';
                document.body.appendChild(tooltipEl);
            }

            tooltipEl.textContent = info;
            tooltipEl.classList.add('show');

            const rect = e.target.getBoundingClientRect();
            tooltipEl.style.left = Math.min(rect.left, window.innerWidth - tooltipEl.offsetWidth - 10) + 'px';
            tooltipEl.style.top = (rect.bottom + 8) + 'px';
        }

        function hideTooltip() {
            if (tooltipEl) {
                tooltipEl.classList.remove('show');
            }
        }`;

const getToggleDetailsFunctions = (): string => `
        function toggleJobDetails(row, job) {
            const expandIcon = row.querySelector('.expand-icon');
            const existingDetail = row.nextElementSibling;

            if (existingDetail && existingDetail.classList.contains('detail-row')) {
                expandIcon.classList.remove('expanded');
                existingDetail.remove();
                // Remove from expanded set
                expandedJobIds.delete(job.id);
                return;
            }

            expandIcon.classList.add('expanded');
            // Add to expanded set
            expandedJobIds.add(job.id);

            const detailRow = document.createElement('tr');
            detailRow.className = 'detail-row';

            const jobData = {
                id: job.id,
                name: job.name,
                queue: currentQueue,
                status: job.status || (job.failedReason ? 'failed' : 'completed'),
                attempts: job.attempts,
                timestamp: new Date(job.timestamp).toISOString(),
                data: job.data || {},
                failedReason: job.failedReason || null,
                processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
                finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
                returnvalue: job.returnvalue
            };

            detailRow.innerHTML =
                '<td colspan="7" class="detail-cell">' +
                '<div class="detail-content">' +
                '<strong style="color: var(--accent); display: block; margin-bottom: 8px;">Job Details:</strong>' +
                '<pre>' + JSON.stringify(jobData, null, 2) + '</pre>' +
                '</div>' +
                '</td>';

            row.parentNode.insertBefore(detailRow, row.nextSibling);
        }

        function toggleLockDetails(row, lock) {
            const expandIcon = row.querySelector('.expand-icon');
            const existingDetail = row.nextElementSibling;

            if (existingDetail && existingDetail.classList.contains('detail-row')) {
                expandIcon.classList.remove('expanded');
                existingDetail.remove();
                // Remove from expanded set
                expandedLockKeys.delete(lock.key);
                return;
            }

            expandIcon.classList.add('expanded');
            // Add to expanded set
            expandedLockKeys.add(lock.key);

            const detailRow = document.createElement('tr');
            detailRow.className = 'detail-row';

            const lockData = {
                key: lock.key,
                ttl: lock.ttl,
                ttlSeconds: typeof lock.ttl === 'number' ? Math.round(lock.ttl / 1000) : null,
                expires: lock.expires ? new Date(lock.expires).toISOString() : null,
                expiresLocal: lock.expires ? new Date(lock.expires).toLocaleString() : null,
                value: lock.value || null,
                metadata: lock.metadata || {}
            };

            detailRow.innerHTML =
                '<td colspan="3" class="detail-cell">' +
                '<div class="detail-content">' +
                '<strong style="color: var(--accent); display: block; margin-bottom: 8px;">Lock Details:</strong>' +
                '<pre>' + JSON.stringify(lockData, null, 2) + '</pre>' +
                '</div>' +
                '</td>';

            row.parentNode.insertBefore(detailRow, row.nextSibling);
        }`;

const getRetryJobFunction = (): string => `
        async function retryJob(jobId, queueName) {
            try {
                const btn = event.target;
                btn.disabled = true;
                btn.textContent = '⏳ Retrying...';

                const res = await fetch(API_BASE + '/api/retry/' + queueName + '/' + jobId, {
                    method: 'POST'
                });

                if (res.ok) {
                    btn.textContent = '✓ Retried';
                    setTimeout(() => {
                        console.log('HTTP jobs polling disabled - using SSE only');
                        // fetchJobs(currentQueue);
                    }, 1000);
                } else {
                    btn.textContent = '✗ Failed';
                    btn.disabled = false;
                }
            } catch (e) {
                console.error('Failed to retry job', e);
                const btn = event.target;
                btn.textContent = '✗ Failed';
                btn.disabled = false;
            }
        }`;

const getDashboardScriptHelpers = (): string => `
        function getLockPattern() {
            const patternInput = document.getElementById('lock-pattern');
            return patternInput && patternInput.value ? patternInput.value : '*';
        }

        function buildEventsUrl(queue, pattern) {
            const q = queue || '';
            const p = pattern || '*';
            return API_BASE + '/api/events?queue=' + encodeURIComponent(q) + '&pattern=' + encodeURIComponent(p);
        }
`;

const getDashboardScriptEventStream = (): string => `
        function setupEventStream(queueOverride) {
            if (!window.EventSource) return;

            const queue = queueOverride || currentQueue;
            const pattern = getLockPattern();

            if (eventSource && queue === lastSseQueue && pattern === lastSsePattern) return;

            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }

            lastSseQueue = queue;
            lastSsePattern = pattern;
            eventSource = new EventSource(buildEventsUrl(queue, pattern));

            eventSource.onopen = () => {
                sseActive = true;
                stopAutoRefresh();
            };

            eventSource.onmessage = (evt) => {
                try {
                    const payload = JSON.parse(evt.data);
                    if (!payload || !payload.type) return;

                    if (payload.type === 'snapshot') {
                        if (payload.snapshot) {
                            renderStats(payload.snapshot);
                            updateQueueSelect(payload.snapshot.queues || []);
                        }

                        if (payload.queue && payload.queue !== currentQueue) {
                            currentQueue = payload.queue;
                            localStorage.setItem(QUEUE_KEY, currentQueue);
                            const select = document.getElementById('queue-select');
                            if (select) select.value = currentQueue;
                        }

                        if (payload.jobs) renderJobs(payload.jobs);
                        if (payload.locks) renderLocks(payload.locks);

                        document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
                    }
                } catch (err) {
                    console.error('Failed to parse SSE payload', err);
                }
            };

            eventSource.onerror = () => {
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                sseActive = false;
                if (autoRefreshEnabled) startAutoRefresh();
            };
        }
`;

const getFetchDataFunction = (): string => `
        // HTTP polling disabled - 100% SSE reliance
        async function fetchData() {
            console.log('HTTP polling disabled - using SSE only');
            // Disabled to ensure 100% SSE streaming
            /*
            try {
                document.getElementById('error-container').style.display = 'none';
                const res = await fetch(API_BASE + '/api/snapshot');
                if (!res.ok) throw new Error('Failed to fetch stats');
                const data = await res.json();

                renderStats(data);
                updateQueueSelect(data.queues);
                handleQueueSelection(data);
                await fetchLocks();
                document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
            } catch (e) {
                showError(e.message);
            }
            */
        }

        function handleQueueSelection(data) {
            if (data.queues.length > 0) {
                document.getElementById('queue-select').value = currentQueue;
            } else {
                document.getElementById('queue-select').innerHTML = '<option>No Queues</option>';
                renderJobs([]);
            }
        }
    `;

const getDashboardScriptFetch = (): string => `
        // HTTP polling disabled - 100% SSE reliance
        async function fetchJobs(queue) {
            console.log('HTTP jobs polling disabled - using SSE only');
            // Disabled to ensure 100% SSE streaming
            /*
            try {
                const res = await fetch(API_BASE + '/api/jobs/' + queue);
                const jobs = await res.json();
                renderJobs(jobs);
            } catch (e) {
                console.error('Failed to fetch jobs', e);
            }
            */
        }

        // HTTP polling disabled - 100% SSE reliance
        async function fetchLocks() {
            console.log('HTTP locks polling disabled - using SSE only');
            // Disabled to ensure 100% SSE streaming
            /*
            try {
                const pattern = getLockPattern();
                const res = await fetch(API_BASE + '/api/locks?pattern=' + encodeURIComponent(pattern));
                const data = await res.json();
                renderLocks(data);
            } catch (e) {
                console.error('Failed to fetch locks', e);
            }
            */
        }
`;

const getDashboardScriptRender = (): string =>
  [
    getRenderStatsFunction(),
    getUpdateQueueSelectFunction(),
    getRenderJobsFunction(),
    getRenderLocksFunction(),
    getLockHelperFunctions(),
    getErrorAndTooltipFunctions(),
    getToggleDetailsFunctions(),
    getRetryJobFunction(),
  ].join('\n');

const getDashboardScriptBootstrap = (): string => `
        const themeButton = document.getElementById('theme-toggle');
        if (themeButton) {
            themeButton.addEventListener('click', toggleTheme);
        }

        const autoRefreshButton = document.getElementById('auto-refresh-toggle');
        if (autoRefreshButton) {
            autoRefreshButton.addEventListener('click', toggleAutoRefresh);
        }

        const queueSelect = document.getElementById('queue-select');
        if (queueSelect) {
            queueSelect.addEventListener('change', (e) => {
                currentQueue = e.target.value;
                localStorage.setItem(QUEUE_KEY, currentQueue);
                console.log('Queue changed - SSE will update automatically');

                setupEventStream(currentQueue);
            });
        }

        const lockRefresh = document.getElementById('lock-refresh');
        if (lockRefresh) {
            lockRefresh.addEventListener('click', () => {
                console.log('Lock refresh disabled - SSE handles updates');
                // fetchLocks(); // Disabled - SSE handles updates
                setupEventStream(currentQueue);
            });
        }

        const storedAutoRefresh = localStorage.getItem(AUTO_REFRESH_KEY);
        const initialAutoRefresh = storedAutoRefresh === null
            ? AUTO_REFRESH
            : storedAutoRefresh === 'true';

        applyTheme(getPreferredTheme());
        console.log('HTTP polling disabled - 100% SSE streaming active');
        // fetchData(); // Disabled - SSE handles initial data
        setAutoRefresh(initialAutoRefresh);

        setupEventStream(currentQueue);

        window.addEventListener('beforeunload', () => {
            if (eventSource) {
                eventSource.close();
            }
        });
`;

const getDashboardScript = (options: DashboardUiOptions): string =>
  [
    getDashboardScriptState(options),
    getDashboardScriptTheme(),
    getDashboardScriptAutoRefresh(),
    getDashboardScriptHelpers(),
    getDashboardScriptEventStream(),
    getFetchDataFunction(),
    getDashboardScriptFetch(),
    getDashboardScriptRender(),
    getDashboardScriptBootstrap(),
  ].join('\n');

export const getDashboardHtml = (options: DashboardUiOptions): string => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZinTrust Queue Monitor</title>
    <style>
${getDashboardStyles()}
    </style>
</head>
<body>
${getDashboardBody()}

    <script>
${getDashboardScript(options)}
    </script>
</body>
</html>`;
