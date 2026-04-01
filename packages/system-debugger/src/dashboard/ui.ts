/**
 * Debugger dashboard SPA — inline HTML served at basePath.
 * Full REST API registered under basePath/api/*.
 */
const BRAND_SVG = `<svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="zt-debugger-brand" x1="15" y1="15" x2="85" y2="85" gradientUnits="userSpaceOnUse">
      <stop stop-color="#38bdf8" />
      <stop offset="1" stop-color="#22c55e" />
    </linearGradient>
  </defs>
  <path
    d="M50 8L18 22V46C18 66.2 32 84.1 50 92C68 84.1 82 66.2 82 46V22L50 8Z"
    stroke="url(#zt-debugger-brand)"
    stroke-width="6"
    stroke-linejoin="round"
  />
  <path
    d="M34 54H42L46 44L52 62L58 50H66"
    stroke="white"
    stroke-width="8"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <circle cx="34" cy="54" r="2.8" fill="white" fill-opacity="0.7" />
  <circle cx="66" cy="50" r="2.8" fill="white" fill-opacity="0.7" />
  <path
    d="M30 28H70"
    stroke="white"
    stroke-opacity="0.12"
    stroke-width="3"
    stroke-linecap="round"
  />
</svg>`;

const SUN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56"></path></svg>`;

const MOON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>`;

const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

const JSON_HIGHLIGHT_PATTERN = String.raw`("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(?=\s*:)|(\s*:)|("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?`;
const SQL_HIGHLIGHT_PATTERN = String.raw`(\/\*[\s\S]*?\*\/|--.*$|'(?:''|[^'])*'|\x60[^\x60]+\x60|\b(?:select|from|where|insert|into|values|update|delete|join|left|right|inner|outer|on|and|or|limit|order|by|group|having|as|distinct|null|is|in|like|set|case|when|then|else|end|returning|union|all)\b|-?\d+(?:\.\d+)?)`;

