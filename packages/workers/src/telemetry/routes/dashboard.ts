import { renderAlertPanel } from '../components/AlertPanel';
import { renderCostTracking } from '../components/CostTracking';
import { renderResourceUsageChart } from '../components/ResourceUsageChart';
import { renderWorkerHealthChart } from '../components/WorkerHealthChart';

export type DashboardUiOptions = {
  basePath: string;
  autoRefresh: boolean;
  refreshIntervalMs: number;
};

const getDashboardColorStyles = (): string => `
  :root {
    --bg: #0b1220;
    --card: rgba(15, 23, 42, 0.75);
    --border: rgba(148, 163, 184, 0.2);
    --text: #f1f5f9;
    --muted: #94a3b8;
    --accent: #38bdf8;
    --accent-strong: #0ea5e9;
    --success: #6ee7b7;
    --warn: #fbbf24;
    --danger: #fecaca;
    --danger-strong: #ef4444;
  }
  html[data-theme="light"] {
    --bg: #f8fafc;
    --card: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #475569;
    --accent: #0284c7;
    --accent-strong: #0369a1;
    --success: #16a34a;
    --warn: #d97706;
    --danger: #dc2626;
    --danger-strong: #dc2626;
  }
  body {
    margin: 0;
    font-family: 'Inter', ui-sans-serif, system-ui;
    background: var(--bg);
    color: var(--text);
  }
`;

const getDashboardLayoutStyles = (): string => `
  .zt-page { min-height: 100vh; padding: 32px 24px; }
  .zt-container { max-width: 72rem; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
  .zt-header { display: flex; flex-direction: column; gap: 16px; }
  .zt-brand { display: flex; align-items: center; gap: 16px; }
  .zt-brand-icon {
    height: 34px;
    width: 34px;
    border-radius: 9px;
    border: 1px solid rgba(14, 165, 233, 0.35);
    background: linear-gradient(180deg, rgba(14, 165, 233, 0.18), rgba(2, 132, 199, 0.1));
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .zt-kicker { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.2em; color: var(--muted); }
  .zt-title { font-size: 1.5rem; font-weight: 600; color: var(--text); margin: 0; }
  .zt-subtitle { font-size: 0.875rem; color: var(--muted); margin: 0.25rem 0 0; }
  .zt-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 0.75rem; color: var(--muted); }
  .zt-nav { display: flex; flex-wrap: wrap; gap: 8px; }
  .zt-nav-link {
    border: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
    padding: 0.4rem 0.75rem;
    border-radius: 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    transition: border-color 0.2s ease, color 0.2s ease;
  }
  .zt-nav-link:hover { border-color: var(--accent); color: var(--accent); }
  #last-updated { min-width: 9rem; font-variant-numeric: tabular-nums; }
  .zt-button {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    padding: 0.5rem 1rem;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease;
  }
  .zt-button:hover { border-color: var(--accent); color: var(--accent); }
  .zt-alert {
    border: 1px solid rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.1);
    color: var(--danger);
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    font-size: 0.875rem;
  }
  .hidden { display: none; }
  .zt-grid { display: grid; gap: 16px; }
  .zt-grid-3 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
  .zt-card { background: var(--card); border: 1px solid var(--border); border-radius: 1rem; padding: 1.25rem; }
  .zt-card-header { display: flex; align-items: center; justify-content: space-between; }
  .zt-card-title { font-size: 0.875rem; font-weight: 600; color: var(--text); margin: 0; }
  .zt-card-meta { font-size: 0.75rem; color: var(--muted); }
  .zt-card-value { margin-top: 0.75rem; font-size: 1.875rem; font-weight: 600; }
  .zt-card-subvalue { margin-top: 0.35rem; font-size: 0.875rem; color: var(--muted); }
  .zt-card-body { margin-top: 1rem; }
  .zt-chart { margin-top: 1rem; height: 10rem; width: 100%; }
  .zt-cost-value { font-size: 1.875rem; font-weight: 600; color: var(--success); margin: 0; }
  .zt-alert-list { margin: 1rem 0 0; padding: 0; list-style: none; display: grid; gap: 0.75rem; font-size: 0.875rem; color: var(--text); }
  .zt-alert-item { border-radius: 0.75rem; border: 1px solid var(--border); background: rgba(15, 23, 42, 0.6); padding: 0.5rem 0.75rem; }
  html[data-theme="light"] .zt-alert-item { background: #f8fafc; }
  .zt-text-emerald { color: var(--success); }
  .zt-text-amber { color: var(--warn); }
`;

