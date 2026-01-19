export type WorkerUiOptions = {
  basePath: string;
  apiBaseUrl?: string;
  autoRefresh: boolean;
  refreshIntervalMs: number;
};

const getBaseStyles = (): string => `
  body {
    margin: 0;
    font-family: 'Inter', ui-sans-serif, system-ui;
    background: #0b1220;
    color: #f1f5f9;
  }
  .hidden { display: none; }
`;

const getLayoutStyles = (): string => `
  .zt-page { min-height: 100vh; padding: 32px 24px; }
  .zt-container { max-width: 72rem; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
  .zt-header { display: flex; flex-direction: column; gap: 16px; }
  .zt-brand { display: flex; align-items: center; gap: 16px; }
  .zt-brand-icon { height: 48px; width: 48px; border-radius: 16px; border: 1px solid #1e293b; background: rgba(15, 23, 42, 0.8); display: flex; align-items: center; justify-content: center; }
  .zt-kicker { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.2em; color: #94a3b8; }
  .zt-title { font-size: 1.5rem; font-weight: 600; color: #f8fafc; margin: 0; }
  .zt-subtitle { font-size: 0.875rem; color: #94a3b8; margin: 0.25rem 0 0; }
  .zt-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .zt-nav { display: flex; flex-wrap: wrap; gap: 8px; }
  .zt-nav-link {
    border: 1px solid #1e293b;
    color: #e2e8f0;
    text-decoration: none;
    padding: 0.4rem 0.75rem;
    border-radius: 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    transition: border-color 0.2s ease, color 0.2s ease;
  }
  .zt-nav-link:hover { border-color: #38bdf8; color: #38bdf8; }
  .zt-grid { display: grid; gap: 16px; }
  .zt-grid-3 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
`;

const getCardStyles = (): string => `
  .zt-card { background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1rem; padding: 1.25rem; }
  .zt-card-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.2em; color: #94a3b8; }
  .zt-card-value { margin-top: 0.75rem; font-size: 1.875rem; font-weight: 600; }
  .zt-text-emerald { color: #6ee7b7; }
  .zt-text-amber { color: #fbbf24; }
`;

const getAlertStyles = (): string => `
  .zt-alert {
    border: 1px solid rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.1);
    color: #fecaca;
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    font-size: 0.875rem;
  }
`;

const getButtonStyles = (): string => `
  .zt-button {
    border: 1px solid #1e293b;
    background: #0f172a;
    color: #f1f5f9;
    padding: 0.5rem 1rem;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease;
  }
  .zt-button:hover { border-color: #38bdf8; color: #38bdf8; }
  .zt-select {
    border: 1px solid #1e293b;
    background: #0f172a;
    color: #f1f5f9;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
  }
`;

const getTableStyles = (): string => `
  .zt-table-card { border-radius: 1.5rem; padding: 1.5rem; }
  .zt-table-header { display: flex; flex-direction: column; gap: 12px; }
  .zt-table-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.75rem; color: #94a3b8; }
  .zt-table-wrap { margin-top: 1.5rem; overflow-x: auto; }
  .zt-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  .zt-head-cell { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; padding: 0.5rem 0.75rem; text-align: left; }
  .zt-cell { padding: 0.75rem; border-top: 1px solid #1f2937; }
  .zt-cell--strong { font-weight: 600; color: #f1f5f9; }
  .zt-cell--muted { color: #94a3b8; }
  .zt-cell--right { text-align: right; }
  .zt-empty { padding: 1.5rem 0.75rem; text-align: center; font-size: 0.875rem; color: #94a3b8; }
`;

