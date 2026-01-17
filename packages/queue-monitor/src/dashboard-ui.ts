export type DashboardUiOptions = {
  autoRefresh: boolean;
  refreshIntervalMs: number;
};

const getDashboardStyles = (): string => `
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
}

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
}

/* Dashboard Specific Styles */
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

.stat-value { font-size: 28px; font-weight: 800; color: var(--text); margin-top: 8px; line-height: 1; }
.stat-label { font-size: 12px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }

.status-badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; letter-spacing: 0.02em; }
.status-completed { background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); }
.status-failed { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }

.refresh-btn { background: rgba(255,255,255,0.03); color: var(--text); border: 1px solid var(--border); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }
.refresh-btn:hover { background: rgba(255,255,255,0.08); border-color: var(--muted); }

html[data-theme="light"] .refresh-btn { background: rgba(2, 132, 199, 0.08); }
html[data-theme="light"] .refresh-btn:hover { background: rgba(2, 132, 199, 0.16); }

#error-container { display: none; margin-bottom: 2rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 0.5rem; font-size: 13px; font-weight: 600; }
code { background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; color: var(--accent); border: 1px solid var(--border); }
`;

const getDashboardBody = (): string => `
    <div class="page">
        <div class="shell">
            <header>
                <div class="brand">
                    <div class="logo-frame">
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
                    </div>
                    <div>
                        <b>ZinTrust</b>
                        <span>Queue Monitor</span>
                    </div>
                </div>
                <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
                    <span id="last-updated" style="color: var(--muted); font-size: 12px;"></span>
                    <button id="theme-toggle" class="refresh-btn" type="button">Light mode</button>
                    <button id="auto-refresh-toggle" class="refresh-btn" type="button">Pause auto refresh</button>
                    <button class="refresh-btn" onclick="fetchData()" type="button">Refresh</button>
                </div>
            </header>

            <section id="error-container"></section>

            <div class="grid" id="stats-grid">
                <!-- Stats inserted here -->
            </div>

            <div class="tile" style="margin-top: 24px; padding: 0;">
                <div style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
                    <h3 style="margin: 0; font-size: 14px; font-weight: 800; color: var(--text);">Recent Jobs</h3>
                    <select id="queue-select" onchange="fetchData()">
                        <!-- Queues inserted here -->
                    </select>
                </div>
                <div style="overflow-x: auto;">
                    <table id="jobs-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Job Name</th>
                                <th>Queue</th>
                                <th>Status</th>
                                <th>Attempts</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
`;

const getDashboardScriptState = (options: DashboardUiOptions): string => String.raw`
        const AUTO_REFRESH = ${options.autoRefresh ? 'true' : 'false'};
        const REFRESH_INTERVAL = ${Math.max(1000, Math.floor(options.refreshIntervalMs || 0))};
            const API_BASE = window.location.pathname.endsWith('/')
                ? window.location.pathname.slice(0, -1)
                : window.location.pathname;
        const THEME_KEY = 'zintrust-queue-monitor-theme';
        const AUTO_REFRESH_KEY = 'zintrust-queue-monitor-auto-refresh';
        let currentQueue = 'default';
        let autoRefreshEnabled = AUTO_REFRESH;
        let refreshTimer = null;
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
            if (!autoRefreshEnabled || refreshTimer !== null) return;
            refreshTimer = setInterval(fetchData, REFRESH_INTERVAL);
        }

        function stopAutoRefresh() {
            if (refreshTimer === null) return;
            clearInterval(refreshTimer);
            refreshTimer = null;
        }

        function setAutoRefresh(enabled) {
            autoRefreshEnabled = enabled;
            localStorage.setItem(AUTO_REFRESH_KEY, String(enabled));
            if (autoRefreshEnabled) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
            updateAutoRefreshButton();
        }

        function toggleAutoRefresh() {
            setAutoRefresh(!autoRefreshEnabled);
        }
`;