const getDashboardResponsiveStyles = (): string => `
  @media (min-width: 640px) {
    .zt-header { flex-direction: row; align-items: center; justify-content: space-between; }
  }
  @media (min-width: 768px) {
    .zt-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
`;

const getDashboardStyles = (): string => `
<style>
${getDashboardColorStyles()}
${getDashboardLayoutStyles()}
${getDashboardResponsiveStyles()}
</style>`;

const getLogo = (): string => `
<svg width="26" height="26" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="zt-telemetry" x1="10" y1="50" x2="90" y2="50" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22c55e" />
      <stop offset="1" stop-color="#38bdf8" />
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="34" stroke="rgba(255,255,255,0.16)" stroke-width="4" />
  <ellipse cx="50" cy="50" rx="40" ry="18" stroke="url(#zt-telemetry)" stroke-width="4" />
  <ellipse cx="50" cy="50" rx="18" ry="40" stroke="url(#zt-telemetry)" stroke-width="4" opacity="0.75" />
  <circle cx="50" cy="50" r="6" fill="url(#zt-telemetry)" />
  <path d="M40 52C35 52 32 49 32 44C32 39 35 36 40 36H48" stroke="white" stroke-width="6" stroke-linecap="round" />
  <path d="M60 48C65 48 68 51 68 56C68 61 65 64 60 64H52" stroke="white" stroke-width="6" stroke-linecap="round" />
  <path d="M44 50H56" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round" />
</svg>`;

const getDashboardHead = (): string => `
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ZinTrust Telemetry Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    ${getDashboardStyles()}
  </head>`;

const getDashboardHeader = (): string => `
        <header class="zt-header">
          <div class="zt-brand">
            <div class="zt-brand-icon">
              ${getLogo()}
            </div>
            <div>
              <p class="zt-kicker">ZinTrust</p>
              <h1 class="zt-title">Telemetry Dashboard</h1>
              <p class="zt-subtitle">Unified view of worker health and performance</p>
            </div>
          </div>
          <div class="zt-actions">
            <span id="last-updated"></span>
            <nav class="zt-nav">
              <a class="zt-nav-link" href="/queue-monitor/">Queue monitor</a>
              <a class="zt-nav-link" href="/workers">Workers</a>
              <a class="zt-nav-link" href="/metrics">Metrics</a>
            </nav>
            <button id="refresh-btn" class="zt-button">Refresh</button>
            <button id="auto-refresh-btn" class="zt-button">Pause auto refresh</button>
            <button id="theme-toggle" class="zt-button" aria-label="Toggle theme">Light mode</button>
          </div>
        </header>`;

const getDashboardStats = (): string => `
        <section class="zt-grid zt-grid-3">
          <div class="zt-card">
            <p class="zt-kicker">Total Workers</p>
            <p id="total-workers" class="zt-card-value">0</p>
          </div>
          <div class="zt-card">
            <p class="zt-kicker">Healthy</p>
            <p id="healthy-workers" class="zt-card-value zt-text-emerald">0</p>
          </div>
          <div class="zt-card">
            <p class="zt-kicker">Needs Attention</p>
            <p id="attention-workers" class="zt-card-value zt-text-amber">0</p>
          </div>
          <div class="zt-card">
            <p class="zt-kicker">CPU (System / Process)</p>
            <p id="system-cpu" class="zt-card-value">0%</p>
            <p id="process-cpu" class="zt-card-subvalue">Process: 0% (0 ms)</p>
          </div>
        </section>`;

const getDashboardCharts = (): string => `
  <section class="zt-grid zt-grid-3">
          ${renderWorkerHealthChart()}
          ${renderResourceUsageChart()}
          ${renderCostTracking()}
        </section>

        ${renderAlertPanel()}`;

