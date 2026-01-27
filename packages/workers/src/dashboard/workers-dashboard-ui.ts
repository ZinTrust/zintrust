export type { WorkersDashboardUiOptions } from './types';

const getRootVariables = (): string => `
:root {
  --bg: #0b1220;
  --card: #0f172a;
  --border: #1e293b;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #38bdf8;
  --accent-hover: #0ea5e9;

  /* Modern Utilities */
  --surface-hover: #1e293b;
  --surface-active: #334155;
  --input-bg: #0f172a;

  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);

  /* Brand Colors */
  --primary: #0ea5e9;
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;
}

html[data-theme='light'] {
  --bg: #f1f5f9;
  --card: #ffffff;
  --border: #e2e8f0;
  --text: #334155;
  --muted: #64748b;

  --surface-hover: #f8fafc;
  --surface-active: #e2e8f0;
  --input-bg: #ffffff;

  --shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.02);
}`;

const getResetAndBaseStyles = (): string => `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
  -webkit-font-smoothing: antialiased;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 40px 24px;
}

/* Transitions */
.card,
.header,
.table-container,
.btn,
.action-btn,
input,
select {
  transition: all 0.2s ease-in-out;
}`;

const getHeaderStyles = (): string => `
/* Header Styles */
.header {
  background: var(--card);
  padding: 24px 32px;
  border: 1px solid var(--border);
  border-radius: 16px;
  margin-bottom: 32px;
  box-shadow: var(--shadow);
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--text);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* Navigation Bar */
.nav-bar {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 24px;
}

.nav-links {
  display: flex;
  gap: 32px;
  align-items: center;
}

.nav-link {
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.2s ease;
  position: relative;
}

.nav-link:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.nav-link.active {
  color: var(--primary);
  background: rgba(14, 165, 233, 0.1);
}

.nav-link.active::after {
  content: '';
  position: absolute;
  bottom: -25px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 3px;
  background: var(--primary);
  border-radius: 2px;
}
`;

const getButtonsAndInputsStyles = (): string => `
/* Buttons & Inputs */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  box-shadow: var(--shadow-sm);
  height: 40px;
}

.btn:hover {
  background: var(--surface-hover);
  transform: translateY(-1px);
  border-color: var(--muted);
}

.btn-primary {
  background: var(--primary);
  color: white;
  border: 1px solid var(--primary);
}

.btn-primary:hover {
  background: #0284c7; /* Darker blue */
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
  color: white;
}

.theme-toggle {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
}

.theme-toggle:hover {
  background: var(--surface-hover);
}`;

const getFilterStyles = (): string => `
/* Filters */
.filters-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-group select,
.filter-group input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: var(--input-bg);
  color: var(--text);
  min-width: 140px;
  height: 38px;
}

.filter-group select:focus,
.filter-group input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.1);
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 280px;
}

.search-box .search-icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--muted);
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  pointer-events: none;
}

.search-box input {
  width: 100%;
  height: 40px;
  padding: 8px 12px 8px 36px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 14px;
  transition: all 0.2s ease;
}

.search-box input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.1);
}
`;

const getSummaryStyles = (): string => `
/* Summary Bar */
.summary-bar {
  margin: 16px 0 0;
  padding: 16px 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  align-items: center;
  box-shadow: var(--shadow-sm);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.summary-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  font-weight: 600;
}

.summary-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.drivers-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.driver-chip {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface-hover);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 9999px;
}
`;

const getTableStyles = (): string => `
/* Table Container */
.table-container {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

th {
  background: var(--surface-hover);
  padding: 16px 24px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

td {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  vertical-align: middle;
}

tbody tr {
  transition: background-color 0.15s ease;
}

tbody tr:hover {
  background: var(--surface-hover);
}

tbody tr:last-child td {
  border-bottom: none;
}

/* Worker Identity */
.worker-name {
  font-weight: 600;
  color: var(--text);
  font-size: 15px;
  margin-bottom: 4px;
}

.worker-queue {
  font-size: 12px;
  color: var(--muted);
  font-family: monospace;
  background: var(--surface-active);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
}`;