const getBadgeStyles = (): string => `
  .zt-dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 999px; }
  .zt-dot--emerald { background: #34d399; }
  .zt-dot--amber { background: #fbbf24; }
  .zt-dot--rose { background: #fb7185; }
  .zt-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.125rem 0.625rem; font-size: 0.75rem; font-weight: 600; border: 1px solid transparent; }
  .zt-badge--success { background: rgba(16, 185, 129, 0.12); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.3); }
  .zt-badge--warn { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); }
  .zt-badge--danger { background: rgba(244, 63, 94, 0.12); color: #fda4af; border-color: rgba(244, 63, 94, 0.3); }
  .zt-badge--neutral { background: rgba(148, 163, 184, 0.12); color: #cbd5f5; border-color: rgba(148, 163, 184, 0.3); }
  .status-pill { border-radius: 999px; padding: 0.125rem 0.625rem; font-size: 0.75rem; font-weight: 600; }
`;

const getActionStyles = (): string => `
  .zt-row-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; }
  .action-btn {
    border: 1px solid #1e293b;
    background: transparent;
    color: #e2e8f0;
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease;
  }
  .action-btn.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;
    border-color: #1f2937;
    color: #64748b;
  }
  .action-btn.is-disabled:hover { border-color: #1f2937; color: #64748b; }
  .action-btn.is-active {
    border-color: rgba(16, 185, 129, 0.6);
    color: #6ee7b7;
  }
  .action-btn.is-toggle {
    border-color: rgba(56, 189, 248, 0.4);
    color: #bae6fd;
  }
  .action-btn.is-delete {
    border-color: rgba(244, 63, 94, 0.5);
    color: #fda4af;
  }
  .action-btn.is-delete:hover { border-color: #fb7185; color: #fb7185; }
  .zt-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: #cbd5f5;
  }
  .zt-switch {
    appearance: none;
    width: 2.25rem;
    height: 1.2rem;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(239, 68, 68, 0.2);
    position: relative;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .zt-switch::after {
    content: '';
    position: absolute;
    top: 1px;
    left: 1px;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    background: #f8fafc;
    transition: transform 0.2s ease;
  }
  .zt-switch:checked {
    background: rgba(16, 185, 129, 0.25);
    border-color: rgba(16, 185, 129, 0.5);
  }
  .zt-switch:checked::after {
    transform: translateX(1rem);
  }
  .action-btn:hover { border-color: #38bdf8; color: #38bdf8; }
  .action-btn[data-action="start"]:hover { border-color: #34d399; color: #34d399; }
  .action-btn[data-action="restart"]:hover { border-color: #fbbf24; color: #fbbf24; }
  .action-btn[data-action="stop"]:hover { border-color: #fb7185; color: #fb7185; }
`;

const getResponsiveStyles = (): string => `
  @media (min-width: 640px) {
    .zt-header { flex-direction: row; align-items: center; justify-content: space-between; }
    .zt-table-header { flex-direction: row; align-items: center; justify-content: space-between; }
  }
  @media (min-width: 768px) {
    .zt-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
`;

const getInlineStyles = (): string => `
<style>
${getBaseStyles()}
${getLayoutStyles()}
${getCardStyles()}
${getAlertStyles()}
${getButtonStyles()}
${getTableStyles()}
${getBadgeStyles()}
${getActionStyles()}
${getResponsiveStyles()}
</style>`;

const getLogo = (): string => `
<svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="zt-workers" x1="10" y1="50" x2="90" y2="50" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22c55e" />
      <stop offset="1" stop-color="#38bdf8" />
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="34" stroke="rgba(255,255,255,0.16)" stroke-width="4" />
  <ellipse cx="50" cy="50" rx="40" ry="18" stroke="url(#zt-workers)" stroke-width="4" />
  <ellipse cx="50" cy="50" rx="18" ry="40" stroke="url(#zt-workers)" stroke-width="4" opacity="0.75" />
  <circle cx="50" cy="50" r="6" fill="url(#zt-workers)" />
  <path d="M40 52C35 52 32 49 32 44C32 39 35 36 40 36H48" stroke="white" stroke-width="6" stroke-linecap="round" />
  <path d="M60 48C65 48 68 51 68 56C68 61 65 64 60 64H52" stroke="white" stroke-width="6" stroke-linecap="round" />
  <path d="M44 50H56" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round" />
</svg>`;