const getDashboardBody = (): string => `
    <div class="zt-page">
      <div class="zt-container">
${getDashboardHeader()}

        <section id="error" class="hidden zt-alert"></section>

${getDashboardStats()}

${getDashboardCharts()}
      </div>
    </div>`;

const getDashboardScriptHelpers = (): string => `
      const formatPercent = (value) => {
        if (!Number.isFinite(value)) return '0%';
        return value.toFixed(1) + '%';
      };

      const formatMs = (value) => {
        if (!Number.isFinite(value)) return '0 ms';
        return Math.max(0, Math.round(value)) + ' ms';
      };

      const getProcessCpuPercent = (cpuUsage, timestamp, cores) => {
        if (!cpuUsage || !timestamp || !cores) return { percent: 0, deltaMs: 0 };

        const currentTotal = (cpuUsage.user || 0) + (cpuUsage.system || 0);
        const currentTs = Number.isFinite(timestamp) ? timestamp : Date.parse(timestamp);

        if (!Number.isFinite(currentTs)) {
          return { percent: 0, deltaMs: 0 };
        }

        if (!lastProcessCpu || !Number.isFinite(lastProcessTs)) {
          lastProcessCpu = currentTotal;
          lastProcessTs = currentTs;
          return { percent: 0, deltaMs: 0 };
        }

        const deltaUsage = currentTotal - lastProcessCpu;
        const deltaMs = Math.max(0, currentTs - lastProcessTs);
        const normalized = deltaMs > 0 ? (deltaUsage / 1000) / (deltaMs * Math.max(1, cores)) : 0;
        const percent = Math.max(0, Math.min(100, normalized * 100));

        lastProcessCpu = currentTotal;
        lastProcessTs = currentTs;

        return { percent, deltaMs: deltaUsage / 1000 };
      };

      const readStorage = (key) => {
        try {
          return localStorage.getItem(key);
        } catch (error) {
          return null;
        }
      };

      const writeStorage = (key, value) => {
        try {
          localStorage.setItem(key, value);
        } catch (error) {
          return;
        }
      };

      const setAutoLabel = () => {
        autoBtn.textContent = autoRefresh ? 'Pause auto refresh' : 'Resume auto refresh';
      };

      const applyTheme = (theme) => {
        currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        themeBtn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
        writeStorage(STORAGE_KEYS.theme, theme);
      };
`;

const getDashboardScriptState = (options: DashboardUiOptions): string => {
  let basePath = options.basePath;
  while (basePath.endsWith('/')) {
    basePath = basePath.slice(0, -1);
  }
  return `
      const API_BASE = '${basePath}';
      const AUTO_REFRESH = ${options.autoRefresh ? 'true' : 'false'};
      const REFRESH_INTERVAL = ${Math.max(1000, Math.floor(options.refreshIntervalMs))};
      const STORAGE_KEYS = {
        autoRefresh: 'zintrust.telemetry.autoRefresh',
        theme: 'zintrust.telemetry.theme',
      };

      const errorEl = document.getElementById('error');
      const totalEl = document.getElementById('total-workers');
      const healthyEl = document.getElementById('healthy-workers');
      const attentionEl = document.getElementById('attention-workers');
      const systemCpuEl = document.getElementById('system-cpu');
      const processCpuEl = document.getElementById('process-cpu');
      const costEl = document.getElementById('costTotal');
      const refreshBtn = document.getElementById('refresh-btn');
      const autoBtn = document.getElementById('auto-refresh-btn');
      const themeBtn = document.getElementById('theme-toggle');
      const lastUpdated = document.getElementById('last-updated');

      let autoRefresh = AUTO_REFRESH;
      let autoTimer = null;
      let currentTheme = 'dark';
      let eventSource = null;
      let sseActive = false;
      let lastProcessCpu = null;
      let lastProcessTs = null;

${getDashboardScriptHelpers()}
  `;
};

