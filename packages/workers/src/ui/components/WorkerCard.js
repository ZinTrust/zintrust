/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-undef */
/**
 * Worker Card Component
 * Handles worker display with expand/collapse functionality
 */

/**
 * Create worker header element
 * @param {Object} worker - Worker data
 * @returns {HTMLDivElement} Header element
 */
const createWorkerHeader = (worker) => {
  const header = document.createElement('div');
  header.className = 'worker-header';

  const info = document.createElement('div');
  info.className = 'worker-info';

  const name = document.createElement('h3');
  name.className = 'worker-name';
  name.textContent = worker.name;

  const status = document.createElement('span');
  status.className = `worker-status status-${worker.status}`;
  status.textContent = worker.status;

  const queue = document.createElement('span');
  queue.className = 'worker-queue';
  queue.textContent = worker.queueName;

  info.appendChild(name);
  info.appendChild(status);
  info.appendChild(queue);

  const actions = document.createElement('div');
  actions.className = 'worker-actions';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'expand-btn';
  expandBtn.dataset.workerId = worker.id;

  const icon = document.createElement('i');
  icon.className = 'fas fa-chevron-down';
  expandBtn.appendChild(icon);

  actions.appendChild(expandBtn);
  header.appendChild(info);
  header.appendChild(actions);

  return header;
};

/**
 * Create worker expand content element
 * @param {Object} worker - Worker data
 * @returns {HTMLDivElement} Expand content element
 */
const createWorkerExpandContent = (worker) => {
  const expandContent = document.createElement('div');
  expandContent.className = 'worker-expand-content';
  expandContent.id = `expand-${worker.id}`;
  expandContent.style.display = 'none';
  return expandContent;
};

/**
 * Create worker card element
 * @param {Object} worker - Worker data
 * @returns {HTMLDivElement} Worker card element
 */
const createWorkerElement = (worker) => {
  const workerElement = document.createElement('div');
  workerElement.className = 'worker-card';

  const header = createWorkerHeader(worker);
  const expandContent = createWorkerExpandContent(worker);

  workerElement.appendChild(header);
  workerElement.appendChild(expandContent);

  return workerElement;
};

/**
 * Create event handlers for worker card
 * @param {Object} worker - Worker data
 * @param {Function} toggleExpand - Toggle expand function
 * @returns {Function} Event attachment function
 */
const createEventHandlers = (worker, toggleExpand) => {
  return () => {
    const expandBtn = document.querySelector(`[data-worker-id="${worker.id}"]`);

    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleExpand();
      });
    }
  };
};

/**
 * Create a worker card element with expand/collapse functionality
 */
const createWorkerCard = (worker, container) => {
  let isExpanded = false;
  let expandPanel = null;
  let element;

  const toggleExpand = () => {
    isExpanded = !isExpanded;
    const expandContent = element.querySelector('.worker-expand-content');
    const expandBtn = element.querySelector('.expand-btn i');

    if (isExpanded) {
      expandContent.style.display = 'block';
      expandBtn.className = 'fas fa-chevron-up';
      renderExpandPanel();
    } else {
      expandContent.style.display = 'none';
      expandBtn.className = 'fas fa-chevron-down';
    }
  };

  const renderExpandPanel = () => {
    const expandContent = element.querySelector('.worker-expand-content');

    if (!expandPanel) {
      expandPanel = WorkerExpandPanel.create(worker, expandContent);
    }

    expandPanel.render();
  };

  const updateWorker = (updatedWorker) => {
    Object.assign(worker, updatedWorker);
    render();
  };

  const attachEventListeners = createEventHandlers(worker, toggleExpand);

  const render = () => {
    if (element) {
      element.remove();
    }
    element = createWorkerElement(worker);
    container.appendChild(element);
    attachEventListeners();
  };

  const destroy = () => {
    if (expandPanel) {
      expandPanel.destroy();
    }
    element.remove();
  };

  // Initialize
  render();

  return {
    element,
    worker,
    isExpanded: () => isExpanded,
    toggleExpand,
    updateWorker,
    destroy,
  };
};

/**
 * Sealed namespace for WorkerCard utilities
 */
export const WorkerCard = Object.freeze({
  create: createWorkerCard,
});
