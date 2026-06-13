export type DashboardUiOptions = {
  basePath: string;
  autoRefresh: boolean;
  refreshIntervalMs: number;
  appName?: string;
};

import { BrandFavicon } from './BrandFavicon.js';

const resolveAppName = (appName?: string): string => {
  return typeof appName === 'string' && appName.trim() !== '' ? appName.trim() : 'ZinTrust';
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
.recover-btn { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border-color: rgba(245, 158, 11, 0.35); }
.recover-btn:hover { background: rgba(245, 158, 11, 0.2); }

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

const getHeaderSection = (appName: string): string => `
    <header>
        <div class="brand">
            <div class="logo-frame">
                ${getLogoSvg()}
            </div>
            <div>
                <b>ZinTrust ${appName}'s</b>
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
<svg width="26" height="26" viewBox="0 0 100 100" fill="none" class="logo-img" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <circle cx="50" cy="50" r="25" stroke="#1e293b" stroke-width="10" />
    <path d="M50 25 A25 25 0 0 1 75 50" stroke="#0ea5e9" stroke-width="10" stroke-linecap="round" />
    <circle cx="50" cy="50" r="9" fill="#22c55e" />
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

const getDashboardBody = (appName: string): string => `
    <div class="page">
        <div class="shell">
            ${getHeaderSection(appName)}

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
    const STREAM_RESET_MS = Math.max(15000, REFRESH_INTERVAL * 4);
    const API_BASE = ${JSON.stringify(options.basePath)};
    const ALL_QUEUES = '__all__';
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
        let reconnectTimer = null;
        let streamWatchdogTimer = null;
        let dashboardResetTimer = null;
        let reconnectAttempts = 0;
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
                clearSseTimers();
                clearError();
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

            cards.forEach((card, index) => {
                let div = grid.children[index];
                let labelEl;
                let valueEl;
                let iconEl;

                if (!div) {
                    div = document.createElement('div');
                    div.className = 'tile';

                    const header = document.createElement('div');
                    header.className = 'stat-header';

                    labelEl = document.createElement('div');
                    labelEl.className = 'stat-label';

                    iconEl = document.createElement('span');
                    iconEl.className = 'info-icon';
                    iconEl.textContent = 'i';
                    iconEl.addEventListener('mouseenter', showTooltip);
                    iconEl.addEventListener('mouseleave', hideTooltip);

                    valueEl = document.createElement('div');
                    valueEl.className = 'stat-value';

                    header.appendChild(labelEl);
                    header.appendChild(iconEl);
                    div.appendChild(header);
                    div.appendChild(valueEl);
                    grid.appendChild(div);
                } else {
                    labelEl = div.querySelector('.stat-label');
                    valueEl = div.querySelector('.stat-value');
                    iconEl = div.querySelector('.info-icon');
                }

                if (labelEl) labelEl.textContent = card.label;
                if (valueEl) {
                    valueEl.textContent = String(card.value);
                    valueEl.style.color = card.color || '';
                }
                if (iconEl) iconEl.setAttribute('data-info', card.info);
            });

            while (grid.children.length > cards.length) {
                grid.removeChild(grid.lastElementChild);
            }
        }`;

const getUpdateQueueSelectHelpersFunction = (): string => `
        function formatQueueOptionCounts(counts) {
            return counts.waiting + ' waiting, ' + counts.failed + ' failed, ' + counts.completed + ' completed';
        }

        function getPreferredQueue(select) {
            const storedQueue = localStorage.getItem(QUEUE_KEY);
            return currentQueue || select.value || storedQueue || '';
        }

        function getEmptyQueueSelection(select) {
            select.disabled = true;
            if (select.options.length !== 1 || select.options[0].value !== '' || select.options[0].textContent !== 'No queues') {
                select.innerHTML = '<option value="">No queues</option>';
            }
            return '';
        }

        function getDesiredQueueOptions(queues) {
            const totalWaiting = queues.reduce((acc, queue) => acc + queue.counts.waiting, 0);
            const totalFailed = queues.reduce((acc, queue) => acc + queue.counts.failed, 0);
            const totalCompleted = queues.reduce((acc, queue) => acc + queue.counts.completed, 0);

            return [
                {
                    value: ALL_QUEUES,
                    text: 'All queues (' + totalWaiting + ' waiting, ' + totalFailed + ' failed, ' + totalCompleted + ' completed)'
                },
                ...queues.map(q => ({
                    value: q.name,
                    text: q.name + ' (' + formatQueueOptionCounts(q.counts) + ')'
                }))
            ];
        }

        function syncQueueSelectOptions(select, desiredOptions) {
            const existingOptions = new Map();
            Array.from(select.options).forEach(option => {
                existingOptions.set(option.value, option);
            });
            const existingValues = Array.from(select.options).map(option => option.value);
            const desiredValues = desiredOptions.map(option => option.value);
            const needsStructuralSync = existingValues.length !== desiredValues.length || desiredValues.some((value, index) => existingValues[index] !== value);

            select.disabled = false;

            desiredOptions.forEach((item, index) => {
                let option = existingOptions.get(item.value);
                if (!option) {
                    option = document.createElement('option');
                    option.value = item.value;
                }

                if (option.textContent !== item.text) {
                    option.textContent = item.text;
                }

                if (needsStructuralSync) {
                    const currentAtIndex = select.options[index];
                    if (currentAtIndex !== option) {
                        select.insertBefore(option, currentAtIndex || null);
                    }
                }
            });

            if (needsStructuralSync) {
                Array.from(select.options).forEach(option => {
                    if (!desiredOptions.some(item => item.value === option.value)) {
                        option.remove();
                    }
                });
            }
        }
