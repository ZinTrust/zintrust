/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Worker Expand Panel Component
 * Displays detailed worker information with View JSON and Edit buttons
 */

/**
 * Create configuration summary element
 * @param {Object} worker - Worker data
 * @returns {HTMLDivElement} Configuration summary element
 */
const createConfigSummaryElement = (worker) => {
  const configSummary = document.createElement('div');
  configSummary.className = 'config-summary';

  const title = document.createElement('h4');
  title.textContent = 'Configuration';
  configSummary.appendChild(title);

  const configGrid = document.createElement('div');
  configGrid.className = 'config-grid';

  const configItems = [
    { label: 'Driver:', value: worker.driver },
    { label: 'Concurrency:', value: worker.concurrency },
    { label: 'Auto Start:', value: worker.autoStart ? 'Yes' : 'No' },
    { label: 'Version:', value: worker.version || 'N/A' },
    { label: 'Region:', value: worker.region || 'N/A' },
    { label: 'Created:', value: new Date(worker.createdAt).toLocaleString() },
  ];

  configItems.forEach((item) => {
    const configItem = document.createElement('div');
    configItem.className = 'config-item';

    const label = document.createElement('label');
    label.textContent = item.label;

    const span = document.createElement('span');
    span.textContent = item.value;

    configItem.appendChild(label);
    configItem.appendChild(span);
    configGrid.appendChild(configItem);
  });

  configSummary.appendChild(configGrid);
  return configSummary;
};

/**
 * Create action buttons section
 * @returns {HTMLDivElement} Action buttons element
 */
const createActionButtonsSection = () => {
  const actionsSection = document.createElement('div');
  actionsSection.className = 'worker-actions-section';

  const viewJsonBtn = document.createElement('button');
  viewJsonBtn.className = 'btn btn-secondary view-json-btn';
  viewJsonBtn.textContent = 'View JSON';

  const editJsonBtn = document.createElement('button');
  editJsonBtn.className = 'btn btn-primary edit-json-btn';
  editJsonBtn.textContent = 'Edit';

  actionsSection.appendChild(viewJsonBtn);
  actionsSection.appendChild(editJsonBtn);

  return actionsSection;
};

/**
 * Create panel element
 * @param {Object} worker - Worker data
 * @returns {HTMLDivElement} Panel element
 */
const createPanelElement = (worker) => {
  const panelElement = document.createElement('div');
  panelElement.className = 'worker-expand-panel';

  const detailsSection = document.createElement('div');
  detailsSection.className = 'worker-details';

  const configSummary = createConfigSummaryElement(worker);

  const actionsSection = createActionButtonsSection();

  detailsSection.appendChild(configSummary);
  detailsSection.appendChild(actionsSection);
  panelElement.appendChild(detailsSection);

  const metricsSection = document.createElement('div');
  metricsSection.className = 'worker-metrics';
  metricsSection.innerHTML = `
    <h4>Performance Metrics</h4>
    <div class="metrics-grid">
      <div class="metric-item">
        <label>Status:</label>
        <span class="status-indicator status-${worker.status}">${worker.status}</span>
      </div>
      <div class="metric-item">
        <label>Connection:</label>
        <span class="connection-indicator">${worker.connectionState || 'Unknown'}</span>
      </div>
      <div class="metric-item">
        <label>Last Health Check:</label>
        <span>${worker.lastHealthCheck ? new Date(worker.lastHealthCheck).toLocaleString() : 'Never'}</span>
      </div>
      ${
        worker.lastError
          ? `
      <div class="metric-item">
        <label>Last Error:</label>
        <span class="error-message">${worker.lastError}</span>
      </div>
      `
          : ''
      }
    </div>
  `;
  panelElement.appendChild(metricsSection);

  return panelElement;
};

/**
 * Show notification message with proper timeout cleanup
 * @param {string} message - Notification message
 * @param {string} type - Notification type
 * @returns {number} Timeout reference for cleanup
 */
const showNotification = (message, type = 'info') => {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  const timeoutId = setTimeout(() => {
    notification.remove();
    activeTimeouts.delete(timeoutId); // Clean up from global registry
  }, 3000);

  activeTimeouts.add(timeoutId); // Track timeout for cleanup
  return timeoutId;
};

/**
 * Create JSON viewer handler
 * @param {Object} worker - Worker data
 * @returns {Function} View JSON handler
 */
const createViewJsonHandler = (worker) => {
  let jsonViewer = null;

  return () => {
    if (!jsonViewer) {
      jsonViewer = JsonViewer.create();
    }
    jsonViewer.open(worker);
  };
};

/**
 * Create JSON editor handler
 * @param {Object} worker - Worker data
 * @param {Function} render - Render function
 * @returns {Function} Edit JSON handler
 */
const createEditJsonHandler = (worker, render) => {
  let jsonEditor = null;

  return async () => {
    if (!jsonEditor) {
      jsonEditor = JsonEditor.create({
        onSave: async (updatedWorker) => {
          try {
            const response = await workerApi.updateWorker(worker.id, updatedWorker);

            if (response.success) {
              Object.assign(worker, response.data);
              render();
              showNotification('Worker updated successfully', 'success');
            } else {
              showNotification(response.error || 'Failed to update worker', 'error');
            }
          } catch (error) {
            showNotification('Error updating worker: ' + error.message, 'error');
          }
        },
      });
    }
    jsonEditor.open(worker);
  };
};

/**
 * Create a worker expand panel
 */
const createWorkerExpandPanel = (worker, container) => {
  let element;
  const jsonViewer = null;
  const jsonEditor = null;

  const render = () => {
    if (element) {
      element.remove();
    }
    element = createPanelElement(worker);
    container.appendChild(element);

    // Create and attach event listeners after element is created
    const handleViewJson = createViewJsonHandler(worker);
    const handleEditJson = createEditJsonHandler(worker, render);

    // Search within the current panel element, not the entire document
    const viewJsonBtn = element?.querySelector('.view-json-btn');
    const editJsonBtn = element?.querySelector('.edit-json-btn');

    if (viewJsonBtn) {
      viewJsonBtn.addEventListener('click', handleViewJson);
    }
    if (editJsonBtn) {
      editJsonBtn.addEventListener('click', handleEditJson);
    }
  };

  const destroy = () => {
    if (jsonViewer) {
      jsonViewer.destroy();
    }
    if (jsonEditor) {
      jsonEditor.destroy();
    }
    element.remove();
  };

  // Initialize
  render();

  return {
    element,
    worker,
    render,
    destroy,
  };
};

/**
 * Sealed namespace for WorkerExpandPanel utilities
 */
export const WorkerExpandPanel = Object.freeze({
  create: createWorkerExpandPanel,
});
