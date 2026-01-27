/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-restricted-imports */
/* eslint-disable no-undef */
/**
 * Worker UI Integration
 * Integrates new WorkerCard components with existing main.js
 */

// Import the new components
import { WorkerCard } from '../components/WorkerCard.js';
import { WorkerExpandPanel } from '../components/WorkerExpandPanel.js';

/**
 * Enhanced worker rendering using new components
 */
function renderWorkersEnhanced(data) {
  const tbody = document.getElementById('workers-tbody');
  if (!tbody) return;

  // Clear existing content safely
  while (tbody.firstChild) {
    tbody.firstChild.remove();
  }

  if (!data.workers || data.workers.length === 0) {
    const noWorkersRow = document.createElement('tr');
    const noWorkersCell = document.createElement('td');
    noWorkersCell.colSpan = '7';
    noWorkersCell.className = 'text-center p-4';
    noWorkersCell.textContent = 'No workers found';
    noWorkersRow.appendChild(noWorkersCell);
    tbody.appendChild(noWorkersRow);

    updateQueueSummary(data.queueData);
    updateDriverFilter(data.drivers);
    updateDriversList(data.drivers);
    updatePagination(data.pagination);
    return;
  }

  // Create a container for our new worker cards
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'workers-cards-container';
  cardsContainer.style.cssText = `
    display: grid;
    gap: 16px;
    padding: 16px;
  `;

  data.workers.forEach((worker) => {
    // Create a table row that contains the worker card
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = '7';
    cell.style.padding = '0';

    // Create worker card container
    const cardContainer = document.createElement('div');
    cardContainer.className = 'worker-card-wrapper';

    // Ensure worker has an ID for the expand functionality
    if (!worker.id) {
      worker.id = worker.name.replaceAll(/[^a-z0-9]/gi, '-');
    }

    // Initialize the new WorkerCard component
    WorkerCard.create(worker, cardContainer);

    cell.appendChild(cardContainer);
    row.appendChild(cell);
    tbody.appendChild(row);

    // Create expandable detail row for this worker
    const detailsId = `details-${worker.id}`;
    const detailRow = createDetailRowEnhanced(worker, detailsId);
    tbody.appendChild(detailRow);

    // Connect the WorkerCard expand button to the table row toggle
    // Use a more reliable approach without setTimeout
    const observer = new MutationObserver(() => {
      const expandBtn = cardContainer.querySelector('.expand-btn');
      if (expandBtn && !expandBtn.hasAttribute('data-connected')) {
        expandBtn.setAttribute('data-connected', 'true');
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Toggle the detail row instead of internal expand
          globalThis.window.toggleDetails(detailsId);
        });
        observer.disconnect(); // Clean up observer
      }
    });

    observer.observe(cardContainer, { childList: true, subtree: true });

    // Fallback: try immediately in case the button already exists
    const expandBtn = cardContainer.querySelector('.expand-btn');
    if (expandBtn && !expandBtn.hasAttribute('data-connected')) {
      expandBtn.setAttribute('data-connected', 'true');
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        globalThis.window.toggleDetails(detailsId);
      });
      observer.disconnect();
    }
  });

  updateQueueSummary(data.queueData);
  updateDriverFilter(data.drivers);
  updateDriversList(data.drivers);
  updatePagination(data.pagination);
}

/**
 * Enhanced detail row with new components
 */
function createDetailRowEnhanced(worker, detailsId) {
  const detailRow = document.createElement('tr');
  detailRow.id = `details-${detailsId}`;
  detailRow.className = 'expandable-row';
  detailRow.style.display = 'none';

  const detailCell = document.createElement('td');
  detailCell.colSpan = '7';
  detailCell.style.padding = '0';
  detailCell.style.backgroundColor = '#f8f9fa';

  // Create enhanced detail panel container
  const detailPanelContainer = document.createElement('div');
  detailPanelContainer.className = 'detail-panel-container';
  detailPanelContainer.style.cssText = `
    padding: 20px;
    min-height: 200px;
  `;

  // Initialize the new WorkerExpandPanel component
  WorkerExpandPanel.create(worker, detailPanelContainer);

  detailCell.appendChild(detailPanelContainer);
  detailRow.appendChild(detailCell);

  return detailRow;
}

/**
 * Enhanced worker row with new styling
 */
function createWorkerRowEnhanced(worker) {
  const row = document.createElement('tr');
  const detailsId = worker.name.replaceAll(/[^a-z0-9]/gi, '-');

  // Status cell with enhanced styling
  const statusCell = document.createElement('td');
  const statusBadge = document.createElement('span');
  statusBadge.className = `status-badge status-${worker.status}`;
  statusBadge.textContent = worker.status;
  statusBadge.style.cssText = `
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
  `;
  statusCell.appendChild(statusBadge);

  // Name cell
  const nameCell = document.createElement('td');
  nameCell.textContent = worker.name;
  nameCell.style.fontWeight = '500';

  // Queue cell
  const queueCell = document.createElement('td');
  queueCell.textContent = worker.queueName;

  // Driver cell
  const driverCell = document.createElement('td');
  driverCell.textContent = worker.driver;

  // Concurrency cell
  const concurrencyCell = document.createElement('td');
  concurrencyCell.textContent = worker.concurrency || 1;

  // Auto-start cell
  const autoStartCell = document.createElement('td');
  const autoStartBadge = document.createElement('span');
  autoStartBadge.className = `badge ${worker.autoStart ? 'badge-success' : 'badge-secondary'}`;
  autoStartBadge.textContent = worker.autoStart ? 'Yes' : 'No';
  autoStartBadge.style.cssText = `
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
  `;
  autoStartCell.appendChild(autoStartBadge);

  // Actions cell with expand button
  const actionsCell = document.createElement('td');
  const expandBtn = document.createElement('button');
  expandBtn.className = 'btn btn-sm btn-outline-primary expand-btn';
  expandBtn.style.cssText = `
    padding: 4px 8px;
    font-size: 12px;
  `;

  // Create icon element safely instead of using innerHTML
  const icon = document.createElement('i');
  icon.className = 'fas fa-chevron-down';
  expandBtn.appendChild(icon);

  expandBtn.addEventListener('click', () => toggleWorkerDetails(detailsId));
  actionsCell.appendChild(expandBtn);

  row.appendChild(statusCell);
  row.appendChild(nameCell);
  row.appendChild(queueCell);
  row.appendChild(driverCell);
  row.appendChild(concurrencyCell);
  row.appendChild(autoStartCell);
  row.appendChild(actionsCell);

  return { row, detailsId };
}