const normalizeBasePath = (value: string): string => {
  let basePath = value;
  while (basePath.endsWith('/')) {
    basePath = basePath.slice(0, -1);
  }
  return basePath;
};

const getWorkersHead = (): string => `
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ZinTrust Workers</title>
    ${getInlineStyles()}
  </head>`;

const getWorkersHeader = (): string => `
        <header class="zt-header">
          <div class="zt-brand">
            <div class="zt-brand-icon">
              ${getLogo()}
            </div>
            <div>
              <p class="zt-kicker">ZinTrust</p>
              <h1 class="zt-title">Worker Command Center</h1>
              <p class="zt-subtitle">Live control plane for worker orchestration</p>
            </div>
          </div>
          <div class="zt-actions">
            <span id="last-updated" class="zt-kicker"></span>
            <select id="storage-select" class="zt-select" aria-label="Worker storage">
              <option value="memory">Memory</option>
              <option value="redis">Redis</option>
              <option value="db">Database</option>
            </select>
            <nav class="zt-nav">
              <a class="zt-nav-link" href="/queue-monitor/">Queue monitor</a>
              <a class="zt-nav-link" href="/workers">Workers</a>
              <a class="zt-nav-link" href="/telemetry">Telemetry</a>
              <a class="zt-nav-link" href="/metrics">Metrics</a>
            </nav>
            <button id="refresh-btn" class="zt-button">Refresh</button>
            <button id="auto-refresh-btn" class="zt-button">Pause auto refresh</button>
          </div>
        </header>`;

const getWorkersStats = (): string => `
        <section class="zt-grid zt-grid-3">
          <div class="zt-card">
            <p class="zt-card-title">Total Workers</p>
            <p id="total-workers" class="zt-card-value">0</p>
          </div>
          <div class="zt-card">
            <p class="zt-card-title">Active</p>
            <p id="active-workers" class="zt-card-value zt-text-emerald">0</p>
          </div>
          <div class="zt-card">
            <p class="zt-card-title">Attention Needed</p>
            <p id="attention-workers" class="zt-card-value zt-text-amber">0</p>
          </div>
        </section>`;

const getWorkersTable = (): string => `
        <section class="zt-card zt-table-card">
          <div class="zt-table-header">
            <div>
              <h2 class="zt-title" style="font-size: 1.125rem;">Workers</h2>
              <p class="zt-subtitle">Start, stop, and monitor health across the fleet.</p>
            </div>
            <div class="zt-table-meta">
              <span class="zt-dot zt-dot--emerald"></span> Healthy
              <span class="zt-dot zt-dot--amber" style="margin-left: 0.75rem;"></span> Degraded
              <span class="zt-dot zt-dot--rose" style="margin-left: 0.75rem;"></span> Critical
            </div>
          </div>
          <div class="zt-table-wrap">
            <table class="zt-table">
              <thead>
                <tr>
                  <th class="zt-head-cell">Worker</th>
                  <th class="zt-head-cell">Status</th>
                  <th class="zt-head-cell">Health</th>
                  <th class="zt-head-cell">Version</th>
                  <th class="zt-head-cell zt-cell--right">Actions</th>
                </tr>
              </thead>
              <tbody id="workers-body"></tbody>
            </table>
          </div>
        </section>`;

const getWorkersBody = (): string => `
    <div class="zt-page">
      <div class="zt-container">
${getWorkersHeader()}

        <section id="error" class="hidden zt-alert"></section>

${getWorkersStats()}

${getWorkersTable()}
      </div>
    </div>`;