`;

const getUpdateQueueSelectFunction = (): string => `

        function updateQueueSelect(queues) {
            const select = document.getElementById('queue-select');
            const preferredQueue = getPreferredQueue(select);

            if (queues.length === 0) {
                return getEmptyQueueSelection(select);
            }

            const queueNames = queues.map(q => q.name);
            const nextQueue = preferredQueue === ALL_QUEUES || queueNames.includes(preferredQueue)
                ? preferredQueue
                : queueNames[0];
            const desiredOptions = getDesiredQueueOptions(queues);

            if (document.activeElement === select) {
                return nextQueue;
            }

            syncQueueSelectOptions(select, desiredOptions);

            if (select.value !== nextQueue) {
                select.value = nextQueue;
            }
            return nextQueue;
        }`;

const getRenderJobsStateFunction = (): string => `
        // Track expanded job IDs to preserve state during SSE updates
        let expandedJobIds = new Set();
`;

const getRenderJobsIdentityHelpersFunction = (): string => `
        function getJobId(job) {
            const queue = job.queue || currentQueue || '';
            const id = job.id == null ? '' : String(job.id);
            const timestamp = Number.isFinite(job.timestamp) ? String(job.timestamp) : '';
            return queue + '::' + id + '::' + timestamp;
        }

        function getAdjacentJobDetailRow(row) {
            const existingDetail = row.nextElementSibling;
            return existingDetail && existingDetail.classList.contains('detail-row')
                ? existingDetail
                : null;
        }

        function getJobStatusInfo(job) {
            const status = (job.status || (job.failedReason ? 'failed' : 'completed')).toLowerCase();
            const statusMap = {
                failed: { label: 'Failed', cls: 'status-failed' },
                completed: { label: 'Completed', cls: 'status-completed' },
                active: { label: 'Active', cls: 'status-active' },
                waiting: { label: 'Waiting', cls: 'status-waiting' },
                delayed: { label: 'Delayed', cls: 'status-delayed' },
                paused: { label: 'Paused', cls: 'status-paused' }
            };

            return statusMap[status] || statusMap.completed;
        }

        function getJobRetryMarkup(job) {
            const status = (job.status || (job.failedReason ? 'failed' : 'completed')).toLowerCase();
            if (status === 'active') {
                return '<button class="retry-btn recover-btn" onclick="recoverActiveJob(' + "'" + job.id + "'" + ', ' + "'" + (job.queue || currentQueue) + "'" + ')" title="Recover this active job">Recover</button>';
            }
            if (status === 'failed') {
                return '<button class="retry-btn" onclick="retryJob(' + "'" + job.id + "'" + ', ' + "'" + (job.queue || currentQueue) + "'" + ')" title="Retry this job">↻ Retry</button>';
            }
            return '<span style="color: var(--muted); font-size: 11px;">—</span>';
        }