const getStatusBadgeStyles = (): string => `
/* Typography & Badges */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 9999px; /* Pill shape */
  font-size: 12px;
  font-weight: 600;
  width: fit-content;
}

.status-running {
  background: rgba(34, 197, 94, 0.1);
  color: var(--success);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.status-stopped {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.status-error {
  background: rgba(245, 158, 11, 0.1);
  color: var(--warning);
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
}

.status-running .status-dot {
  background: var(--success);
}
.status-stopped .status-dot {
  background: var(--danger);
}
.status-error .status-dot {
  background: var(--warning);
}

.health-indicator {
  display: flex;
  align-items: center;
}

.health-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.health-healthy { background: var(--success); }
.health-unhealthy { background: var(--danger); }
.health-degraded { background: var(--warning); }
.health-warning { background: var(--warning); }
.health-unknown { background: var(--muted); }

/* Driver & Version */
.driver-badge {
  background: var(--surface-hover);
  color: var(--text);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border);
}

.version-badge {
  font-family: monospace;
  color: var(--muted);
  font-size: 12px;
}`;

const getPerformanceIconsStyles = (): string => `
/* Performance Icons */
.performance-icons {
  display: flex;
  gap: 16px;
}

.perf-icon {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.perf-icon svg {
  width: 16px;
  height: 16px;
  stroke-width: 2.5;
}

.perf-icon.processed {
  color: var(--success);
}
.perf-icon.time {
  color: var(--primary);
}
.perf-icon.memory {
  color: #8b5cf6;
}
`;

const getActionButtonsStyles = (): string => `
/* Action Buttons with SVGs */
.actions-cell {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--muted);
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
  border-color: var(--muted);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.action-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
`;

const getActionButtonHoverStyles = (): string => `
/* Specific Action Colors On Hover */
.action-btn.start:hover {
  color: var(--success);
  border-color: var(--success);
  background: rgba(34, 197, 94, 0.1);
}
.action-btn.stop:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}
.action-btn.restart:hover {
  color: var(--warning);
  border-color: var(--warning);
  background: rgba(245, 158, 11, 0.1);
}
.action-btn.debug:hover {
  color: var(--info);
  border-color: var(--info);
  background: rgba(59, 130, 246, 0.1);
}
.action-btn.delete:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}
`;

const getPerformanceAndActionStyles = (): string => `
${getPerformanceIconsStyles()}
${getActionButtonsStyles()}
${getActionButtonHoverStyles()}
`;

const getExpandedRowStyles = (): string => `
/* Expandable Rows */
.expandable-row {
  display: none;
}

.expandable-row.open {
  display: table-row;
}

.expander {
  cursor: pointer;
}

.details-content {
  padding: 32px;
  background: var(--surface-hover);
  border-top: 1px solid var(--border);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.detail-section {
  background: var(--card);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.detail-section h4 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-item span:first-child {
  color: var(--muted);
  font-weight: 500;
}

.detail-item span:last-child {
  color: var(--text);
  font-weight: 600;
}
`;

const getLogoAndIconStyles = (): string => `
/* Logo */
.logo-frame {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    rgba(14, 165, 233, 0.1) 0%,
    rgba(56, 189, 248, 0.2) 100%
  );
  border: 1px solid rgba(14, 165, 233, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-img {
  width: 26px;
  height: 26px;
  display: block;
}

.logo {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid rgba(14, 165, 233, 0.35);
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.25), rgba(2, 132, 199, 0.12));
}

/* Icons Generic */
.icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}`;

