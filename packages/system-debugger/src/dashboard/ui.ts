/**
 * Debugger dashboard SPA — inline HTML served at basePath.
 * Full REST API registered under basePath/api/*.
 */
const DASHBOARD_DOCUMENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZinTrust Debugger</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
    header{background:#1e293b;padding:16px 24px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #334155}
    header h1{font-size:18px;font-weight:600;color:#f1f5f9}
    header .badge{font-size:11px;background:#0ea5e9;color:#fff;padding:2px 8px;border-radius:999px}
    #app{display:flex;height:calc(100vh - 57px)}
    nav{width:200px;background:#1e293b;border-right:1px solid #334155;padding:16px 0;flex-shrink:0}
    nav button{display:block;width:100%;text-align:left;padding:8px 20px;background:none;border:none;color:#94a3b8;cursor:pointer;font-size:13px;transition:color .15s,background .15s}
    nav button:hover,nav button.active{color:#f1f5f9;background:#0f172a}
    main{flex:1;overflow:auto;padding:24px}
    .toolbar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .toolbar input,.toolbar select{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:6px 10px;border-radius:6px;font-size:13px}
    .toolbar button{padding:6px 14px;border-radius:6px;border:none;cursor:pointer;font-size:13px}
    .btn-primary{background:#0ea5e9;color:#fff}
    .btn-danger{background:#ef4444;color:#fff}
    .btn-sm{padding:3px 8px;font-size:12px;border-radius:4px;border:none;cursor:pointer;background:#334155;color:#e2e8f0}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:8px 12px;background:#1e293b;color:#94a3b8;font-weight:500;border-bottom:1px solid #334155;position:sticky;top:0}
    td{padding:8px 12px;border-bottom:1px solid #1e293b;vertical-align:top;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    tr:hover td{background:#1e293b}
    .tag{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;margin:1px;background:#334155;color:#94a3b8}
    .tag.failed{background:#7f1d1d;color:#fca5a5}
    .tag.slow{background:#78350f;color:#fcd34d}
    .detail{background:#1e293b;border-radius:8px;padding:16px;overflow:auto}
    pre{white-space:pre-wrap;word-break:break-all;font-size:12px;color:#a5f3fc}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
    .pill-request{background:#1d4ed8;color:#bfdbfe}
    .pill-query{background:#166534;color:#bbf7d0}
    .pill-exception{background:#991b1b;color:#fecaca}
    .pill-log{background:#5b21b6;color:#ddd6fe}
    .pill-job,.pill-batch{background:#92400e;color:#fde68a}
    .pill-cache{background:#164e63;color:#a5f3fc}
    .pill-schedule,.pill-command{background:#1e3a5f;color:#bae6fd}
    .pill-mail,.pill-notification{background:#831843;color:#fbcfe8}
    .pill-auth{background:#1f2937;color:#d1d5db}
    .pill-event,.pill-model{background:#064e3b;color:#a7f3d0}
    .pill-redis{background:#7f1d1d;color:#fca5a5}
    .pill-gate{background:#312e81;color:#c7d2fe}
    .pill-middleware{background:#374151;color:#d1fae5}
    .pill-dump,.pill-view{background:#1c1917;color:#e7e5e4}
    .pill-client_request{background:#0c4a6e;color:#bae6fd}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px}
    .stat-card{background:#1e293b;border-radius:8px;padding:16px;border:1px solid #334155}
    .stat-card .label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    .stat-card .value{font-size:28px;font-weight:700;color:#f1f5f9}
    .pagination{display:flex;gap:6px;margin-top:12px;align-items:center;font-size:13px;color:#94a3b8}
    .pagination button{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:4px 10px;border-radius:4px;cursor:pointer}
    .pagination button:disabled{opacity:.4;cursor:default}
    .empty{color:#64748b;text-align:center;padding:48px;font-size:14px}
    .back{color:#0ea5e9;cursor:pointer;font-size:13px;margin-bottom:12px;display:inline-block}
    .back:hover{text-decoration:underline}
    #monitoring section{margin-bottom:24px}
    #monitoring h3{font-size:14px;color:#94a3b8;margin-bottom:8px}
    #monitoring .tag-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
    #monitoring .tag-item{background:#1e293b;border:1px solid #334155;border-radius:999px;padding:4px 12px;font-size:13px;display:flex;align-items:center;gap:6px}
    #monitoring .tag-item button{background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;line-height:1}
    #monitoring .add-form{display:flex;gap:6px}
    #monitoring .add-form input{flex:1}
  </style>
</head>
<body>
  <header>
    <h1>ZinTrust Debugger</h1>
    <span class="badge">Dev</span>
  </header>
  <div id="app">
    <nav id="nav">
      <button onclick="showPage('overview')" class="active" data-page="overview">Overview</button>
      <button onclick="showPage('entries')" data-page="entries">Entries</button>
      <button onclick="showPage('monitoring')" data-page="monitoring">Monitoring</button>
    </nav>
    <main id="main"></main>
  </div>
  <script>
  (function(){
    const BASE = '__DEBUGGER_BASE_PATH__';
    const API = BASE + '/api';
    let _page = 'overview';
    let _entriesPage = 1;
    let _entriesFilter = { type: '', tag: '', batchId: '' };
    let _detail = null;

    async function api(path, opts) {
      const r = await fetch(API + path, opts);
      if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || r.statusText); }
      return r.json();
    }

    function typeClass(t) { return 'pill pill-' + (t||'').replace('_','-'); }

    function timeSince(ms) {
      const s = Math.floor((Date.now() - ms) / 1000);
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s/60) + 'm ago';
      return Math.floor(s/3600) + 'h ago';
    }

    function tagsHtml(tags) {
      return (tags||[]).map(t => '<span class="tag' + (t==='failed'?' failed':t==='slow'?' slow':'') + '">' + t + '</span>').join('');
    }

    function showPage(p) {
      _page = p;
      _entriesPage = 1;
      _detail = null;
      document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.page === p));
      render();
    }

    async function render() {
      const m = document.getElementById('main');
      if (_page === 'overview') await renderOverview(m);
      else if (_page === 'entries') await renderEntries(m);
      else if (_page === 'monitoring') await renderMonitoring(m);
    }

    async function renderOverview(m) {
      m.innerHTML = '<div class="empty">Loading...</div>';
      try {
        const { stats } = await api('/stats');
        const total = Object.values(stats).reduce((a,b)=>a+b, 0);
        let cards = '<div class="stats-grid"><div class="stat-card"><div class="label">Total Entries</div><div class="value">' + total + '</div></div>';
        for (const [k,v] of Object.entries(stats)) {
          if (v > 0) cards += '<div class="stat-card"><div class="label">' + k + '</div><div class="value">' + v + '</div></div>';
        }
        cards += '</div>';
        cards += '<button class="btn-danger btn-sm" onclick="clearAll()">Clear all entries</button>';
        m.innerHTML = cards;
      } catch(e) { m.innerHTML = '<div class="empty">Error: ' + e.message + '</div>'; }
    }

    window.clearAll = async function() {
      if (!confirm('Delete all debugger entries?')) return;
      try { await api('/entries', { method: 'DELETE' }); render(); } catch(e) { alert(e.message); }
    };

    async function renderEntries(m) {
      if (_detail) { renderDetail(m); return; }
      m.innerHTML = '<div class="empty">Loading...</div>';
      try {
        const qs = new URLSearchParams({ page: _entriesPage, perPage: 50 });
        if (_entriesFilter.type) qs.set('type', _entriesFilter.type);
        if (_entriesFilter.tag) qs.set('tag', _entriesFilter.tag);
        if (_entriesFilter.batchId) qs.set('batchId', _entriesFilter.batchId);
        const { data, total, perPage } = await api('/entries?' + qs);
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        m.innerHTML = \`
          <div class="toolbar">
            <select id="f-type" onchange="applyFilter()">
              <option value="">All types</option>
              \${['request','query','exception','log','job','cache','schedule','mail','auth','event','model','notification','redis','gate','middleware','command','batch','dump','view','client_request'].map(t=>'<option value="'+t+'"'+((_entriesFilter.type===t)?' selected':'')+'>'+t+'</option>').join('')}
            </select>
            <input id="f-tag" placeholder="Tag filter" value="\${_entriesFilter.tag}" oninput="applyFilter()">
            <input id="f-batch" placeholder="Batch ID" value="\${_entriesFilter.batchId}" oninput="applyFilter()">
          </div>
          \${data.length === 0 ? '<div class="empty">No entries match the current filter.</div>' : \`
          <table>
            <thead><tr><th>Type</th><th>Summary</th><th>Tags</th><th>Batch</th><th>Time</th></tr></thead>
            <tbody>
            \${data.map(e => \`
              <tr style="cursor:pointer" onclick="showDetail('\${e.uuid}')">
                <td><span class="\${typeClass(e.type)}">\${e.type}</span></td>
                <td>\${entrySummary(e)}</td>
                <td>\${tagsHtml(e.tags)}</td>
                <td style="font-size:11px;color:#64748b">\${(e.batchId||'').slice(0,8)}</td>
                <td style="font-size:11px;color:#64748b">\${timeSince(e.createdAt)}</td>
              </tr>\`).join('')}
            </tbody>
          </table>
          <div class="pagination">
            <button \${_entriesPage<=1?'disabled':''} onclick="changePage(-1)">Prev</button>
            <span>Page \${_entriesPage} of \${totalPages} (\${total} total)</span>
            <button \${_entriesPage>=totalPages?'disabled':''} onclick="changePage(1)">Next</button>
          </div>\`}
        \`;
      } catch(e) { m.innerHTML = '<div class="empty">Error: ' + e.message + '</div>'; }
    }

    window.applyFilter = function() {
      _entriesFilter.type = document.getElementById('f-type')?.value || '';
      _entriesFilter.tag = document.getElementById('f-tag')?.value || '';
      _entriesFilter.batchId = document.getElementById('f-batch')?.value || '';
      _entriesPage = 1;
      renderEntries(document.getElementById('main'));
    };

    window.changePage = function(delta) {
      _entriesPage = Math.max(1, _entriesPage + delta);
      renderEntries(document.getElementById('main'));
    };

    window.showDetail = async function(uuid) {
      try {
        const { entry } = await api('/entries/' + uuid);
        _detail = entry;
        renderEntries(document.getElementById('main'));
      } catch(e) { alert(e.message); }
    };

    function renderDetail(m) {
      const e = _detail;
      m.innerHTML = \`
        <span class="back" onclick="closeDetail()">← Back to entries</span>
        <div class="detail">
          <p style="margin-bottom:8px"><span class="\${typeClass(e.type)}">\${e.type}</span> &nbsp; \${tagsHtml(e.tags)}</p>
          <p style="font-size:11px;color:#64748b;margin-bottom:12px">UUID: \${e.uuid} &nbsp;|&nbsp; Batch: \${e.batchId} &nbsp;|&nbsp; \${new Date(e.createdAt).toISOString()}</p>
          <pre>\${JSON.stringify(e.content, null, 2)}</pre>
        </div>
      \`;
    }

    window.closeDetail = function() { _detail = null; renderEntries(document.getElementById('main')); };

    function entrySummary(e) {
      const c = e.content || {};
      if (e.type === 'request') return (c.method||'')+ ' ' + (c.uri||'');
      if (e.type === 'query') return (c.sql||'').slice(0,80);
      if (e.type === 'exception') return (c.class||'') + ': ' + (c.message||'');
      if (e.type === 'log') return '['+c.level+'] ' + (c.message||'').slice(0,80);
      if (e.type === 'job') return (c.name||'') + ' — ' + (c.status||'');
      if (e.type === 'cache') return (c.operation||'') + ' ' + (c.key||'');
      if (e.type === 'schedule') return (c.name||'') + ' — ' + (c.status||'');
      if (e.type === 'mail') return 'To: ' + (c.to||'') + ' — ' + (c.subject||'');
      if (e.type === 'auth') return (c.event||'') + (c.userId ? ' #'+c.userId : '');
      if (e.type === 'event') return (c.name||'');
      if (e.type === 'model') return (c.action||'') + ' ' + (c.model||'');
      if (e.type === 'notification') return (c.notification||'') + ' → ' + (c.channels||[]).join(',');
      if (e.type === 'redis') return (c.command||'');
      if (e.type === 'gate') return (c.ability||'') + ' — ' + (c.result||'');
      if (e.type === 'middleware') return (c.name||'') + ' ' + (c.event||'');
      if (e.type === 'command') return (c.name||'') + ' exit=' + c.exitCode;
      if (e.type === 'batch') return (c.name||'') + ' processed ' + c.processed + '/' + c.total;
      if (e.type === 'view') return (c.template||'');
      if (e.type === 'client_request') return (c.method||'') + ' ' + (c.url||'');
      return JSON.stringify(c).slice(0,80);
    }

    async function renderMonitoring(m) {
      m.innerHTML = '<div class="empty">Loading...</div>';
      try {
        const { tags } = await api('/monitoring');
        m.innerHTML = \`
          <div id="monitoring">
            <section>
              <h3>Monitored tags</h3>
              <div class="tag-list">
                \${tags.length === 0 ? '<span style="color:#64748b;font-size:13px">No tags monitored yet.</span>' : tags.map(t => \`
                  <div class="tag-item">\${t} <button onclick="removeTag('\${t}')">×</button></div>
                \`).join('')}
              </div>
              <div class="add-form">
                <input type="text" id="new-tag" placeholder="Add tag (e.g. Auth:42)">
                <button class="btn-primary" onclick="addTag()">Add</button>
              </div>
            </section>
          </div>
        \`;
      } catch(e) { m.innerHTML = '<div class="empty">Error: ' + e.message + '</div>'; }
    }

    window.addTag = async function() {
      const tag = (document.getElementById('new-tag')?.value || '').trim();
      if (!tag) return;
      try { await api('/monitoring/' + encodeURIComponent(tag), { method: 'POST' }); renderMonitoring(document.getElementById('main')); }
      catch(e) { alert(e.message); }
    };

    window.removeTag = async function(tag) {
      try { await api('/monitoring/' + encodeURIComponent(tag), { method: 'DELETE' }); renderMonitoring(document.getElementById('main')); }
      catch(e) { alert(e.message); }
    };

    render();
  })();
  </script>
</body>
</html>`;

const buildDashboardHtml = (basePath: string): string => {
  return DASHBOARD_DOCUMENT.replace('__DEBUGGER_BASE_PATH__', basePath);
};

export { buildDashboardHtml };