const encodeSvgDataUri = (svg: string): string => {
  const compactSvg = svg.replaceAll(/>\s+</g, '><').trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(compactSvg)}`;
};

const DASHBOARD_DOCUMENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <title>__DEBUGGER_TITLE__</title>
  <link rel="icon" type="image/svg+xml" href="__DEBUGGER_FAVICON__">
  <script>
    (function(){
      const KEY = 'zintrust-debugger-theme';
      let theme = 'dark';
      try {
        const stored = window.localStorage.getItem(KEY);
        if (stored === 'light' || stored === 'dark') theme = stored;
        else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
      } catch {}
      document.documentElement.dataset.theme = theme;
    })();
  </script>
  <style>
    :root{--bg:#0b1220;--surface:rgba(15,23,42,.82);--surface-strong:#13233b;--surface-soft:rgba(15,23,42,.56);--line:rgba(148,163,184,.18);--text:#e5edf8;--muted:#94a3b8;--accent:#38bdf8;--accent-strong:#0ea5e9;--success:#22c55e;--danger:#ef4444;--warn:#f59e0b;--code-bg:#06101f;--code-border:rgba(56,189,248,.14);--shadow:0 24px 70px rgba(2,8,23,.35);--font:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;--mono:'SF Mono',SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;--radius:18px}
    html[data-theme='light']{--bg:#f4f6fb;--surface:rgba(255,255,255,.94);--surface-strong:#ffffff;--surface-soft:rgba(255,255,255,.8);--line:#dde4ef;--text:#172033;--muted:#6d7890;--accent:#2563eb;--accent-strong:#1d4ed8;--success:#16a34a;--danger:#dc2626;--warn:#b45309;--code-bg:#f7fbff;--code-border:#d7e1ee;--shadow:0 20px 60px rgba(15,23,42,.08)}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%}body{min-height:100vh;background:linear-gradient(180deg,rgba(56,189,248,.1),transparent 220px),var(--bg);font-family:var(--font);color:var(--text)}button,input,select{font:inherit}
    .layout{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:100vh}.sidebar{padding:26px 18px 22px;background:var(--surface-soft);backdrop-filter:blur(14px);border-right:1px solid var(--line);position:sticky;top:0;height:100vh;overflow:auto;z-index:2}.brand-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 10px 22px}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand-mark{width:44px;height:44px;border-radius:14px;border:1px solid rgba(56,189,248,.22);background:linear-gradient(180deg,rgba(56,189,248,.16),rgba(34,197,94,.12));display:grid;place-items:center;flex:none}.brand-mark svg{width:28px;height:28px;display:block}.brand-copy h1{margin:0;font-size:1.42rem;line-height:1.08}.brand-copy p{margin:4px 0 0;color:var(--muted);font-size:.92rem}.sidebar-status{margin:0 10px 18px;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--muted);line-height:1.5}.sidebar-status strong{display:block;color:var(--text);font-size:.95rem;margin-bottom:4px}.sidebar-group{padding:0 8px;margin-top:8px}.sidebar-label{margin:0 0 10px;font-size:.74rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.nav-button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;border:none;border-radius:14px;padding:12px 14px;background:transparent;color:var(--muted);cursor:pointer;transition:background .16s ease,color .16s ease,box-shadow .16s ease;position:relative;z-index:1}.nav-button:hover,.nav-button:focus-visible{background:rgba(56,189,248,.1);color:var(--text);outline:none}.nav-button.active{background:rgba(56,189,248,.14);color:var(--text);box-shadow:inset 0 0 0 1px rgba(56,189,248,.22)}.nav-button+.nav-button{margin-top:6px}.nav-title{font-weight:700}.nav-meta{font-size:.8rem;opacity:.75}.icon-button{width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--text);display:grid;place-items:center;cursor:pointer;transition:border-color .16s ease,transform .16s ease,color .16s ease}.icon-button:hover,.icon-button:focus-visible{border-color:rgba(56,189,248,.4);color:var(--accent);transform:translateY(-1px);outline:none}.icon-button svg{width:18px;height:18px;display:block}
    .main{padding:28px;min-width:0}.shell{max-width:1320px;margin:0 auto;display:grid;gap:18px}
    .panel{border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);backdrop-filter:blur(16px)}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin-bottom:18px}.stat-card{padding:20px;position:relative;overflow:hidden}.stat-card::after{content:'';position:absolute;right:-18px;bottom:-26px;width:92px;height:92px;border-radius:28px;background:linear-gradient(135deg,rgba(56,189,248,.16),rgba(34,197,94,.08));transform:rotate(18deg)}.stat-label{font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800;margin-bottom:12px}.stat-value{font-size:2.25rem;font-weight:800;line-height:1}.stat-meta{margin-top:10px;color:var(--muted);font-size:.9rem}.content-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,.95fr);gap:18px}.side-stack{display:grid;gap:18px}
    .section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:22px 24px 16px}.section-head h3{margin:0;font-size:1.04rem}.section-head p{margin:6px 0 0;color:var(--muted);font-size:.92rem}.toolbar{display:flex;flex-wrap:wrap;gap:10px;padding:0 24px 18px}.control,.toolbar input,.toolbar select{height:44px;border-radius:13px;border:1px solid var(--line);background:var(--surface-strong);color:var(--text);padding:0 14px;min-width:0}.toolbar input,.toolbar select{flex:1 1 180px}.toolbar input::placeholder{color:var(--muted)}.btn{height:44px;border:none;border-radius:13px;padding:0 16px;cursor:pointer;font-weight:800}.btn-primary{background:linear-gradient(135deg,var(--accent-strong),var(--accent));color:#fff}.btn-danger{background:rgba(239,68,68,.12);color:var(--danger);border:1px solid rgba(239,68,68,.18)}.btn-ghost{background:var(--surface-soft);color:var(--text);border:1px solid var(--line)}
    .table-wrap{overflow:auto;padding:0 12px 12px}table{width:100%;border-collapse:separate;border-spacing:0;min-width:880px}th{padding:14px;color:var(--muted);font-size:.74rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;text-align:left;border-bottom:1px solid var(--line)}td{padding:15px 14px;border-bottom:1px solid var(--line);vertical-align:top}.row-button{cursor:pointer}.row-button:hover td{background:rgba(56,189,248,.05)}.summary{font-size:.93rem;font-weight:700;line-height:1.4;color:var(--text)}.summary-sub{margin-top:6px;color:var(--muted);font-size:.82rem;line-height:1.4}.mono{font-family:var(--mono)}.empty{padding:44px 24px;color:var(--muted);line-height:1.65;text-align:center}.pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 24px 24px;color:var(--muted);flex-wrap:wrap}.pagination-controls{display:flex;gap:8px}.pagination button{height:40px;min-width:92px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface-strong);color:var(--text);cursor:pointer}.pagination button:disabled{opacity:.45;cursor:not-allowed}
    .activity-list{list-style:none;margin:0;padding:0 24px 24px}.activity-item{padding:14px 0;border-top:1px solid var(--line)}.activity-item:first-child{border-top:none}.activity-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.activity-time{color:var(--muted);font-size:.85rem}.activity-summary{margin-top:8px;color:var(--text);line-height:1.48}.back-link{display:inline-flex;align-items:center;gap:8px;margin:0 0 14px;color:var(--accent);font-weight:800;cursor:pointer}.detail-card{padding:24px}.detail-meta{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 20px;color:var(--muted);font-size:.9rem}.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.detail-stack{display:grid;gap:16px;margin-top:18px}.detail-box{padding:16px;border-radius:16px;background:var(--surface-soft);border:1px solid var(--line)}.detail-box h4{margin:0 0 10px;font-size:.92rem}.detail-box dl{margin:0;display:grid;gap:8px}.detail-box dt{font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800}.detail-box dd{margin:0;color:var(--text);line-height:1.45}.trace-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0 16px}.trace-tab{border:none;border-radius:12px;padding:10px 12px;background:transparent;color:var(--muted);cursor:pointer;box-shadow:inset 0 0 0 1px var(--line);font-weight:800}.trace-tab.active{background:rgba(56,189,248,.12);color:var(--text);box-shadow:inset 0 0 0 1px rgba(56,189,248,.28)}.trace-panel{display:grid;gap:14px}.trace-item{padding:18px;border-radius:16px;background:var(--surface-soft);border:1px solid var(--line)}.trace-item-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.trace-item-summary{margin-top:10px;display:grid;gap:10px}.trace-note{color:var(--muted);line-height:1.6}
    .tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(56,189,248,.12);color:#bae6fd;font-size:.78rem;font-weight:800;margin:0 6px 6px 0;border:1px solid rgba(56,189,248,.18)}button.tag{cursor:pointer}html[data-theme='light'] .tag{color:#075985}.tag.failed{background:rgba(239,68,68,.14);color:#fecaca;border-color:rgba(239,68,68,.2)}html[data-theme='light'] .tag.failed{color:#b91c1c}.tag.slow{background:rgba(245,158,11,.12);color:#fde68a;border-color:rgba(245,158,11,.18)}html[data-theme='light'] .tag.slow{color:#92400e}.type-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:.74rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;border:1px solid transparent}.pill-request{background:rgba(56,189,248,.14);color:#93c5fd}.pill-query{background:rgba(34,197,94,.12);color:#86efac}.pill-exception{background:rgba(239,68,68,.14);color:#fecaca}.pill-log{background:rgba(168,85,247,.14);color:#ddd6fe}.pill-job,.pill-batch{background:rgba(245,158,11,.14);color:#fde68a}.pill-cache{background:rgba(20,184,166,.12);color:#99f6e4}.pill-schedule,.pill-command{background:rgba(14,165,233,.14);color:#bae6fd}.pill-mail,.pill-notification{background:rgba(236,72,153,.14);color:#fbcfe8}.pill-auth{background:rgba(148,163,184,.16);color:#e2e8f0}.pill-event,.pill-model{background:rgba(74,222,128,.14);color:#bbf7d0}.pill-redis{background:rgba(239,68,68,.12);color:#fecaca}.pill-gate{background:rgba(99,102,241,.14);color:#c7d2fe}.pill-middleware{background:rgba(45,212,191,.12);color:#ccfbf1}.pill-dump,.pill-view{background:rgba(148,163,184,.14);color:#e2e8f0}.pill-client-request{background:rgba(59,130,246,.14);color:#bfdbfe}html[data-theme='light'] .pill-request{color:#1d4ed8}html[data-theme='light'] .pill-query{color:#166534}html[data-theme='light'] .pill-exception{color:#b91c1c}html[data-theme='light'] .pill-log{color:#6d28d9}html[data-theme='light'] .pill-job,html[data-theme='light'] .pill-batch{color:#92400e}html[data-theme='light'] .pill-cache{color:#115e59}html[data-theme='light'] .pill-schedule,html[data-theme='light'] .pill-command{color:#0c4a6e}html[data-theme='light'] .pill-mail,html[data-theme='light'] .pill-notification{color:#9d174d}html[data-theme='light'] .pill-auth,html[data-theme='light'] .pill-dump,html[data-theme='light'] .pill-view{color:#334155}html[data-theme='light'] .pill-event,html[data-theme='light'] .pill-model{color:#166534}html[data-theme='light'] .pill-redis{color:#991b1b}html[data-theme='light'] .pill-gate{color:#3730a3}html[data-theme='light'] .pill-middleware{color:#155e75}html[data-theme='light'] .pill-client-request{color:#1d4ed8}
    .monitoring-wrap{padding:0 24px 24px}.tag-list{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}.tag-item{display:inline-flex;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface-strong)}.tag-remove{border:none;background:rgba(239,68,68,.14);color:var(--danger);border-radius:999px;width:24px;height:24px;cursor:pointer;font-size:1rem;line-height:1}.helper-text{color:var(--muted);line-height:1.6}
    .duration-chip{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;border:1px solid transparent;font-size:.8rem;font-weight:700;color:var(--text);white-space:nowrap}.duration-chip.vfast{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.28);color:#bbf7d0}.duration-chip.fast{background:rgba(56,189,248,.12);border-color:rgba(56,189,248,.24);color:#bae6fd}.duration-chip.slow{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.22);color:#fde68a}.duration-chip.vslow{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.24);color:#fecaca}html[data-theme='light'] .duration-chip.vfast{color:#166534}html[data-theme='light'] .duration-chip.fast{color:#1d4ed8}html[data-theme='light'] .duration-chip.slow{color:#92400e}html[data-theme='light'] .duration-chip.vslow{color:#b91c1c}
    .code-card{border-radius:16px;border:1px solid var(--code-border);background:var(--surface-soft);overflow:hidden}.code-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line)}.code-label{font-size:.76rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800}.copy-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:38px;height:38px;border-radius:12px;border:1px solid var(--line);background:var(--surface-strong);color:var(--text);cursor:pointer;transition:border-color .16s ease,color .16s ease}.copy-button:hover{border-color:rgba(56,189,248,.35);color:var(--accent)}.copy-button[data-copied='true']{color:var(--success);border-color:rgba(34,197,94,.28)}.copy-button svg{width:16px;height:16px;display:block}.code-block{margin:0;padding:18px 20px;background:var(--code-bg);color:#dbeafe;border:0;overflow:auto;white-space:pre;line-height:1.72;font-family:var(--mono);font-size:.92rem}.code-block code{font-family:inherit}.tok-key{color:#93c5fd}.tok-string{color:#86efac}.tok-number{color:#f9a8d4}.tok-boolean{color:#facc15}.tok-null{color:#fb7185}.tok-punctuation{color:#94a3b8}.tok-sql-keyword{color:#f472b6;font-weight:700}.tok-sql-identifier{color:#93c5fd}.tok-sql-string{color:#86efac}.tok-sql-number{color:#facc15}.tok-sql-comment{color:#64748b;font-style:italic}html[data-theme='light'] .code-block{color:#0f172a}html[data-theme='light'] .tok-key{color:#1d4ed8}html[data-theme='light'] .tok-string{color:#15803d}html[data-theme='light'] .tok-number{color:#c026d3}html[data-theme='light'] .tok-boolean{color:#b45309}html[data-theme='light'] .tok-null{color:#dc2626}html[data-theme='light'] .tok-punctuation{color:#64748b}html[data-theme='light'] .tok-sql-keyword{color:#db2777}html[data-theme='light'] .tok-sql-identifier{color:#2563eb}html[data-theme='light'] .tok-sql-string{color:#15803d}html[data-theme='light'] .tok-sql-number{color:#b45309}html[data-theme='light'] .tok-sql-comment{color:#6b7280}
    @media (max-width:1120px){.content-grid{grid-template-columns:1fr}}@media (max-width:920px){.layout{grid-template-columns:1fr}.sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid var(--line)}.main{padding:20px}}@media (max-width:640px){.stats-grid{grid-template-columns:1fr}.detail-card{padding:18px}.toolbar,.section-head,.pagination,.activity-list,.monitoring-wrap{padding-left:18px;padding-right:18px}.table-wrap{padding:0 8px 10px}.brand-row{padding-bottom:18px}}
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand-row">
        <div class="brand">
          <div class="brand-mark">__DEBUGGER_LOGO__</div>
          <div class="brand-copy">
            <h1>ZinTrust Debugger</h1>
            <p class="mono">__DEBUGGER_PROJECT_NAME__</p>
          </div>
        </div>
        <button type="button" class="icon-button" id="theme-toggle" aria-label="Toggle theme"></button>
      </div>
      <div class="sidebar-status">
        <strong id="page-title">Runtime overview</strong>
        <span id="page-subtitle">Recent debugger activity and trace filters.</span>
      </div>
      <div class="sidebar-group">
        <p class="sidebar-label">Navigation</p>
        <button type="button" class="nav-button active" data-page="overview"><span class="nav-title">Overview</span><span class="nav-meta">Summary</span></button>
        <button type="button" class="nav-button" data-page="entries"><span class="nav-title">Entries</span><span class="nav-meta">Events</span></button>
        <button type="button" class="nav-button" data-page="monitoring"><span class="nav-title">Monitoring</span><span class="nav-meta">Tags</span></button>
      </div>
      <div class="sidebar-group">
        <p class="sidebar-label">Streams</p>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="request"><span class="nav-title">Requests</span><span class="nav-meta">HTTP</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="query"><span class="nav-title">Queries</span><span class="nav-meta">SQL</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="job"><span class="nav-title">Jobs</span><span class="nav-meta">Queue</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="exception"><span class="nav-title">Exceptions</span><span class="nav-meta">Errors</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="log"><span class="nav-title">Logs</span><span class="nav-meta">App</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="cache"><span class="nav-title">Cache</span><span class="nav-meta">Store</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="client_request"><span class="nav-title">Http Client</span><span class="nav-meta">Outbound</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="redis"><span class="nav-title">Redis</span><span class="nav-meta">Command</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="notification"><span class="nav-title">Notifications</span><span class="nav-meta">Alerts</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="model"><span class="nav-title">Models</span><span class="nav-meta">ORM</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="schedule"><span class="nav-title">Schedule</span><span class="nav-meta">Tasks</span></button>
        <button type="button" class="nav-button" data-action="type-shortcut" data-type="mail"><span class="nav-title">Mail</span><span class="nav-meta">Outbound</span></button>
      </div>
    </aside>
    <main class="main">
      <div class="shell">
        <div id="main"></div>
      </div>
    </main>
  </div>
  <script>
  (function(){
    const BASE = __DEBUGGER_BASE_PATH_JSON__;
    const API = BASE + '/api';
    const THEME_KEY = 'zintrust-debugger-theme';
    const SUN_ICON = __DEBUGGER_SUN_ICON__;
    const MOON_ICON = __DEBUGGER_MOON_ICON__;
    const COPY_ICON = __DEBUGGER_COPY_ICON__;
    const JSON_HIGHLIGHT_PATTERN = new RegExp(__DEBUGGER_JSON_REGEX__, 'g');
    const SQL_HIGHLIGHT_PATTERN = new RegExp(__DEBUGGER_SQL_REGEX__, 'gim');
    const ENTRY_TYPES = ['request','query','exception','log','job','cache','schedule','mail','auth','event','model','notification','redis','gate','middleware','command','batch','dump','view','client_request'];
    const PAGE_COPY = {
      overview: { title: 'Runtime overview', subtitle: 'Recent debugger activity and trace filters.' },
      entries: { title: 'Entry explorer', subtitle: 'Filter by type, tag, or batch.' },
      monitoring: { title: 'Monitoring tags', subtitle: 'Pinned tags for trace pivots.' }
    };

    let state = {
      page: 'overview',
      entriesPage: 1,
      entriesFilter: { type: '', tag: '', batchId: '' },
      detail: null,
      detailBatch: null,
      detailTab: 'summary'
    };

    let copySequence = 0;
    const copyPayloads = new Map();

    const updateThemeButton = () => {
      const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const toggle = document.getElementById('theme-toggle');
      if (toggle) {
        toggle.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
        toggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      }
    };

    const setTheme = (theme) => {
      document.documentElement.dataset.theme = theme;
      try { window.localStorage.setItem(THEME_KEY, theme); } catch {}
      updateThemeButton();
    };

    const setPageCopy = (page) => {
      const copy = PAGE_COPY[page] || PAGE_COPY.overview;
      const title = document.getElementById('page-title');
      const subtitle = document.getElementById('page-subtitle');
      if (title) title.textContent = copy.title;
      if (subtitle) subtitle.textContent = copy.subtitle;
    };

    const activeEntryShortcut = () => state.page === 'entries' && state.entriesFilter.type !== '' ? state.entriesFilter.type : '';

    const escapeHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const api = async (path, opts) => {
      const response = await fetch(API + path, opts);
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || response.statusText);
      }
      return response.json();
    };

    const typeClass = (type) => 'type-pill pill-' + String(type || '').replace(/_/g, '-');

    const timeSince = (value) => {
      const createdAt = Number(value);
      if (!Number.isFinite(createdAt)) return 'Unknown';
      const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
      if (seconds < 60) return seconds + 's ago';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      return Math.floor(seconds / 86400) + 'd ago';
    };

    const formatDuration = (value) => {
      const duration = Number(value);
      if (!Number.isFinite(duration) || duration < 0) return '-';
      if (duration === 0) return '0 ms';
      if (duration < 10) {
        const fixed = duration.toFixed(2);
        const compact = fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
        return compact + ' ms';
      }
      if (duration < 100) {
        const fixed = duration.toFixed(1);
        return (fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed) + ' ms';
      }
      return Math.round(duration) + ' ms';
    };

    const getEntryDuration = (entry) => {
      const content = entry && entry.content ? entry.content : {};
      const primary = Number(content.duration);
      if (Number.isFinite(primary)) return primary;
      const fallback = Number(content.time);
      return Number.isFinite(fallback) ? fallback : null;
    };

    const getDurationTone = (duration) => {
      if (!Number.isFinite(duration) || duration < 0) return '';
      if (duration < 25) return 'vfast';
      if (duration < 150) return 'fast';
      if (duration < 600) return 'slow';
      return 'vslow';
    };

    const durationHtml = (entry) => {
      const duration = getEntryDuration(entry);
      if (duration === null) return '<span class="activity-time">-</span>';
      const tone = getDurationTone(duration);
      const toneLabel = tone === 'vfast' ? 'VFast' : tone === 'fast' ? 'Fast' : tone === 'slow' ? 'Slow' : 'VSlow';
      return '<span class="duration-chip ' + tone + '" title="' + toneLabel + '">' + escapeHtml(formatDuration(duration)) + '</span>';
    };

    const tagsHtml = (tags) => (tags || []).map((tag) => {
      const css = tag === 'failed' ? 'tag failed' : tag === 'slow' ? 'tag slow' : 'tag';
      return '<button type="button" class="' + css + '" data-action="filter-tag" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
    }).join('');

    const batchSnippet = (batchId) => {
      const raw = String(batchId || '');
      return raw === '' ? '-' : escapeHtml(raw.slice(0, 8));
    };

    const batchEntries = () => Array.isArray(state.detailBatch) ? state.detailBatch : [];
    const batchEntriesByType = (type) => batchEntries().filter((entry) => entry.type === type);
    const hasRequestTrace = () => Boolean(state.detail && state.detail.type === 'request' && batchEntries().length > 0);

    const prettyJson = (value) => {
      try {
        return JSON.stringify(value ?? {}, null, 2) ?? '{}';
      } catch {
        return String(value ?? '');
      }
    };

    const registerCopyPayload = (text) => {
      const id = 'copy-' + (++copySequence);
      copyPayloads.set(id, text);
      return id;
    };

    const renderCodeCard = (label, rawText, highlightedHtml, languageClass) => {
      const copyId = registerCopyPayload(rawText);
      return [
        '<section class="code-card">',
        '<div class="code-toolbar">',
        '<span class="code-label">' + escapeHtml(label) + '</span>',
        '<button type="button" class="copy-button" data-action="copy-code" data-copy-id="' + escapeHtml(copyId) + '" title="Copy ' + escapeHtml(label) + '">',
        COPY_ICON,
        '</button>',
        '</div>',
        '<pre class="code-block ' + escapeHtml(languageClass) + '"><code>' + highlightedHtml + '</code></pre>',
        '</section>'
      ].join('');
    };

    const highlightJson = (value) => {
      const source = prettyJson(value);
      let output = '';
      let lastIndex = 0;

      for (const match of source.matchAll(JSON_HIGHLIGHT_PATTERN)) {
        const index = match.index ?? 0;
        output += escapeHtml(source.slice(lastIndex, index));
        const token = match[0];
        if (match[1]) output += '<span class="tok-key">' + escapeHtml(match[1]) + '</span>';
        else if (match[2]) output += '<span class="tok-punctuation">' + escapeHtml(match[2]) + '</span>';
        else if (token === 'true' || token === 'false') output += '<span class="tok-boolean">' + token + '</span>';
        else if (token === 'null') output += '<span class="tok-null">null</span>';
        else if (/^"/.test(token)) output += '<span class="tok-string">' + escapeHtml(token) + '</span>';
        else output += '<span class="tok-number">' + escapeHtml(token) + '</span>';
        lastIndex = index + token.length;
      }

      output += escapeHtml(source.slice(lastIndex));
      return renderCodeCard('JSON', source, output, 'language-json');
    };

    const highlightSql = (sql) => {
      const source = String(sql || '');
      let output = '';
      let lastIndex = 0;

      for (const match of source.matchAll(SQL_HIGHLIGHT_PATTERN)) {
        const index = match.index ?? 0;
        const token = match[0];
        output += escapeHtml(source.slice(lastIndex, index));

        if (token.startsWith('/*') || token.startsWith('--')) output += '<span class="tok-sql-comment">' + escapeHtml(token) + '</span>';
        else if (token.startsWith("'")) output += '<span class="tok-sql-string">' + escapeHtml(token) + '</span>';
        else if (token.charCodeAt(0) === 96) output += '<span class="tok-sql-identifier">' + escapeHtml(token) + '</span>';
        else {
          const numericIndex = token.startsWith('-') ? 1 : 0;
          const numericChar = token.charAt(numericIndex);
          if (numericChar >= '0' && numericChar <= '9') output += '<span class="tok-sql-number">' + escapeHtml(token) + '</span>';
          else output += '<span class="tok-sql-keyword">' + escapeHtml(token) + '</span>';
        }

        lastIndex = index + token.length;
      }

      output += escapeHtml(source.slice(lastIndex));
      return renderCodeCard('SQL', source, output, 'language-sql');
    };

    const detailJson = (value) => highlightJson(value ?? {});

    const entrySummaryText = (entry) => {
      const content = entry && entry.content ? entry.content : {};
      if (entry.type === 'request') return [content.method || '', content.uri || ''].filter(Boolean).join(' ');
      if (entry.type === 'query') return String(content.sql || '').slice(0, 160);
      if (entry.type === 'exception') return [content.class || '', content.message || ''].filter(Boolean).join(': ');
      if (entry.type === 'log') return '[' + String(content.level || 'log') + '] ' + String(content.message || '').slice(0, 160);
      if (entry.type === 'job') return [content.name || '', content.status || 'queued'].filter(Boolean).join(' · ');
      if (entry.type === 'cache') return [content.operation || '', content.key || ''].filter(Boolean).join(' ');
      if (entry.type === 'schedule') return [content.name || '', content.status || 'ran'].filter(Boolean).join(' · ');
      if (entry.type === 'mail') return ['To ' + (content.to || 'unknown'), content.subject || 'No subject'].join(' · ');
      if (entry.type === 'auth') return [content.event || 'auth', content.userId ? '#' + content.userId : ''].filter(Boolean).join(' ');
      if (entry.type === 'event') return String(content.name || 'event');
      if (entry.type === 'model') return [content.action || '', content.model || ''].filter(Boolean).join(' ');
      if (entry.type === 'notification') return [content.notification || '', (content.channels || []).join(', ')].filter(Boolean).join(' -> ');
      if (entry.type === 'redis') return String(content.command || 'redis');
      if (entry.type === 'gate') return [content.ability || '', content.result || ''].filter(Boolean).join(' · ');
      if (entry.type === 'middleware') return [content.name || '', content.event || ''].filter(Boolean).join(' · ');
      if (entry.type === 'command') return [content.name || '', content.exitCode !== undefined ? 'exit=' + content.exitCode : ''].filter(Boolean).join(' ');
      if (entry.type === 'batch') return [content.name || '', 'processed ' + (content.processed || 0) + '/' + (content.total || 0)].join(' · ');
      if (entry.type === 'view') return String(content.template || 'view');
      if (entry.type === 'client_request') return [content.method || '', content.url || ''].filter(Boolean).join(' ');
      return JSON.stringify(content).slice(0, 160);
    };

    const entrySummaryHtml = (entry) => {
      const summary = escapeHtml(entrySummaryText(entry) || 'No summary available');
      const secondary = [
        entry.type === 'request' ? 'Incoming request' : '',
        entry.type === 'query' ? 'Database query' : '',
        entry.type === 'exception' ? 'Unhandled error' : '',
        entry.type === 'client_request' ? 'Outbound HTTP call' : ''
      ].find(Boolean) || 'Debugger record';
      return '<div class="summary">' + summary + '</div><div class="summary-sub">' + escapeHtml(secondary) + '</div>';
    };

    const renderMetricBox = (title, items) => {
      return [
        '<section class="detail-box">',
        '<h4>' + escapeHtml(title) + '</h4>',
        '<dl>',
        items.map((item) => '<dt>' + escapeHtml(item.label) + '</dt><dd>' + item.value + '</dd>').join(''),
        '</dl>',
        '</section>'
      ].join('');
    };

    const renderEntryBody = (entry) => {
      const content = entry && entry.content ? entry.content : {};

      if (entry.type === 'query') {
        return [
          '<div class="detail-grid">',
          renderMetricBox('Query', [
            { label: 'Connection', value: escapeHtml(content.connection || 'default') },
            { label: 'Duration', value: escapeHtml(formatDuration(getEntryDuration(entry))) },
            { label: 'Slow', value: escapeHtml(content.slow ? 'Yes' : 'No') },
            { label: 'Hash', value: '<span class="mono">' + escapeHtml(content.hash || '') + '</span>' }
          ]),
          renderMetricBox('Runtime', [
            { label: 'Hostname', value: escapeHtml(content.hostname || '') },
            { label: 'Batch', value: '<span class="mono">' + escapeHtml(entry.batchId || '-') + '</span>' }
          ]),
          '</div>',
          highlightSql(content.sql || '')
        ].join('');
      }

      if (entry.type === 'log') {
        return [
          '<div class="detail-grid">',
          renderMetricBox('Log', [
            { label: 'Level', value: escapeHtml(content.level || '') },
            { label: 'Hostname', value: escapeHtml(content.hostname || '') }
          ]),
          renderMetricBox('Message', [
            { label: 'Text', value: escapeHtml(content.message || '') }
          ]),
          '</div>',
          content.context ? detailJson(content.context) : '<p class="trace-note">No log context was captured for this entry.</p>'
        ].join('');
      }

      if (entry.type === 'exception') {
        return [
          '<div class="detail-grid">',
          renderMetricBox('Exception', [
            { label: 'Class', value: escapeHtml(content.class || '') },
            { label: 'Message', value: escapeHtml(content.message || '') },
            { label: 'File', value: '<span class="mono">' + escapeHtml(content.file || '') + '</span>' },
            { label: 'Line', value: escapeHtml(content.line || '') }
          ]),
          renderMetricBox('Runtime', [
            { label: 'Hostname', value: escapeHtml(content.hostname || '') },
            { label: 'User', value: escapeHtml(content.userId || 'Anonymous') },
            { label: 'Occurrences', value: escapeHtml(content.occurrences || 1) }
          ]),
          '</div>',
          detailJson({ trace: content.trace || [], linePreview: content.linePreview || {} })
        ].join('');
      }

      if (entry.type === 'client_request') {
        return [
          '<div class="detail-grid">',
          renderMetricBox('Request', [
            { label: 'Method', value: escapeHtml(content.method || '') },
            { label: 'URL', value: '<span class="mono">' + escapeHtml(content.url || '') + '</span>' },
            { label: 'Status', value: escapeHtml(content.responseStatus || '') },
            { label: 'Duration', value: escapeHtml(formatDuration(getEntryDuration(entry))) }
          ]),
          renderMetricBox('Runtime', [
            { label: 'Hostname', value: escapeHtml(content.hostname || '') },
            { label: 'Batch', value: '<span class="mono">' + escapeHtml(entry.batchId || '-') + '</span>' }
          ]),
          '</div>',
          detailJson(content.requestHeaders || {})
        ].join('');
      }

      return detailJson(content);
    };

    const renderTraceItems = (entries) => {
      if (entries.length === 0) return '<p class="trace-note">No related entries captured.</p>';

      return '<div class="trace-panel">' + entries.map((entry) => {
        return [
          '<section class="trace-item">',
          '<div class="trace-item-head">',
          '<div>',
          '<span class="' + typeClass(entry.type) + '">' + escapeHtml(entry.type) + '</span>',
          '</div>',
          '<div class="activity-head">' + durationHtml(entry) + '<span class="activity-time">' + escapeHtml(timeSince(entry.createdAt)) + '</span></div>',
          '</div>',
          '<div class="trace-item-summary">',
          entrySummaryHtml(entry),
          '<div>' + tagsHtml(entry.tags) + '</div>',
          renderEntryBody(entry),
          '</div>',
          '</section>'
        ].join('');
      }).join('') + '</div>';
    };

    const renderRequestTrace = (main) => {
      const entry = state.detail;
      const content = entry && entry.content ? entry.content : {};
      const traceTabs = [
        { id: 'summary', label: 'Summary' },
        { id: 'payload', label: 'Payload' },
        { id: 'headers', label: 'Headers' },
        { id: 'response', label: 'Response' },
        { id: 'queries', label: 'Queries', count: batchEntriesByType('query').length },
        { id: 'logs', label: 'Logs', count: batchEntriesByType('log').length },
        { id: 'exceptions', label: 'Exceptions', count: batchEntriesByType('exception').length },
        { id: 'http', label: 'HTTP', count: batchEntriesByType('client_request').length },
        { id: 'other', label: 'Other', count: batchEntries().filter((item) => !['request','query','log','exception','client_request'].includes(item.type)).length }
      ];
      const currentTab = traceTabs.some((tab) => tab.id === state.detailTab) ? state.detailTab : 'summary';
      const otherEntries = batchEntries().filter((item) => !['request','query','log','exception','client_request'].includes(item.type));
      const panels = {
        summary: [
          '<div class="detail-grid">',
          renderMetricBox('Request', [
            { label: 'Method', value: escapeHtml(content.method || '') },
            { label: 'Path', value: '<span class="mono">' + escapeHtml(content.uri || '') + '</span>' },
            { label: 'Status', value: escapeHtml(content.responseStatus || '') },
            { label: 'Duration', value: escapeHtml(formatDuration(getEntryDuration(entry))) }
          ]),
          renderMetricBox('Runtime', [
            { label: 'Hostname', value: escapeHtml(content.hostname || '') },
            { label: 'User', value: escapeHtml(content.userId || 'Anonymous') },
            { label: 'Memory', value: escapeHtml(content.memory === null || content.memory === undefined ? 'Unavailable' : String(content.memory)) },
            { label: 'Batch', value: '<span class="mono">' + escapeHtml(entry.batchId || '') + '</span>' }
          ]),
          renderMetricBox('Tags', [
            { label: 'Values', value: tagsHtml(entry.tags) || '<span class="activity-time">-</span>' }
          ]),
          '</div>'
        ].join(''),
        payload: detailJson(content.payload || {}),
        headers: '<div class="detail-stack">' + detailJson(content.headers || {}) + detailJson(content.responseHeaders || {}) + '</div>',
        response: '<div class="detail-stack"><div class="detail-grid">' + renderMetricBox('Status', [{ label: 'Response status', value: escapeHtml(content.responseStatus || '') }, { label: 'Duration', value: escapeHtml(formatDuration(getEntryDuration(entry))) }]) + '</div><p class="trace-note">Response body capture is not wired yet. Status and headers are available.</p>' + detailJson(content.responseHeaders || {}) + '</div>',
        queries: renderTraceItems(batchEntriesByType('query')),
        logs: renderTraceItems(batchEntriesByType('log')),
        exceptions: renderTraceItems(batchEntriesByType('exception')),
        http: renderTraceItems(batchEntriesByType('client_request')),
        other: renderTraceItems(otherEntries)
      };

      main.innerHTML = [
        '<span class="back-link" data-action="close-detail"><- Back to entries</span>',
        '<section class="panel detail-card">',
        '<div><span class="' + typeClass(entry.type) + '">' + escapeHtml(entry.type) + '</span> ' + tagsHtml(entry.tags) + '</div>',
        '<div class="detail-meta"><span>UUID <span class="mono">' + escapeHtml(entry.uuid) + '</span></span><span>Batch <span class="mono">' + escapeHtml(entry.batchId || '-') + '</span></span><span>' + durationHtml(entry) + '</span><span>' + escapeHtml(new Date(Number(entry.createdAt)).toISOString()) + '</span></div>',
        '<div class="trace-tabs">',
        traceTabs.map((tab) => '<button type="button" class="trace-tab' + (tab.id === currentTab ? ' active' : '') + '" data-action="detail-tab" data-tab="' + escapeHtml(tab.id) + '">' + escapeHtml(tab.label) + (tab.count !== undefined ? ' (' + escapeHtml(tab.count) + ')' : '') + '</button>').join(''),
        '</div>',
        panels[currentTab] || panels.summary,
        '</section>'
      ].join('');
    };

    const statsCardsHtml = (stats) => {
      const total = Object.values(stats).reduce((sum, value) => sum + Number(value || 0), 0);
      const cards = [{ label: 'Total entries', value: total, meta: 'Stored debugger entries.' }]
        .concat(Object.entries(stats).filter((pair) => Number(pair[1]) > 0).map((pair) => ({ label: pair[0], value: Number(pair[1]), meta: pair[0] === 'query' ? 'Captured queries.' : 'Captured ' + pair[0] + '.' })));
      return '<div class="stats-grid">' + cards.map((card) => '<section class="panel stat-card"><div class="stat-label">' + escapeHtml(card.label) + '</div><div class="stat-value">' + escapeHtml(card.value) + '</div><div class="stat-meta">' + escapeHtml(card.meta) + '</div></section>').join('') + '</div>';
    };

    const renderOverview = async (main) => {
      main.innerHTML = '<div class="panel empty">Loading debugger overview...</div>';
      try {
        const results = await Promise.all([api('/stats'), api('/entries?perPage=8&page=1')]);
        const stats = results[0].stats;
        const recent = results[1];
        const recentRows = recent.data || [];
        const recentTable = recentRows.length === 0
          ? '<div class="empty">No debugger entries recorded.</div>'
          : '<div class="table-wrap"><table><thead><tr><th>Type</th><th>Summary</th><th>Tags</th><th>Duration</th><th>Happened</th></tr></thead><tbody>' + recentRows.map((entry) => '<tr class="row-button" data-action="show-detail" data-uuid="' + escapeHtml(entry.uuid) + '"><td><span class="' + typeClass(entry.type) + '">' + escapeHtml(entry.type) + '</span></td><td>' + entrySummaryHtml(entry) + '</td><td>' + tagsHtml(entry.tags) + '</td><td>' + durationHtml(entry) + '</td><td class="activity-time">' + escapeHtml(timeSince(entry.createdAt)) + '</td></tr>').join('') + '</tbody></table></div>';
        const activityList = recentRows.length === 0
          ? '<div class="empty">No recent activity.</div>'
          : '<ul class="activity-list">' + recentRows.slice(0, 5).map((entry) => '<li class="activity-item"><div class="activity-head"><span class="' + typeClass(entry.type) + '">' + escapeHtml(entry.type) + '</span>' + durationHtml(entry) + '<span class="activity-time">' + escapeHtml(timeSince(entry.createdAt)) + '</span></div><div class="activity-summary">' + escapeHtml(entrySummaryText(entry)) + '</div></li>').join('') + '</ul>';

        main.innerHTML = [
          statsCardsHtml(stats),
          '<div class="content-grid">',
          '<section class="panel">',
          '<div class="section-head"><div><h3>Recent entries</h3><p>Latest captured records.</p></div><button type="button" class="btn btn-primary" data-action="go-page" data-page="entries">Open entries</button></div>',
          recentTable,
          '</section>',
          '<div class="side-stack">',
          '<section class="panel">',
          '<div class="section-head"><div><h3>Actions</h3><p>Debugger maintenance.</p></div></div>',
          '<div class="toolbar"><button type="button" class="btn btn-danger" data-action="clear-all">Clear entries</button><button type="button" class="btn btn-ghost" data-action="go-page" data-page="monitoring">Manage tags</button></div>',
          '</section>',
          '<section class="panel">',
          '<div class="section-head"><div><h3>Recent activity</h3><p>Latest captured events.</p></div></div>',
          activityList,
          '</section>',
          '</div>',
          '</div>'
        ].join('');
      } catch (error) {
        main.innerHTML = '<div class="panel empty">Error loading overview: ' + escapeHtml(error.message) + '</div>';
      }
    };

    const renderEntries = async (main) => {
      if (state.detail) {
        renderDetail(main);
        return;
      }

      main.innerHTML = '<div class="panel empty">Loading entries...</div>';
      try {
        const qs = new URLSearchParams({ page: String(state.entriesPage), perPage: '50' });
        if (state.entriesFilter.type) qs.set('type', state.entriesFilter.type);
        if (state.entriesFilter.tag) qs.set('tag', state.entriesFilter.tag);
        if (state.entriesFilter.batchId) qs.set('batchId', state.entriesFilter.batchId);

        const response = await api('/entries?' + qs.toString());
        const data = response.data || [];
        const total = Number(response.total || 0);
        const perPage = Number(response.perPage || 50);
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const rows = data.map((entry) => '<tr class="row-button" data-action="show-detail" data-uuid="' + escapeHtml(entry.uuid) + '"><td><span class="' + typeClass(entry.type) + '">' + escapeHtml(entry.type) + '</span></td><td>' + entrySummaryHtml(entry) + '</td><td>' + tagsHtml(entry.tags) + '</td><td>' + durationHtml(entry) + '</td><td class="mono">' + batchSnippet(entry.batchId) + '</td><td class="activity-time">' + escapeHtml(timeSince(entry.createdAt)) + '</td></tr>').join('');

        main.innerHTML = [
          '<section class="panel">',
          '<div class="section-head"><div><h3>Entries</h3><p>Filter by type, tag, or batch.</p></div></div>',
          '<div class="toolbar">',
          '<select id="f-type"><option value="">All types</option>' + ENTRY_TYPES.map((type) => '<option value="' + escapeHtml(type) + '"' + (state.entriesFilter.type === type ? ' selected' : '') + '>' + escapeHtml(type) + '</option>').join('') + '</select>',
          '<input id="f-tag" type="text" placeholder="Tag" value="' + escapeHtml(state.entriesFilter.tag) + '">',
          '<input id="f-batch" type="text" placeholder="Batch ID" value="' + escapeHtml(state.entriesFilter.batchId) + '">',
          '<button type="button" class="btn btn-ghost" data-action="clear-filters">Reset</button>',
          '</div>',
          data.length === 0 ? '<div class="empty">No entries match the current filter.</div>' : '<div class="table-wrap"><table><thead><tr><th>Type</th><th>Summary</th><th>Tags</th><th>Duration</th><th>Batch</th><th>Happened</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
          '<div class="pagination"><span>Page ' + escapeHtml(state.entriesPage) + ' of ' + escapeHtml(totalPages) + ' · ' + escapeHtml(total) + ' total entries</span><div class="pagination-controls"><button type="button" data-action="page-prev"' + (state.entriesPage <= 1 ? ' disabled' : '') + '>Previous</button><button type="button" data-action="page-next"' + (state.entriesPage >= totalPages ? ' disabled' : '') + '>Next</button></div></div>',
          '</section>'
        ].join('');
      } catch (error) {
        main.innerHTML = '<div class="panel empty">Error loading entries: ' + escapeHtml(error.message) + '</div>';
      }
    };

    const renderDetail = (main) => {
      if (!state.detail) {
        state = { ...state, detail: null, detailBatch: null, detailTab: 'summary' };
        renderEntries(main);
        return;
      }

      if (hasRequestTrace()) {
        renderRequestTrace(main);
        return;
      }

      const entry = state.detail;
      main.innerHTML = [
        '<span class="back-link" data-action="close-detail"><- Back to entries</span>',
        '<section class="panel detail-card">',
        '<div><span class="' + typeClass(entry.type) + '">' + escapeHtml(entry.type) + '</span> ' + tagsHtml(entry.tags) + '</div>',
        '<div class="detail-meta"><span>UUID <span class="mono">' + escapeHtml(entry.uuid) + '</span></span><span>Batch <span class="mono">' + escapeHtml(entry.batchId || '-') + '</span></span><span>' + durationHtml(entry) + '</span><span>' + escapeHtml(new Date(Number(entry.createdAt)).toISOString()) + '</span></div>',
        '<div class="detail-stack">',
        renderEntryBody(entry),
        '</div>',
        '</section>'
      ].join('');
    };

    const renderMonitoring = async (main) => {
      main.innerHTML = '<div class="panel empty">Loading monitoring tags...</div>';
      try {
        const result = await api('/monitoring');
        const tags = result.tags || [];
        main.innerHTML = [
          '<section class="panel">',
          '<div class="section-head"><div><h3>Monitoring tags</h3><p>Pinned tags for quick filtering.</p></div></div>',
          '<div class="monitoring-wrap">',
          '<div class="tag-list">',
          tags.length === 0 ? '<span class="helper-text">No tags monitored.</span>' : tags.map((tag) => '<span class="tag-item"><button type="button" class="tag mono" data-action="filter-tag" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button><button type="button" class="tag-remove" data-action="remove-tag" data-tag="' + escapeHtml(tag) + '">x</button></span>').join(''),
          '</div>',
          '<div class="toolbar" style="padding:0;margin-top:8px">',
          '<input id="new-tag" class="control" type="text" placeholder="Add tag">',
          '<button type="button" class="btn btn-primary" data-action="add-tag">Add tag</button>',
          '</div>',
          '</div>',
          '</section>'
        ].join('');
      } catch (error) {
        main.innerHTML = '<div class="panel empty">Error loading monitoring tags: ' + escapeHtml(error.message) + '</div>';
      }
    };

    const render = async () => {
      const main = document.getElementById('main');
      if (!main) return;

      setPageCopy(state.page);
      updateThemeButton();
      const activeShortcut = activeEntryShortcut();
      document.querySelectorAll('[data-page]').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-page') === state.page);
      });
      document.querySelectorAll('[data-action="type-shortcut"]').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-type') === activeShortcut);
      });

      if (state.page === 'overview') await renderOverview(main);
      if (state.page === 'entries') await renderEntries(main);
      if (state.page === 'monitoring') await renderMonitoring(main);
    };

    const setPage = (page) => {
      state = { ...state, page, entriesPage: 1, detail: null, detailBatch: null, detailTab: 'summary' };
      render();
    };

    const setTypeShortcut = (type) => {
      state = { ...state, page: 'entries', detail: null, detailBatch: null, detailTab: 'summary', entriesPage: 1, entriesFilter: { ...state.entriesFilter, type } };
      render();
    };

    const filterByTag = (tag) => {
      state = { ...state, page: 'entries', detail: null, detailBatch: null, detailTab: 'summary', entriesPage: 1, entriesFilter: { ...state.entriesFilter, tag, batchId: '' } };
      render();
    };

    const syncFilters = () => {
      const typeInput = document.getElementById('f-type');
      const tagInput = document.getElementById('f-tag');
      const batchInput = document.getElementById('f-batch');
      state = {
        ...state,
        entriesPage: 1,
        entriesFilter: {
          type: typeInput && 'value' in typeInput ? String(typeInput.value || '') : '',
          tag: tagInput && 'value' in tagInput ? String(tagInput.value || '') : '',
          batchId: batchInput && 'value' in batchInput ? String(batchInput.value || '') : ''
        }
      };
      render();
    };

    const clearAll = async () => {
      if (!window.confirm('Delete all debugger entries?')) return;
      try {
        await api('/entries', { method: 'DELETE' });
        state = { ...state, detail: null, detailBatch: null, detailTab: 'summary', entriesPage: 1 };
        render();
      } catch (error) {
        window.alert(error.message);
      }
    };

    const showDetail = async (uuid) => {
      try {
        const detailResult = await api('/entries/' + encodeURIComponent(uuid));
        const entry = detailResult.entry;
        let detailBatch = null;
        if (entry.type === 'request' && entry.batchId) {
          const batch = await api('/batch/' + encodeURIComponent(entry.batchId));
          detailBatch = batch.entries || [];
        }
        state = { ...state, detail: entry, detailBatch, detailTab: 'summary', page: 'entries' };
        render();
      } catch (error) {
        window.alert(error.message);
      }
    };

    const addTag = async () => {
      const input = document.getElementById('new-tag');
      const value = input && 'value' in input ? String(input.value || '').trim() : '';
      if (value === '') return;
      try {
        await api('/monitoring/' + encodeURIComponent(value), { method: 'POST' });
        render();
      } catch (error) {
        window.alert(error.message);
      }
    };

    const removeTag = async (tag) => {
      try {
        await api('/monitoring/' + encodeURIComponent(tag), { method: 'DELETE' });
        render();
      } catch (error) {
        window.alert(error.message);
      }
    };

    const copyText = async (text) => {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    };

    const copyCode = async (copyId, button) => {
      const payload = copyPayloads.get(copyId);
      if (typeof payload !== 'string') return;
      try {
        await copyText(payload);
        if (button instanceof HTMLElement) {
          button.dataset.copied = 'true';
          window.setTimeout(() => {
            if (button.dataset.copied === 'true') delete button.dataset.copied;
          }, 1200);
        }
      } catch (error) {
        window.alert(error.message || 'Failed to copy block');
      }
    };

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-action],[data-page],#theme-toggle') : null;
      if (!target) return;

      if (target.id === 'theme-toggle') {
        setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
        return;
      }

      if (target.hasAttribute('data-page') && !target.hasAttribute('data-action')) {
        setPage(String(target.getAttribute('data-page') || 'overview'));
        return;
      }

      const action = target.getAttribute('data-action');
      if (action === 'go-page') { setPage(String(target.getAttribute('data-page') || 'overview')); return; }
      if (action === 'type-shortcut') { setTypeShortcut(String(target.getAttribute('data-type') || '')); return; }
      if (action === 'filter-tag') { filterByTag(String(target.getAttribute('data-tag') || '')); return; }
      if (action === 'detail-tab') { state = { ...state, detailTab: String(target.getAttribute('data-tab') || 'summary') }; render(); return; }
      if (action === 'clear-all') { clearAll(); return; }
      if (action === 'show-detail') { showDetail(String(target.getAttribute('data-uuid') || '')); return; }
      if (action === 'close-detail') { state = { ...state, detail: null, detailBatch: null, detailTab: 'summary' }; render(); return; }
      if (action === 'page-prev') { state = { ...state, entriesPage: Math.max(1, state.entriesPage - 1) }; render(); return; }
      if (action === 'page-next') { state = { ...state, entriesPage: state.entriesPage + 1 }; render(); return; }
      if (action === 'clear-filters') { state = { ...state, detail: null, detailBatch: null, detailTab: 'summary', entriesPage: 1, entriesFilter: { type: '', tag: '', batchId: '' } }; render(); return; }
      if (action === 'add-tag') { addTag(); return; }
      if (action === 'remove-tag') { removeTag(String(target.getAttribute('data-tag') || '')); return; }
      if (action === 'copy-code') { copyCode(String(target.getAttribute('data-copy-id') || ''), target); }
    });

    document.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.id === 'f-tag' || target.id === 'f-batch') syncFilters();
    });

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.id === 'f-type') syncFilters();
    });

    render();
  })();
  </script>
</body>
</html>`;