const getWorkersScriptState = (options: WorkerUiOptions, apiBaseUrl: string): string => `
      const RAW_API_BASE = '${apiBaseUrl}';
      const API_BASE = RAW_API_BASE
        ? (RAW_API_BASE.startsWith('/') ? window.location.origin + RAW_API_BASE : RAW_API_BASE)
  : window.location.origin;
      const STORAGE_KEYS = {
        autoRefresh: 'zintrust.workers.autoRefresh',
        storageMode: 'zintrust.workers.storageMode',
      };
      const AUTO_REFRESH = ${options.autoRefresh ? 'true' : 'false'};
      const REFRESH_INTERVAL = ${Math.max(1000, Math.floor(options.refreshIntervalMs))};

      const errorEl = document.getElementById('error');
      const totalEl = document.getElementById('total-workers');
      const activeEl = document.getElementById('active-workers');
      const attentionEl = document.getElementById('attention-workers');
      const bodyEl = document.getElementById('workers-body');
      const refreshBtn = document.getElementById('refresh-btn');
      const autoBtn = document.getElementById('auto-refresh-btn');
      const lastUpdated = document.getElementById('last-updated');
      const storageSelect = document.getElementById('storage-select');

      let autoRefresh = AUTO_REFRESH;
      let storageMode = 'memory';
      let autoTimer = null;
`;

const getWorkersScriptStorage = (): string => `
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

      const setStorageValue = (value) => {
        storageMode = value || 'memory';
        if (storageSelect) {
          storageSelect.value = storageMode;
        }
      };
`;

const getWorkersScriptError = (): string => `
      const setError = (message) => {
        if (!message) {
          errorEl.classList.add('hidden');
          errorEl.textContent = '';
          return;
        }
        errorEl.classList.remove('hidden');
        errorEl.textContent = message;
      };
`;

const getWorkersScriptBadges = (): string => `
      const statusBadge = (label, tone) => {
        const tones = {
          success: 'zt-badge--success',
          warn: 'zt-badge--warn',
          danger: 'zt-badge--danger',
          neutral: 'zt-badge--neutral',
        };
        return '<span class="zt-badge ' + (tones[tone] || tones.neutral) + '">' + label + '</span>';
      };
`;

const getWorkersScriptTone = (): string => `
      const toStatusTone = (status) => {
        if (!status) return { label: 'unknown', tone: 'neutral' };
        const normalized = String(status).toLowerCase();
        if (['running', 'active'].includes(normalized)) return { label: normalized, tone: 'success' };
        if (['stopped', 'stopping', 'sleeping', 'paused'].includes(normalized)) return { label: normalized, tone: 'neutral' };
        if (['starting', 'draining'].includes(normalized)) return { label: normalized, tone: 'warn' };
        return { label: normalized, tone: 'danger' };
      };

      const toHealthTone = (health) => {
        if (!health) return { label: 'unknown', tone: 'neutral' };
        const normalized = String(health).toLowerCase();
        if (['healthy', 'green'].includes(normalized)) return { label: normalized, tone: 'success' };
        if (['degraded', 'yellow'].includes(normalized)) return { label: normalized, tone: 'warn' };
        if (['critical', 'unhealthy', 'red'].includes(normalized)) return { label: normalized, tone: 'danger' };
        return { label: normalized, tone: 'neutral' };
      };
`;