`;

const getRenderJobsDetailRowHelpersFunction = (): string => `

        function buildJobDetailMarkup(job) {
            const jobData = {
                id: job.id,
                name: job.name,
                queue: job.queue || currentQueue,
                status: job.status || (job.failedReason ? 'failed' : 'completed'),
                attempts: job.attempts,
                timestamp: new Date(job.timestamp).toISOString(),
                data: job.data || {},
                failedReason: job.failedReason || null,
                processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
                finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
                returnvalue: job.returnvalue
            };

            return '<td colspan="7" class="detail-cell">' +
                '<div class="detail-content">' +
                '<strong style="color: var(--accent); display: block; margin-bottom: 8px;">Job Details:</strong>' +
                '<pre>' + JSON.stringify(jobData, null, 2) + '</pre>' +
                '</div>' +
                '</td>';
        }

        function removeJobDetailRow(row) {
            const existingDetail = getAdjacentJobDetailRow(row);
            if (existingDetail) {
                existingDetail.remove();
            }
        }

        function buildOrUpdateJobDetailRow(job, existingDetail) {
            let detailRow = existingDetail;
            if (!detailRow) {
                detailRow = document.createElement('tr');
                detailRow.className = 'detail-row';
            }

            detailRow.dataset.jobId = getJobId(job);
            detailRow.innerHTML = buildJobDetailMarkup(job);
            return detailRow;
        }

        function upsertJobDetailRow(row, job, parent) {
            const detailRow = buildOrUpdateJobDetailRow(job, getAdjacentJobDetailRow(row));

            if (parent) {
                parent.appendChild(detailRow);
            } else {
                row.parentNode.insertBefore(detailRow, row.nextSibling);
            }

            return detailRow;
        }
`;

const getRenderJobsEmptyStateFunction = (): string => `

        function ensureEmptyJobsState(tbody) {
            if (
                tbody.children.length === 1 &&
                tbody.children[0].textContent.includes('No recent jobs found')
            ) {
                return;
            }

            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--muted)">No recent jobs found</td></tr>';
        }
`;

const getRenderJobsRowHelpersFunction = (): string => `
        function createJobRow(job, idx) {
            const tr = document.createElement('tr');
            tr.className = 'expandable-row';
            tr.addEventListener('click', (e) => {
                if (e.target.classList.contains('retry-btn')) return;
                if (e.target.classList.contains('recover-btn')) return;
                toggleJobDetails(tr, tr.__jobData);
            });
            updateExistingJobRow(tr, job, idx);
            return tr;
        }

        function formatDateTime(value) {
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) {
                return '—';
            }
            return date.toLocaleString();
        }

        function updateExistingJobRow(tr, job, idx) {
            const jobId = getJobId(job);
            const statusInfo = getJobStatusInfo(job);
            const isExpanded = expandedJobIds.has(jobId);

            tr.__jobData = job;
            tr.dataset.jobId = jobId;
            tr.dataset.jobIndex = idx;
            tr.innerHTML =
                '<td><span class="expand-icon' + (isExpanded ? ' expanded' : '') + '">▶</span><code>' + job.id + '</code></td>' +
                '<td>' + job.name + '</td>' +
                '<td>' + (job.queue || currentQueue) + '</td>' +
                '<td><span class="status-badge ' + statusInfo.cls + '">' + statusInfo.label + '</span></td>' +
                '<td>' + job.attempts + '</td>' +
                '<td>' + formatDateTime(job.timestamp) + '</td>' +
                '<td>' + getJobRetryMarkup(job) + '</td>';

            if (job.failedReason) {
                tr.title = 'Click to see error details';
            } else {
                tr.removeAttribute('title');
            }
        }

        function getExistingJobRows(tbody) {
            const rows = new Map();
            Array.from(tbody.querySelectorAll('tr.expandable-row')).forEach(row => {
                const jobId = row.dataset.jobId || row.querySelector('code')?.textContent;
                if (jobId) rows.set(jobId, row);
            });
            return rows;
        }

        function getExistingJobDetailRows(tbody) {
            const rows = new Map();
            Array.from(tbody.querySelectorAll('tr.detail-row')).forEach(row => {
                const jobId = row.dataset.jobId;
                if (jobId) rows.set(jobId, row);
            });
            return rows;
        }

        function removeObsoleteJobRows(tbody, currentJobIds) {
            Array.from(tbody.querySelectorAll('tr.expandable-row')).forEach(row => {
                const jobId = row.dataset.jobId || row.querySelector('code')?.textContent;
                if (!jobId || currentJobIds.has(jobId)) return;
                removeJobDetailRow(row);
                row.remove();
                expandedJobIds.delete(jobId);
            });
        }
