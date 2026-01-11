/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
(() => {
  const storageKey = 'zintrust.theme';

  const prefersDark = () => {
    try {
      if (typeof globalThis === 'undefined') return false;
      const anyGlobal = globalThis;
      if (typeof anyGlobal.matchMedia !== 'function') return false;
      return anyGlobal.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  };

  const getSaved = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const setSaved = (value) => {
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // ignore
    }
  };

  const apply = (mode) => {
    const html = document.documentElement;
    const isDark = mode === 'dark';
    html.classList.toggle('dark', isDark);

    const checkbox = document.getElementById('toggle-theme-checkbox');
    if (checkbox && checkbox instanceof HTMLInputElement) {
      checkbox.checked = isDark;
    }
  };

  const createEl = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === 'string') el.textContent = text;
    return el;
  };

  const safeJsonParse = (text) => {
    try {
      if (typeof text !== 'string') return undefined;
      const trimmed = text.trim();
      if (trimmed === '') return undefined;
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  };

  const copyText = async (text) => {
    try {
      if (!text) return;
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const replacePanelWithDiv = (panelEl, contentEl, extraClass) => {
    if (!(panelEl instanceof HTMLElement)) return undefined;
    const div = document.createElement('div');

    // Preserve tab panel wiring.
    div.id = panelEl.id;
    div.className = `${panelEl.className} ${extraClass || ''}`.trim();
    div.hidden = panelEl.hidden;

    // Preserve attributes used by tabs + a11y.
    const role = panelEl.getAttribute('role');
    if (role) div.setAttribute('role', role);
    const labelledBy = panelEl.getAttribute('aria-labelledby');
    if (labelledBy) div.setAttribute('aria-labelledby', labelledBy);
    if (panelEl.dataset && panelEl.dataset.panel) div.dataset.panel = panelEl.dataset.panel;

    div.appendChild(contentEl);
    panelEl.replaceWith(div);
    return div;
  };

  const shortPath = (filePath) => {
    if (typeof filePath !== 'string') return '';
    if (filePath.startsWith('node:')) return filePath;
    const normalized = filePath.replaceAll('\\', '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 3) return normalized;
    return `…/${parts.slice(-3).join('/')}`;
  };

  const parseStackFrames = (stackText) => {
    const trimmed = typeof stackText === 'string' ? stackText.trim() : '';
    if (!trimmed) return undefined;

    const lines = trimmed.split('\n').map((l) => l.trimEnd());
    const header = lines[0] || 'Error';
    const frameLines = lines.slice(1).filter((l) => l.trim() !== '');

    const parseLocation = (location) => {
      if (typeof location !== 'string') return undefined;
      const loc = location.trim();
      if (!loc) return undefined;

      const lastColon = loc.lastIndexOf(':');
      if (lastColon === -1) return undefined;

      const colPart = loc.slice(lastColon + 1);
      if (!/^\d+$/.test(colPart)) return undefined;

      const secondLastColon = loc.lastIndexOf(':', lastColon - 1);
      if (secondLastColon === -1) return undefined;

      const linePart = loc.slice(secondLastColon + 1, lastColon);
      if (!/^\d+$/.test(linePart)) return undefined;

      const file = loc.slice(0, secondLastColon);
      if (!file) return undefined;

      return { file, lineNo: linePart, colNo: colPart };
    };

    const parseV8Frame = (stackLine) => {
      const trimmedLine = stackLine.trim();
      if (!trimmedLine.startsWith('at ')) return undefined;

      const afterAt = trimmedLine.slice(3).trim();

      let fn = '';
      let location = afterAt;

      // Typical V8 format: "at fn (file:line:col)" or "at file:line:col"
      if (afterAt.endsWith(')')) {
        const openIdx = afterAt.lastIndexOf(' (');
        if (openIdx !== -1) {
          fn = afterAt.slice(0, openIdx).trim();
          location = afterAt.slice(openIdx + 2, -1).trim();
        }
      }

      const loc = parseLocation(location);
      if (!loc) return undefined;

      return { fn, ...loc };
    };

    const frames = frameLines.map((rawLine) => {
      const line = rawLine.trim();
      const parsed = parseV8Frame(line);

      if (!parsed) {
        return { raw: line };
      }

      return {
        raw: line,
        fn: parsed.fn || '',
        file: parsed.file || '',
        lineNo: parsed.lineNo || '',
        colNo: parsed.colNo || '',
      };
    });

    return { header, frames };
  };

  const buildStackView = (parsed) => {
    const root = createEl('div', 'stack-view');

    const headerRow = createEl('div', 'stack-header');
    const headerText = createEl('div', 'stack-error');
    headerText.textContent = parsed.header;

    const controls = createEl('div', 'stack-controls');
    const expandBtn = createEl('button', 'mini-btn', 'Expand all');
    expandBtn.type = 'button';
    const collapseBtn = createEl('button', 'mini-btn', 'Collapse all');
    collapseBtn.type = 'button';
    const copyBtn = createEl('button', 'mini-btn', 'Copy');
    copyBtn.type = 'button';

    controls.append(expandBtn, collapseBtn, copyBtn);
    headerRow.append(headerText, controls);
    root.appendChild(headerRow);

    const list = createEl('div', 'stack-list');

    const detailsEls = [];
    parsed.frames.forEach((frame, idx) => {
      const details = document.createElement('details');
      details.className = 'stack-frame';
      if (idx < 2) details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'stack-summary';

      const left = createEl('div', 'stack-left');
      const fnEl = createEl('span', 'stack-fn', frame.fn || '(anonymous)');
      left.appendChild(fnEl);

      const right = createEl('div', 'stack-right');
      const fileText = frame.file ? shortPath(frame.file) : frame.raw;
      const fileEl = createEl('span', 'stack-file', fileText);
      if (frame.file) fileEl.title = frame.file;
      const loc = frame.lineNo ? `${frame.lineNo}:${frame.colNo || ''}`.replace(/:$/, '') : '';
      const locEl = createEl('span', 'stack-loc', loc);

      right.appendChild(fileEl);
      if (loc) right.appendChild(locEl);

      summary.append(left, right);
      details.appendChild(summary);

      const raw = createEl('pre', 'stack-rawline');
      raw.textContent = frame.raw;
      details.appendChild(raw);

      detailsEls.push(details);
      list.appendChild(details);
    });

    expandBtn.addEventListener('click', () => {
      detailsEls.forEach((d) => {
        d.open = true;
      });
    });

    collapseBtn.addEventListener('click', () => {
      detailsEls.forEach((d) => {
        d.open = false;
      });
    });

    copyBtn.addEventListener('click', () => {
      copyText(`${parsed.header}\n${parsed.frames.map((f) => f.raw).join('\n')}`);
    });

    root.appendChild(list);
    return root;
  };

  const buildRequestView = (requestObj) => {
    const root = createEl('div', 'request-view');

    const top = createEl('div', 'request-top');
    const left = createEl('div', 'request-top-left');
    const right = createEl('div', 'request-top-right');

    const method = createEl('span', 'badge badge-method', String(requestObj.method || ''));
    const path = createEl('span', 'badge badge-path', String(requestObj.path || ''));

    left.append(method, path);

    const copyBtn = createEl('button', 'mini-btn', 'Copy JSON');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      copyText(JSON.stringify(requestObj, null, 2));
    });
    right.appendChild(copyBtn);
    top.append(left, right);
    root.appendChild(top);

    const section = (title, bodyEl) => {
      const wrap = createEl('div', 'request-section');
      const h = createEl('div', 'request-section-title', title);
      wrap.appendChild(h);
      wrap.appendChild(bodyEl);
      return wrap;
    };

    const kvList = (obj) => {
      const wrap = createEl('div', 'kv');
      const entries = obj && typeof obj === 'object' ? Object.entries(obj) : [];
      if (entries.length === 0) {
        wrap.appendChild(createEl('div', 'kv-empty', '—'));
        return wrap;
      }
      entries
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([k, v]) => {
          const row = createEl('div', 'kv-row');
          const key = createEl('div', 'kv-key', k);
          const val = createEl('div', 'kv-val');
          const asText = typeof v === 'string' ? v : JSON.stringify(v);
          val.textContent = asText;
          if (asText === '[redacted]') {
            val.classList.add('is-redacted');
          }
          row.append(key, val);
          wrap.appendChild(row);
        });
      return wrap;
    };

    root.appendChild(section('Headers', kvList(requestObj.headers)));
    root.appendChild(section('Query', kvList(requestObj.query)));
    return root;
  };

  const initPrettyFormatters = () => {
    // Stack Trace pretty
    const stackPretty = document.getElementById('stack-pretty');
    if (stackPretty instanceof HTMLElement) {
      const parsed = parseStackFrames(stackPretty.textContent || '');
      if (parsed && parsed.frames.length > 0) {
        const view = buildStackView(parsed);
        replacePanelWithDiv(stackPretty, view, 'pretty-panel');
      }
    }

    // Request pretty (prefer JSON from raw panel)
    const requestRaw = document.getElementById('request-raw');
    const requestPretty = document.getElementById('request-pretty');
    if (requestRaw instanceof HTMLElement && requestPretty instanceof HTMLElement) {
      const obj = safeJsonParse(requestRaw.textContent || '');
      if (obj && typeof obj === 'object') {
        const view = buildRequestView(obj);
        replacePanelWithDiv(requestPretty, view, 'pretty-panel');
      }
    }
  };

  const initTabset = (tabset) => {
    if (!(tabset instanceof HTMLElement)) return;

    const card = tabset.closest('.card');
    if (!(card instanceof HTMLElement)) return;

    const buttons = Array.from(tabset.querySelectorAll('button[data-tab]')).filter(
      (el) => el instanceof HTMLButtonElement
    );

    const panels = Array.from(card.querySelectorAll('[data-panel]')).filter(
      (el) => el instanceof HTMLElement
    );

    const setActive = (name) => {
      buttons.forEach((btn) => {
        const isActive = btn.dataset.tab === name;
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.tabIndex = isActive ? 0 : -1;
      });

      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== name;
      });
    };

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.tab;
        if (!name) return;
        setActive(name);
      });
    });

    setActive('pretty');
  };

  const initTabsets = () => {
    const tabsets = document.querySelectorAll('[data-tabset]');
    tabsets.forEach((tabset) => initTabset(tabset));
  };

  const initOptionalSections = () => {
    const optionalSections = document.querySelectorAll('[data-hide-when-empty]');
    optionalSections.forEach((section) => {
      if (!(section instanceof HTMLElement)) return;

      const selectorList = section.dataset.hideWhenEmpty;
      if (!selectorList) return;

      const selectors = selectorList
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const hasAnyContent = selectors.some((sel) => {
        const el = section.querySelector(sel);
        if (!(el instanceof HTMLElement)) return false;
        return (el.textContent || '').trim().length > 0;
      });

      if (!hasAnyContent) {
        section.hidden = true;
      }
    });
  };

  const init = () => {
    const saved = getSaved();
    if (saved === 'dark' || saved === 'light') {
      apply(saved);
    } else {
      apply(prefersDark() ? 'dark' : 'light');
    }

    const checkbox = document.getElementById('toggle-theme-checkbox');
    if (checkbox && checkbox instanceof HTMLInputElement) {
      checkbox.addEventListener('change', () => {
        const mode = checkbox.checked ? 'dark' : 'light';
        setSaved(mode);
        apply(mode);
      });
    }

    // Build “Pretty” views first, then wire tabs.
    initPrettyFormatters();

    initTabsets();
    initOptionalSections();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