const getWorkersScriptRenderRowTemplate = (): string => `
      const renderWorkerRow = (worker) => {
        const resolvedName =
          worker.name || worker.workerName || worker.worker?.name || worker.status?.name || '';
        const statusValue =
          worker.status?.status ||
          worker.status?.state ||
          worker.status ||
          worker.worker?.status ||
          'unknown';
        const statusInfo = toStatusTone(statusValue);
        const healthInfo = toHealthTone(worker.health?.status || worker.health);
        const version =
          worker.version ||
          worker.status?.version ||
          worker.worker?.config?.version ||
          worker.worker?.version ||
          'n/a';
        const autoStart = Boolean(worker.autoStart ?? worker.worker?.config?.autoStart ?? false);

        const normalizedStatus = String(statusValue || '').toLowerCase();
        const isRunning = ['running', 'active'].includes(normalizedStatus);
        const startClass = isRunning ? 'action-btn is-disabled is-active' : 'action-btn';
        const startAttr = isRunning ? ' disabled' : '';

        if (!resolvedName) {
          return '';
        }

        const rowHtml =
          '<tr>' +
          '<td class="zt-cell zt-cell--strong">' +
          resolvedName +
          '</td>' +
          '<td class="zt-cell">' +
          statusBadge(statusInfo.label, statusInfo.tone) +
          '</td>' +
          '<td class="zt-cell">' +
          statusBadge(healthInfo.label, healthInfo.tone) +
          '</td>' +
          '<td class="zt-cell zt-cell--muted">' +
          version +
          '</td>' +
          '<td class="zt-cell zt-cell--right">' +
          '<div class="zt-row-actions">' +
          '<label class="zt-toggle" title="Auto start">' +
          '<input class="zt-switch" type="checkbox" data-action="auto-start" data-worker="' +
          resolvedName +
          '" data-auto-start="' +
          (autoStart ? 'true' : 'false') +
          '"' +
          (autoStart ? ' checked' : '') +
          ' />' +
          '<span>Auto</span>' +
          '</label>' +
          '<button class="' +
          startClass +
          '" data-action="start" data-worker="' +
          resolvedName +
          '"' +
          startAttr +
          '>Start</button>' +
          '<button class="action-btn" data-action="restart" data-worker="' +
          resolvedName +
          '">Restart</button>' +
          '<button class="action-btn" data-action="stop" data-worker="' +
          resolvedName +
          '">Stop</button>' +
          '<button class="action-btn is-delete" data-action="delete" data-worker="' +
          resolvedName +
          '">Delete</button>' +
          '</div>' +
          '</td>' +
          '</tr>';

        return rowHtml;
      };
`;

const getWorkersScriptRenderRows = (): string => `
      const renderWorkers = (workers) => {
        bodyEl.innerHTML = '';
        if (!workers.length) {
          bodyEl.innerHTML = '<tr><td colspan="5" class="zt-empty">No workers found.</td></tr>';
          return;
        }

        workers.forEach((worker) => {
          const rowHtml = renderWorkerRow(worker);
          if (!rowHtml) {
            return;
          }
          bodyEl.insertAdjacentHTML('beforeend', rowHtml);
        });
      };
`;

const getWorkersScriptRenderSummary = (): string => `
      const updateSummary = (workers) => {
        totalEl.textContent = workers.length;
        const activeCount = workers.filter((worker) => {
          const status = String(worker.status?.status || worker.status || '').toLowerCase();
          return status === 'running' || status === 'active';
        }).length;
        const attentionCount = workers.filter((worker) => {
          const health = String(worker.health?.status || worker.health || '').toLowerCase();
          return ['degraded', 'critical', 'unhealthy', 'red', 'yellow'].includes(health);
        }).length;

        activeEl.textContent = activeCount;
        attentionEl.textContent = attentionCount;
      };
`;

const getWorkersScriptFetch = (): string => `
      const fetchWorkers = async () => {
        setError('');
        try {
          const query = new URLSearchParams({
            detail: 'true',
            storage: storageMode,
          });
          const response = await fetch(API_BASE + '/api/workers?' + query.toString());
          if (!response.ok) throw new Error('Failed to load workers');
          const payload = await response.json();
          const workers = payload.workers || [];
          renderWorkers(workers);
          updateSummary(workers);
          lastUpdated.textContent = 'Updated ' + new Date().toLocaleTimeString();
        } catch (error) {
          setError(error.message || 'Failed to load worker data');
        }
      };

      const handleAction = async (action, workerName, extraParams = {}, methodOverride) => {
        setError('');
        try {
          if (!workerName) {
            throw new Error('Missing worker name');
          }
          const query = new URLSearchParams({ storage: storageMode, ...extraParams });
          const path = action ? '/' + action : '';
          const response = await fetch(
            API_BASE + '/api/workers/' + workerName + path + '?' + query.toString(),
            {
            method: methodOverride || 'POST',
            }
          );
          if (!response.ok) throw new Error('Action failed');
          await fetchWorkers();
        } catch (error) {
          setError(error.message || 'Failed to execute action');
        }
      };
`;

