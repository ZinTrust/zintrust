/* eslint-disable no-undef */
/**
 * Worker Card Component
 * Handles worker display with expand/collapse functionality
 */

import type {
  HTMLElement,
  UIEventListener,
  WorkerCardInstance,
  WorkerExpandPanelInstance,
  WorkerInstance,
} from '../types/worker-ui.js';

// Global type declaration for WorkerExpandPanel
declare global {
  const WorkerExpandPanel: {
    create: (worker: WorkerInstance, container: HTMLElement) => WorkerExpandPanelInstance;
  };
}

import { WorkerExpandPanel } from './WorkerExpandPanel.js';

// Add document global declaration for browser environment
declare global {
  interface Document {
    createElement(tagName: string): HTMLElement;
  }

  var document: Document;
}

// HTMLButtonElement interface
interface HTMLButtonElement extends HTMLElement {
  addEventListener(type: string, listener: UIEventListener): void;
}

/**
 * Create worker header element with name, status, and queue info
 */
const createWorkerHeader = (worker: WorkerInstance): HTMLElement => {
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

  const actions = createWorkerActions(worker);
  header.appendChild(info);
  header.appendChild(actions);

  return header;
};

/**
 * Create worker actions section with expand button
 */
const createWorkerActions = (worker: WorkerInstance): HTMLElement => {
  const actions = document.createElement('div');
  actions.className = 'worker-actions';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'expand-btn';
  expandBtn.dataset['workerId'] = worker.id;

  const icon = document.createElement('i');
  icon.className = 'fas fa-chevron-down';
  expandBtn.appendChild(icon);

  actions.appendChild(expandBtn);
  return actions;
};

/**
 * Create expand content container
 */
const createExpandContent = (worker: WorkerInstance): HTMLElement => {
  const expandContent = document.createElement('div');
  expandContent.className = 'worker-expand-content';
  expandContent.id = `expand-${worker.id}`;
  expandContent.style['display'] = 'none';
  return expandContent;
};

/**
 * Destroy worker card and cleanup resources
 */
const destroyWorkerCard = (
  expandPanel: WorkerExpandPanelInstance | null,
  element: HTMLElement
): void => {
  if (expandPanel) {
    expandPanel.destroy();
  }
  element.remove();
};

/**
 * Render worker card element
 */
const renderWorkerCard = (
  createWorkerElement: () => HTMLElement,
  attachEventListeners: () => void,
  container: HTMLElement,
  elementRef: { current: HTMLElement | null }
): void => {
  if (elementRef.current) {
    elementRef.current.remove();
  }
  elementRef.current = createWorkerElement();
  container.appendChild(elementRef.current);
  attachEventListeners();
};

/**
 * Create worker card instance object
 */
const createWorkerCardInstance = (
  element: HTMLElement,
  worker: WorkerInstance,
  isExpanded: () => boolean,
  toggleExpand: () => void,
  updateWorker: (updatedWorker: WorkerInstance) => void,
  destroy: () => void
): WorkerCardInstance => ({
  element,
  worker,
  isExpanded,
  toggleExpand,
  updateWorker,
  destroy,
});

/**
 * Initialize worker card element and attach event listeners
 */
const initializeWorkerCard = (
  createWorkerElement: () => HTMLElement,
  attachEventListeners: () => void,
  container: HTMLElement
): HTMLElement => {
  const element = createWorkerElement();
  container.appendChild(element);
  attachEventListeners();
  return element;
};

/**
 * Create a worker card element with expand/collapse functionality
 */
export const createWorkerCard = (
  worker: WorkerInstance,
  container: HTMLElement
): WorkerCardInstance => {
  let isExpanded = false;
  let expandPanel: WorkerExpandPanelInstance | null = null;
  let element: HTMLElement;

  const createWorkerElement = (): HTMLElement => {
    const workerElement = document.createElement('div');
    workerElement.className = 'worker-card';

    const header = createWorkerHeader(worker);
    const expandContent = createExpandContent(worker);

    workerElement.appendChild(header);
    workerElement.appendChild(expandContent);

    return workerElement;
  };

  const attachEventListeners = (): void => {
    const expandBtn = element.querySelector('.expand-btn') as HTMLButtonElement;
    expandBtn.addEventListener('click', toggleExpand);
  };

  const toggleExpand = (): void => {
    isExpanded = !isExpanded;
    const expandContent = element.querySelector('.worker-expand-content') as HTMLElement;
    const expandBtn = element.querySelector('.expand-btn i') as HTMLElement;

    if (isExpanded) {
      expandContent.style['display'] = 'block';
      expandBtn.className = 'fas fa-chevron-up';
      renderExpandPanel();
    } else {
      expandContent.style['display'] = 'none';
      expandBtn.className = 'fas fa-chevron-down';
    }
  };

  const renderExpandPanel = (): void => {
    const expandContent = element.querySelector('.worker-expand-content') as HTMLElement;

    if (!expandPanel) {
      expandPanel = WorkerExpandPanel.create(worker, expandContent);
    }

    if (expandPanel) {
      expandPanel.render();
    }
  };

  const updateWorker = (updatedWorker: WorkerInstance): void => {
    Object.assign(worker, updatedWorker);
    render();
  };

  const render = (): void => {
    const elementRef = { current: element };
    renderWorkerCard(createWorkerElement, attachEventListeners, container, elementRef);
    element = elementRef.current || element;
  };

  const destroy = (): void => {
    destroyWorkerCard(expandPanel, element);
  };

  // Initialize
  element = initializeWorkerCard(createWorkerElement, attachEventListeners, container);

  return createWorkerCardInstance(
    element,
    worker,
    () => isExpanded,
    toggleExpand,
    updateWorker,
    destroy
  );
};

/**
 * Sealed namespace for WorkerCard utilities
 */
export const WorkerCard = Object.freeze({
  create: createWorkerCard,
});