const getPageSizeSelectorStyles = (): string => `
/* Page Size Selector */
.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.page-size-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
  padding-left: 16px;
  border-left: 1px solid var(--border);
}

.page-size-selector label {
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.page-size-selector select {
  padding: 0 32px 0 12px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background-color: var(--card);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 16px;
  transition: all 0.2s;
}

.page-size-selector select:hover {
  background-color: var(--surface-hover);
  border-color: var(--muted);
}

.page-size-selector select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
}
`;

const getPaginationStyles = (): string => `
/* Pagination */
.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
}

.page-btn {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  color: var(--muted);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.page-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
  border-color: var(--border);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.page-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
  box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.3);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--bg);
}

.page-btn svg {
  width: 18px;
  height: 18px;
  stroke-width: 2px;
}

${getPageSizeSelectorStyles()}
`;

const getToggleStartStyles = (): string => `
/* Toggle Switch */
.auto-start-toggle,
.auto-switch-toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.auto-start-toggle input,
.auto-switch-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--surface-active);
  border: 1px solid var(--border);
  transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 34px;
}

.toggle-slider:before {
  position: absolute;
  content: '';
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--muted);
  transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

input:checked + .toggle-slider {
  background-color: rgba(14, 165, 233, 0.15); /* Primary transparent */
  border-color: var(--primary);
}

input:checked + .toggle-slider:before {
  transform: translateX(20px);
  background-color: var(--primary);
}

/* Hover generic for toggles */
.auto-start-toggle:hover .toggle-slider,
.auto-switch-toggle:hover .toggle-slider {
  border-color: var(--muted);
}`;

const getTabletResponsiveStyles = (): string => `
/* Responsive Design - Tablet */
@media (max-width: 1024px) {
  .filters-bar {
    gap: 12px;
  }

  .search-input {
    width: 200px;
  }

  .header-top {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
`;

const getMobileResponsiveStyles = (): string => `
/* Responsive Design - Mobile */
@media (max-width: 768px) {
  .container {
    padding: 20px 16px;
  }

  .header {
    padding: 20px;
    margin-bottom: 24px;
  }

  .filters-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-group {
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
  }

  .filter-group select,
  .filter-group input {
    width: 100%;
  }

  .search-input {
    width: 100%;
  }

  .table-container {
    border-radius: 12px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  table {
    min-width: 800px; /* Force scroll */
  }

  .pagination {
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }

  .pagination-controls {
    justify-content: center;
  }

  .page-size-selector {
    margin-left: 0;
    padding-left: 0;
    border-left: none;
    width: 100%;
    justify-content: center;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
}
`;

const getMobileColumnHideStyles = (): string => `
/* Hide/Show columns for mobile */
@media (max-width: 768px) {
  .hide-mobile {
    display: none;
  }
}

@media (max-width: 576px) {
  .hide-small {
    display: none;
  }
}
`;

const getTableScrollHintStyles = (): string => `
/* Mobile table scroll hint */
@media (max-width: 992px) {
  .table-wrapper {
    position: relative;
  }
  .table-wrapper::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 20px;
    height: 100%;
    background: linear-gradient(to right, transparent, var(--card));
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s;
  }
  .table-wrapper:hover::after {
    opacity: 1;
  }
}
`;

const getResponsiveStyles = (): string => `
${getTabletResponsiveStyles()}
${getMobileResponsiveStyles()}
${getMobileColumnHideStyles()}
${getTableScrollHintStyles()}
`;

const getWorkersDashboardStyles = (): string =>
  [
    getRootVariables(),
    getResetAndBaseStyles(),
    getHeaderStyles(),
    getButtonsAndInputsStyles(),
    getFilterStyles(),
    getSummaryStyles(),
    getTableStyles(),
    getStatusBadgeStyles(),
    getPerformanceAndActionStyles(),
    getExpandedRowStyles(),
    getLogoAndIconStyles(),
    getPaginationStyles(),
    getToggleStartStyles(),
    getResponsiveStyles(),
  ].join('\n');

export { getWorkersDashboardStyles };