const getDashboardScriptFetch = (): string => `
        async function fetchData() {
            try {
                document.getElementById('error-container').style.display = 'none';
                const res = await fetch(API_BASE + '/api/snapshot');
                if (!res.ok) throw new Error('Failed to fetch stats');
                const data = await res.json();

                renderStats(data);
                updateQueueSelect(data.queues);

                if (data.queues.length > 0) {
                     if (!data.queues.find(q => q.name === currentQueue)) {
                         currentQueue = data.queues[0].name;
                     }
                     document.getElementById('queue-select').value = currentQueue;
                     await fetchJobs(currentQueue);
                } else {
                     document.getElementById('queue-select').innerHTML = '<option>No Queues</option>';
                     renderJobs([]);
                }

                document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
            } catch (e) {
                showError(e.message);
            }
        }

        async function fetchJobs(queue) {
            try {
                const res = await fetch(API_BASE + '/api/jobs/' + queue);
                const jobs = await res.json();
                renderJobs(jobs);
            } catch (e) {
                console.error('Failed to fetch jobs', e);
            }
        }
`;

const getDashboardScriptRender = (): string => `
        function renderStats(data) {
            const grid = document.getElementById('stats-grid');
            grid.innerHTML = '';

            const totalActive = data.queues.reduce((acc, q) => acc + q.counts.active, 0);
            const totalFailed = data.queues.reduce((acc, q) => acc + q.counts.failed, 0);
            const totalDelayed = data.queues.reduce((acc, q) => acc + q.counts.delayed, 0);

            const cards = [
                { label: 'Active Jobs', value: totalActive },
                { label: 'Failed Jobs', value: totalFailed, color: totalFailed > 0 ? '#f87171' : null },
                { label: 'Delayed', value: totalDelayed },
                { label: 'Queues', value: data.queues.length }
            ];

            cards.forEach(card => {
                const div = document.createElement('div');
                div.className = 'tile';
                div.innerHTML =
                    '<div class="stat-label">' + card.label + '</div>' +
                    '<div class="stat-value" style="' + (card.color ? 'color:' + card.color : '') + '">' +
                    card.value +
                    '</div>';
                grid.appendChild(div);
            });
        }

        function updateQueueSelect(queues) {
            const select = document.getElementById('queue-select');
            const currentSelection = select.value || currentQueue;
            select.innerHTML = '';

            if (queues.length === 0) return;

            queues.forEach(q => {
                const opt = document.createElement('option');
                opt.value = q.name;
                opt.textContent = q.name + ' (' + q.counts.waiting + ' waiting)';
                opt.selected = q.name === currentSelection;
                select.appendChild(opt);
            });
        }

        function renderJobs(jobs) {
            const tbody = document.querySelector('#jobs-table tbody');
            tbody.innerHTML = '';

            if (!jobs || jobs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--muted)">No recent jobs found</td></tr>';
                return;
            }

            jobs.forEach(job => {
                const tr = document.createElement('tr');
                const isFailed = !!job.failedReason;
                tr.innerHTML =
                    '<td><code>' + job.id + '</code></td>' +
                    '<td>' + job.name + '</td>' +
                    '<td>' + currentQueue + '</td>' +
                    '<td><span class="status-badge ' +
                    (isFailed ? 'status-failed' : 'status-completed') +
                    '">' +
                    (isFailed ? 'Failed' : 'Completed') +
                    '</span></td>' +
                    '<td>' + job.attempts + '</td>' +
                    '<td>' + new Date(job.timestamp).toLocaleTimeString() + '</td>';
                if (isFailed) {
                    tr.title = job.failedReason;
                }
                tbody.appendChild(tr);
            });
        }

        function showError(msg) {
            const el = document.getElementById('error-container');
            el.textContent = msg;
            el.style.display = 'block';
        }
`;

const getDashboardScriptBootstrap = (): string => `
        const themeButton = document.getElementById('theme-toggle');
        if (themeButton) {
            themeButton.addEventListener('click', toggleTheme);
        }

        const autoRefreshButton = document.getElementById('auto-refresh-toggle');
        if (autoRefreshButton) {
            autoRefreshButton.addEventListener('click', toggleAutoRefresh);
        }

        const storedAutoRefresh = localStorage.getItem(AUTO_REFRESH_KEY);
        const initialAutoRefresh = storedAutoRefresh === null
            ? AUTO_REFRESH
            : storedAutoRefresh === 'true';

        applyTheme(getPreferredTheme());
        fetchData();
        setAutoRefresh(initialAutoRefresh);
`;

const getDashboardScript = (options: DashboardUiOptions): string =>
  [
    getDashboardScriptState(options),
    getDashboardScriptTheme(),
    getDashboardScriptAutoRefresh(),
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