/**
 * Toggle worker details with enhanced animation
 */
function toggleWorkerDetails(detailsId) {
  const detailRow = document.getElementById(`details-${detailsId}`);
  if (!detailRow) return;

  const expandBtn =
    document.querySelector(`[onclick*="${detailsId}"]`) || document.querySelector(`.expand-btn`);

  if (detailRow.style.display === 'none') {
    detailRow.style.display = 'table-row';
    detailRow.classList.add('open');
    if (expandBtn) {
      // Clear existing content safely and add chevron-up icon
      expandBtn.textContent = '';
      const upIcon = document.createElement('i');
      upIcon.className = 'fas fa-chevron-up';
      expandBtn.appendChild(upIcon);
    }
  } else {
    detailRow.style.display = 'none';
    detailRow.classList.remove('open');
    if (expandBtn) {
      // Clear existing content safely and add chevron-down icon
      expandBtn.textContent = '';
      const downIcon = document.createElement('i');
      downIcon.className = 'fas fa-chevron-down';
      expandBtn.appendChild(downIcon);
    }
  }
}

/**
 * Get worker card styles
 */
function getWorkerCardStyles() {
  return `
    .worker-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 8px;
      background: white;
      transition: all 0.2s ease;
    }

    .worker-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .worker-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      cursor: pointer;
    }

    .worker-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .worker-name {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .worker-status {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .status-running { background: #d1fae5; color: #065f46; }
    .status-stopped { background: #fee2e2; color: #991b1b; }
    .status-failed { background: #fef2f2; color: #7f1d1d; }
    .status-paused { background: #fef3c7; color: #92400e; }
  `;
}

/**
 * Get worker actions and expand panel styles
 */
function getWorkerActionsStyles() {
  return `
    .worker-actions {
      display: flex;
      gap: 8px;
    }

    .expand-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      transition: transform 0.2s ease;
    }

    .expand-btn:hover {
      background: #f3f4f6;
    }

    .expand-btn.expanded {
      transform: rotate(180deg);
    }

    .worker-expand-panel {
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      padding: 16px;
    }

    .config-summary,
    .worker-metrics {
      margin-bottom: 16px;
    }

    .config-grid,
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 8px;
    }

    .config-item,
    .metric-item {
      display: flex;
      justify-content: space-between;
      padding: 8px;
      background: white;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }

    .config-label,
    .metric-label {
      font-weight: 500;
      color: #374151;
    }

    .config-value,
    .metric-value {
      color: #6b7280;
    }
  `;
}

/**
 * Get modal styles for JSON viewer/editor
 */
function getModalStyles() {
  return `
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: white;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      max-width: 90vw;
      max-height: 90vh;
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .modal-body {
      padding: 16px;
      overflow-y: auto;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid #e5e7eb;
    }

    .json-viewer-modal,
    .json-editor-modal {
      font-family: Monaco, Menlo, 'Ubuntu Mono', monospace;
    }
  `;
}

/**
 * Get JSON syntax highlighting styles
 */
function getJsonHighlightStyles() {
  return `
    .json-string { color: #0d9488; }
    .json-number { color: #2563eb; }
    .json-boolean { color: #dc2626; }
    .json-null { color: #6b7280; }
    .json-key { color: #7c3aed; }

    mark {
      background: #fef3c7;
      padding: 1px 2px;
      border-radius: 2px;
    }
  `;
}

/**
 * Get button and notification styles
 */
function getButtonAndNotificationStyles() {
  return `
    .btn {
      padding: 8px 16px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .btn:hover {
      background: #f9fafb;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .btn-primary:hover {
      background: #2563eb;
    }

    .btn-secondary {
      background: #6b7280;
      color: white;
      border-color: #6b7280;
    }

    .btn-secondary:hover {
      background: #4b5563;
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: 12px;
    }

    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 2000;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
}

/**
 * Add CSS styles for the enhanced components
 */
function addEnhancedStyles() {
  const styleId = 'worker-ui-enhanced-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = [
    getWorkerCardStyles(),
    getWorkerActionsStyles(),
    getModalStyles(),
    getJsonHighlightStyles(),
    getButtonAndNotificationStyles(),
  ].join('\n');

  document.head.appendChild(style);
}

/**
 * Initialize the enhanced UI
 */
function initializeEnhancedUI() {
  // Add enhanced styles
  addEnhancedStyles();

  // Override the createDetailRow function
  globalThis.window.createDetailRow = createDetailRowEnhanced;

  // Override the createWorkerRow function
  globalThis.window.createWorkerRow = createWorkerRowEnhanced;

  // Make renderWorkersEnhanced globally available
  globalThis.window.renderWorkersEnhanced = renderWorkersEnhanced;

  console.log('Enhanced Worker UI initialized');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEnhancedUI);
} else {
  initializeEnhancedUI();
}

// Export for manual initialization
export { initializeEnhancedUI, renderWorkersEnhanced };