const getDashboardScriptCharts = (): string => `
      const setError = (message) => {
        if (!message) {
          errorEl.classList.add('hidden');
          errorEl.textContent = '';
          return;
        }
        errorEl.classList.remove('hidden');
        errorEl.textContent = message;
      };

      const buildHealthChart = (labels, values) => {
        const ctx = document.getElementById('workerHealthChart');
        if (!ctx || !window.Chart) return;
        return new window.Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              data: values,
              borderColor: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.2)',
              tension: 0.4,
              fill: true,
            }],
          },
          options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
      };

      const buildResourceChart = (labels, values) => {
        const ctx = document.getElementById('resourceUsageChart');
        if (!ctx || !window.Chart) return;
        return new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: ['#22c55e', '#38bdf8', '#f97316'],
              borderRadius: 12,
            }],
          },
          options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
      };

      let healthChart = null;
      let resourceChart = null;

      const updateCharts = (summary, resources) => {
        const monitoring = summary?.monitoring || { total: 0, healthy: 0, degraded: 0, critical: 0, details: [] };
        const labels = ['Healthy', 'Degraded', 'Critical'];
        const values = [monitoring.healthy || 0, monitoring.degraded || 0, monitoring.critical || 0];

        if (healthChart) healthChart.destroy();
        healthChart = buildHealthChart(labels, values);

        const resourceLabels = ['CPU', 'Memory', 'Network'];
        const cpu = resources?.resourceSnapshot?.cpu?.usage || 0;
        const memory = resources?.resourceSnapshot?.memory?.usage || 0;
        const network = resources?.resourceSnapshot?.network?.received || 0;
        const resourceValues = [cpu, memory, Math.min(100, (network / 1024 / 1024) || 0)];

        if (resourceChart) resourceChart.destroy();
        resourceChart = buildResourceChart(resourceLabels, resourceValues);
      };
  `;

const getDashboardScriptApplySnapshot = (): string => `
      const applySnapshot = (payload) => {
        const summary = payload.summary || {};
        const total = summary.workers || 0;
        const monitoring = summary.monitoring || { total: 0, healthy: 0, degraded: 0, critical: 0, details: [] };
        const healthyCount = monitoring.healthy || 0;
        const attentionCount = (monitoring.degraded || 0) + (monitoring.critical || 0);
        const resources = payload.resources || {};
        const snapshot = resources.resourceSnapshot || {};
        const cpuSnapshot = snapshot.cpu || {};
        const processSnapshot = snapshot.process || {};

        totalEl.textContent = total;
        healthyEl.textContent = healthyCount;
        attentionEl.textContent = attentionCount;
        if (systemCpuEl) {
          systemCpuEl.textContent = formatPercent(cpuSnapshot.usage || 0);
        }
        if (processCpuEl) {
          const processMetrics = getProcessCpuPercent(
            processSnapshot.cpuUsage,
            snapshot.timestamp,
            cpuSnapshot.cores || 1
          );
          processCpuEl.textContent =
            'Process: ' + formatPercent(processMetrics.percent) + ' (' + formatMs(processMetrics.deltaMs) + ')';
        }
        if (costEl && payload.resources?.cost) {
          const cost = payload.resources.cost;
          costEl.textContent = '$' + cost.hourly?.toFixed(4) + '/hr';
        }

        updateAlerts(summary.alerts || []);
        updateCharts(summary, resources);
        lastUpdated.textContent = 'Updated ' + new Date().toLocaleTimeString();
      };
`;

const getDashboardScriptUpdateAlerts = (): string => `
      const updateAlerts = (alerts) => {
        console.log('Alerts found:', alerts.length, alerts); // Debug logging
        const alertList = document.getElementById('alertList');
        if (alertList) {
          if (alerts.length === 0) {
            alertList.innerHTML = '<li class="zt-alert-item">No alerts yet.</li>';
          } else {
            alertList.innerHTML = alerts.map(alert => {
              // Handle both nested alert structure and direct alert structure
              const alertData = alert.alert || alert;
              console.log('Processing alert:', alertData); // Debug logging

              const severity = alertData.severity || 'info';
              const severityColor =
                severity === 'critical' ? 'var(--danger)' :
                severity === 'warning' ? 'var(--warn)' :
                severity === 'info' ? 'var(--accent)' : 'var(--text)';

              return '<li class="zt-alert-item">' +
              '<div style="display: flex; justify-content: space-between; align-items: center;">' +
              '<span style="font-weight: 600; color: ' + severityColor + '">' +
              (alertData.message || 'Unknown alert') + '</span>' +
              '<span style="font-size: 0.75rem; opacity: 0.7;">' +
              (alertData.timestamp ? new Date(alertData.timestamp).toLocaleTimeString() : 'No timestamp') + '</span>' +
              '</div>' +
              (alertData.recommendation ? '<div style="font-size: 0.8rem; margin-top: 0.25rem; opacity: 0.8;">' + alertData.recommendation + '</div>' : '') +
              '</li>';
            }).join('');
          }
        }
      };
`;