const getWorkersScriptControls = (): string => `
      bodyEl.addEventListener('click', (event) => {
        const target = event.target;
        if (!target || !target.dataset) return;
        if (target.dataset.action && target.dataset.worker) {
          if (target.dataset.action === 'auto-start') {
            return;
          }
          if (target.dataset.action === 'delete') {
            const first = window.confirm('Delete this worker?');
            if (!first) return;
            const second = window.confirm('This cannot be undone. Delete worker permanently?');
            if (!second) return;
            handleAction('', target.dataset.worker, {}, 'DELETE');
            return;
          }
          handleAction(target.dataset.action, target.dataset.worker);
        }
      });

      bodyEl.addEventListener('change', (event) => {
        const target = event.target;
        if (!target || !target.dataset) return;
        if (target.dataset.action === 'auto-start' && target.dataset.worker) {
          const nextValue = target.checked === true;
          const confirmMessage = nextValue
            ? 'Enable auto start for this worker?'
            : 'Disable auto start for this worker?';
          if (!window.confirm(confirmMessage)) {
            target.checked = !nextValue;
            return;
          }
          handleAction('auto-start', target.dataset.worker, { enabled: String(nextValue) });
        }
      });

      refreshBtn.addEventListener('click', () => fetchWorkers());
      if (storageSelect) {
        storageSelect.addEventListener('change', (event) => {
          setStorageValue(event.target.value);
          writeStorage(STORAGE_KEYS.storageMode, storageMode);
          fetchWorkers();
        });
      }
      autoBtn.addEventListener('click', () => {
        autoRefresh = !autoRefresh;
        setAutoLabel();
        writeStorage(STORAGE_KEYS.autoRefresh, String(autoRefresh));
        if (autoRefresh) {
          autoTimer = setInterval(fetchWorkers, REFRESH_INTERVAL);
        } else if (autoTimer) {
          clearInterval(autoTimer);
        }
      });
`;

const getWorkersScriptBootstrap = (): string => `
      const storedAuto = readStorage(STORAGE_KEYS.autoRefresh);
      if (storedAuto !== null) {
        autoRefresh = storedAuto === 'true';
      }
      const storedStorage = readStorage(STORAGE_KEYS.storageMode);
      if (storedStorage) {
        setStorageValue(storedStorage);
      } else {
        setStorageValue('memory');
      }
      setAutoLabel();

      if (autoRefresh) {
        autoTimer = setInterval(fetchWorkers, REFRESH_INTERVAL);
      }

      fetchWorkers();
`;

const getWorkersScript = (options: WorkerUiOptions, apiBaseUrl: string): string => `
    <script>
${getWorkersScriptState(options, apiBaseUrl)}
${getWorkersScriptStorage()}
${getWorkersScriptError()}
${getWorkersScriptBadges()}
${getWorkersScriptTone()}
${getWorkersScriptRenderRowTemplate()}
${getWorkersScriptRenderRows()}
${getWorkersScriptRenderSummary()}
${getWorkersScriptFetch()}
${getWorkersScriptControls()}
${getWorkersScriptBootstrap()}
    </script>`;

export const getWorkersHtml = (options: WorkerUiOptions): string => {
  const apiBaseUrl = normalizeBasePath(options.apiBaseUrl ?? '');

  return `<!DOCTYPE html>
<html lang="en">
${getWorkersHead()}
  <body>
${getWorkersBody()}
${getWorkersScript(options, apiBaseUrl)}
  </body>
</html>`;
};