const buildDashboardHtml = (basePath: string, projectName?: string): string => {
  const resolvedProjectName = projectName && projectName.trim() !== '' ? projectName : 'ZinTrust';
  const resolvedTitle = `ZinTrust Debugger - ${resolvedProjectName}`;

  return DASHBOARD_DOCUMENT.replace('__DEBUGGER_FAVICON__', encodeSvgDataUri(BRAND_SVG))
    .replace('__DEBUGGER_TITLE__', resolvedTitle)
    .replace('__DEBUGGER_LOGO__', BRAND_SVG)
    .replaceAll('__DEBUGGER_PROJECT_NAME__', resolvedProjectName)
    .replace('__DEBUGGER_SUN_ICON__', JSON.stringify(SUN_ICON))
    .replace('__DEBUGGER_MOON_ICON__', JSON.stringify(MOON_ICON))
    .replace('__DEBUGGER_COPY_ICON__', JSON.stringify(COPY_ICON))
    .replace('__DEBUGGER_JSON_REGEX__', JSON.stringify(JSON_HIGHLIGHT_PATTERN))
    .replace('__DEBUGGER_SQL_REGEX__', JSON.stringify(SQL_HIGHLIGHT_PATTERN))
    .replace('__DEBUGGER_BASE_PATH_LABEL__', basePath)
    .replace('__DEBUGGER_BASE_PATH_JSON__', JSON.stringify(basePath));
};

export { buildDashboardHtml };