`;

const getRenderJobsFunction = (): string => `
        function renderJobs(jobs) {
            const tbody = document.querySelector('#jobs-table tbody');
            const jobList = Array.isArray(jobs) ? jobs : [];

            if (jobList.length === 0) {
                ensureEmptyJobsState(tbody);
                expandedJobIds.clear();
                return;
            }

            const currentJobIds = new Set(jobList.map(job => getJobId(job)));
            const existingRows = getExistingJobRows(tbody);
            const existingDetailRows = getExistingJobDetailRows(tbody);
            const fragment = document.createDocumentFragment();

            jobList.forEach((job, idx) => {
                const jobId = getJobId(job);
                const existingRow = existingRows.get(jobId);
                const row = existingRow || createJobRow(job, idx);

                if (existingRow) {
                    updateExistingJobRow(row, job, idx);
                }

                fragment.appendChild(row);
                if (expandedJobIds.has(jobId)) {
                    fragment.appendChild(buildOrUpdateJobDetailRow(job, existingDetailRows.get(jobId)));
                }
            });

            expandedJobIds = new Set([...expandedJobIds].filter(id => currentJobIds.has(id)));
            tbody.replaceChildren(fragment);
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
        const expires = lock.expires ? formatDateTime(lock.expires) : '—';

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
        const expires = lock.expires ? formatDateTime(lock.expires) : '—';
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

        function clearError() {
            const el = document.getElementById('error-container');
            el.textContent = '';
            el.style.display = 'none';
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
            const jobId = getJobId(job);

            if (existingDetail && existingDetail.classList.contains('detail-row')) {
                expandIcon.classList.remove('expanded');
                existingDetail.remove();
                // Remove from expanded set
                expandedJobIds.delete(jobId);
                return;
            }

            expandIcon.classList.add('expanded');
            // Add to expanded set
            expandedJobIds.add(jobId);
            upsertJobDetailRow(row, job);
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

const getRecoverActiveJobFunction = (): string => `
        async function recoverActiveJob(jobId, queueName) {
            try {
                const btn = event.target;
                btn.disabled = true;
                btn.textContent = 'Recovering...';

                const res = await fetch(API_BASE + '/api/recover-active/' + queueName + '/' + jobId, {
                    method: 'POST'
                });
                const payload = await res.json().catch(() => null);

                if (res.ok) {
                    btn.textContent = payload && payload.status === 'removed_after_delayed_retry'
                        ? 'Removed'
                        : 'Recovered';
                    setTimeout(() => {
                        console.log('HTTP jobs polling disabled - using SSE only');
                    }, 1000);
                } else {
                    btn.textContent = 'Failed';
                    btn.disabled = false;
                }
            } catch (e) {
                console.error('Failed to recover active job', e);
                const btn = event.target;
                btn.textContent = 'Failed';
                btn.disabled = false;
            }
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
                const payload = await res.json().catch(() => null);

                if (res.ok) {
                    btn.textContent = payload && payload.status === 'requeued_from_snapshot'
                        ? '✓ Requeued'
                        : '✓ Retried';
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

        function clearSseTimers() {
            if (reconnectTimer !== null) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            if (streamWatchdogTimer !== null) {
                clearTimeout(streamWatchdogTimer);
                streamWatchdogTimer = null;
            }

            if (dashboardResetTimer !== null) {
                clearTimeout(dashboardResetTimer);
                dashboardResetTimer = null;
            }
        }

        function scheduleDashboardReset(message) {
            if (dashboardResetTimer !== null) return;

            showError(message || 'Live updates stalled. Resetting dashboard...');
            dashboardResetTimer = window.setTimeout(() => {
                window.location.reload();
            }, STREAM_RESET_MS);
        }

        function armStreamWatchdog() {
            if (!autoRefreshEnabled) return;

            if (streamWatchdogTimer !== null) {
                clearTimeout(streamWatchdogTimer);
            }

            streamWatchdogTimer = window.setTimeout(() => {
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                sseActive = false;
                streamWatchdogTimer = null;
                scheduleDashboardReset('Live updates stalled. Resetting dashboard...');
            }, STREAM_RESET_MS);
        }

        function markStreamHealthy() {
            reconnectAttempts = 0;
            if (reconnectTimer !== null) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            clearError();
            armStreamWatchdog();
        }

        function scheduleReconnect() {
            if (!autoRefreshEnabled || reconnectTimer !== null) return;

            reconnectAttempts += 1;
            const delay = Math.min(1000 * reconnectAttempts, 5000);
            showError('Live updates disconnected. Reconnecting...');

            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                setupEventStream(currentQueue);
            }, delay);

            if (reconnectAttempts >= 4) {
                scheduleDashboardReset('Live updates could not reconnect. Resetting dashboard...');
            }
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
            if (!autoRefreshEnabled) return;

            const queue = queueOverride === undefined ? currentQueue : queueOverride;
            const pattern = getLockPattern();

            if (eventSource && sseActive && queue === lastSseQueue && pattern === lastSsePattern) return;

            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }

            lastSseQueue = queue;
            lastSsePattern = pattern;
            eventSource = new EventSource(buildEventsUrl(queue, pattern));
            armStreamWatchdog();

            eventSource.onopen = () => {
                sseActive = true;
                stopAutoRefresh();
                markStreamHealthy();
            };

            eventSource.onmessage = (evt) => {
                try {
                    const payload = JSON.parse(evt.data);
                    if (!payload || !payload.type) return;

                    if (payload.type === 'snapshot') {
                        if (payload.snapshot) {
                            renderStats(payload.snapshot);
                            const nextQueue = updateQueueSelect(payload.snapshot.queues || []);
                            if (nextQueue !== currentQueue) {
                                currentQueue = nextQueue;
                                if (currentQueue) {
                                    localStorage.setItem(QUEUE_KEY, currentQueue);
                                } else {
                                    localStorage.removeItem(QUEUE_KEY);
                                }
                            }
                        }

                        if (!currentQueue) {
                            renderJobs([]);
                        }

                        if (payload.jobs && (!payload.queue || payload.queue === currentQueue)) {
                            renderJobs(payload.jobs);
                        }
                        if (payload.locks) renderLocks(payload.locks);

                        const lastUpdated = document.getElementById('last-updated');
                        if (lastUpdated) {
                            lastUpdated.textContent = formatDateTime(new Date());
                        }
                        markStreamHealthy();
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
                scheduleReconnect();
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
                document.getElementById('last-updated').textContent = formatDateTime(new Date());
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
    getUpdateQueueSelectHelpersFunction(),
    getUpdateQueueSelectFunction(),
    getRenderJobsStateFunction(),
    getRenderJobsIdentityHelpersFunction(),
    getRenderJobsDetailRowHelpersFunction(),
    getRenderJobsEmptyStateFunction(),
    getRenderJobsRowHelpersFunction(),
    getRenderJobsFunction(),
    getRenderLocksFunction(),
    getLockHelperFunctions(),
    getErrorAndTooltipFunctions(),
    getToggleDetailsFunctions(),
    getRecoverActiveJobFunction(),
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
                if (currentQueue) {
                    localStorage.setItem(QUEUE_KEY, currentQueue);
                } else {
                    localStorage.removeItem(QUEUE_KEY);
                }
                console.log('Queue changed - SSE will update automatically');
                clearError();

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
            clearSseTimers();
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

export const getDashboardHtml = (options: DashboardUiOptions): string => {
  const appName = resolveAppName(options.appName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${appName} Queue Monitor</title>
    <link rel="icon" type="image/svg+xml" href="${BrandFavicon.forQueueMonitor()}">
    <style>
${getDashboardStyles()}
    </style>
</head>
<body>
${getDashboardBody(appName)}

    <script>
${getDashboardScript(options)}
    </script>
</body>
</html>`;
};