const getDashboardScriptFetch = (): string => `
      const fetchSummary = async () => {
        setError('');
        try {
          const response = await fetch(API_BASE + '/api/summary');
          if (!response.ok) throw new Error('Failed to load telemetry summary');
          const payload = await response.json();
          applySnapshot(payload);
        } catch (error) {
          setError(error.message || 'Failed to load telemetry data');
        }
      };

      const connectSse = () => {
        if (!globalThis.window.EventSource) return false;

        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        eventSource = new globalThis.window.EventSource(API_BASE + '/api/events');

        eventSource.onopen = () => {
          sseActive = true;
          if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
          }
        };

        eventSource.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if (payload && payload.type === 'snapshot') {
              applySnapshot(payload);
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
          // HTTP fallback disabled - 100% SSE reliance
          // if (autoRefresh && !autoTimer) {
          //   autoTimer = setInterval(fetchSummary, REFRESH_INTERVAL);
          // }
          console.log('SSE connection lost - please refresh page to reconnect');
        };

        return true;
      };
  `;

const getDashboardScriptControls = (): string => `
      refreshBtn.addEventListener('click', () => {
        console.log('Manual refresh - SSE only mode');
        // SSE handles all updates, no HTTP fallback
        if (!sseActive) {
          connectSse();
        }
      });
      autoBtn.addEventListener('click', () => {
        autoRefresh = !autoRefresh;
        setAutoLabel();
        writeStorage(STORAGE_KEYS.autoRefresh, String(autoRefresh));
        if (!autoRefresh) {
          if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
          }
          if (eventSource) {
            eventSource.close();
            eventSource = null;
            sseActive = false;
          }
          return;
        }

        if (!connectSse()) {
          // HTTP fallback disabled - 100% SSE reliance
          // autoTimer = setInterval(fetchSummary, REFRESH_INTERVAL);
          console.log('SSE connection failed - please check server');
        }
      });

      themeBtn.addEventListener('click', () => {
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
      });
  `;

const getDashboardScriptBootstrap = (): string => `
      const storedAuto = readStorage(STORAGE_KEYS.autoRefresh);
      if (storedAuto !== null) {
        autoRefresh = storedAuto === 'true';
      }
      setAutoLabel();

      const storedTheme = readStorage(STORAGE_KEYS.theme);
      const initialTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
      applyTheme(initialTheme);

      if (autoRefresh) {
        if (!connectSse()) {
          // HTTP fallback disabled - 100% SSE reliance
          // autoTimer = setInterval(fetchSummary, REFRESH_INTERVAL);
          console.log('SSE connection failed - please check server');
        }
      }

      // Initial data load via SSE only - no HTTP fallback
      // fetchSummary(); // Disabled - SSE handles initial data

      window.addEventListener('beforeunload', () => {
        if (eventSource) {
          eventSource.close();
        }
      });
  `;

const getDashboardScript = (options: DashboardUiOptions): string => `
    <script>
${getDashboardScriptState(options)}
${getDashboardScriptCharts()}
${getDashboardScriptApplySnapshot()}
${getDashboardScriptUpdateAlerts()}
${getDashboardScriptFetch()}
${getDashboardScriptControls()}
${getDashboardScriptBootstrap()}
    </script>`;

export const getDashboardHtml = (options: DashboardUiOptions): string => `<!DOCTYPE html>
<html lang="en">
${getDashboardHead()}
  <body>
${getDashboardBody()}
${getDashboardScript(options)}
  </body>
</html>`;
