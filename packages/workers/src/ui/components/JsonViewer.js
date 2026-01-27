/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-undef */
/**
 * JSON Viewer Modal Component
 * Displays JSON data in a formatted modal with syntax highlighting
 */

/**
 * Default configuration for JSON viewer
 */
const getDefaultOptions = () => ({
  title: 'JSON Data',
  width: '800px',
  height: '600px',
  closable: true,
  backdrop: true,
  expandAll: false,
  searchEnabled: true,
  copyEnabled: true,
  theme: 'light',
});

/**
 * Create backdrop element
 * @returns {HTMLDivElement} Backdrop element
 */
const createBackdropElement = () => {
  const backdrop = document.createElement('div');
  backdrop.style.position = 'fixed';
  backdrop.style.top = '0';
  backdrop.style.left = '0';
  backdrop.style.width = '100%';
  backdrop.style.height = '100%';
  backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  backdrop.style.zIndex = '999';
  return backdrop;
};

/**
 * Format JSON with proper indentation
 * @param {*} data - Data to format
 * @returns {string} Formatted JSON string
 */
const formatJsonData = (data) => {
  return JSON.stringify(data, null, 2);
};

/**
 * Apply syntax highlighting to JSON string
 * @param {string} jsonString - JSON string to highlight
 * @returns {string} Highlighted HTML string
 */
const highlightJsonSyntax = (jsonString) => {
  return jsonString
    .replaceAll(/"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?/g, (match) => {
      if (/:$/.test(match)) {
        return `<span class="json-key">${match}</span>`;
      } else {
        return `<span class="json-string">${match}</span>`;
      }
    })
    .replaceAll(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
    .replaceAll(/\bnull\b/g, '<span class="json-null">$&</span>')
    .replaceAll(/-?\d+(?:\.\d*)?(?:[eE[+-]?\d+)?/g, '<span class="json-number">$&</span>');
};

/**
 * Create modal header element
 * @param {Object} config - Configuration object
 * @param {Function} onClose - Close handler
 * @param {Function} onCopy - Copy handler
 * @returns {HTMLDivElement} Modal header element
 */
const createModalHeader = (config, onClose, onCopy) => {
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  modalHeader.style.padding = '16px 20px';
  modalHeader.style.borderBottom = '1px solid #e5e7eb';
  modalHeader.style.display = 'flex';
  modalHeader.style.justifyContent = 'space-between';
  modalHeader.style.alignItems = 'center';

  const title = document.createElement('h3');
  title.textContent = config.title;
  title.style.margin = '0';
  title.style.fontSize = '18px';
  title.style.fontWeight = '600';

  const headerActions = document.createElement('div');
  headerActions.style.display = 'flex';
  headerActions.style.gap = '8px';

  if (config.copyEnabled) {
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'btn btn-sm btn-secondary';
    copyBtn.addEventListener('click', onCopy);
    headerActions.appendChild(copyBtn);
  }

  if (config.closable) {
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'btn btn-sm btn-secondary';
    closeBtn.addEventListener('click', onClose);
    headerActions.appendChild(closeBtn);
  }

  modalHeader.appendChild(title);
  modalHeader.appendChild(headerActions);

  return modalHeader;
};

/**
 * Create modal body element
 * @param {Object} config - Configuration object
 * @param {Function} onSearch - Search handler
 * @returns {HTMLDivElement} Modal body element
 */
const createModalBody = (config, onSearch) => {
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';
  modalBody.style.padding = '16px';
  modalBody.style.flex = '1';
  modalBody.style.overflow = 'hidden';
  modalBody.style.display = 'flex';
  modalBody.style.flexDirection = 'column';

  if (config.searchEnabled) {
    const searchContainer = document.createElement('div');
    searchContainer.style.marginBottom = '16px';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search JSON...';
    searchInput.className = 'search-input';
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px 12px';
    searchInput.style.border = '1px solid #d1d5db';
    searchInput.style.borderRadius = '4px';
    searchInput.addEventListener('input', onSearch);

    searchContainer.appendChild(searchInput);
    modalBody.appendChild(searchContainer);
  }

  const jsonContainer = document.createElement('div');
  jsonContainer.className = 'json-container';
  jsonContainer.style.fontFamily = 'Monaco, Menlo, "Ubuntu Mono", monospace';
  jsonContainer.style.fontSize = '14px';
  jsonContainer.style.lineHeight = '1.5';
  jsonContainer.style.whiteSpace = 'pre-wrap';
  jsonContainer.style.overflow = 'auto';

  modalBody.appendChild(jsonContainer);

  return modalBody;
};

/**
 * Create modal element
 * @param {Object} config - Configuration object
 * @param {Function} onClose - Close handler
 * @param {Function} onCopy - Copy handler
 * @param {Function} onSearch - Search handler
 * @returns {HTMLDivElement} Modal element
 */
const createModalElement = (config, onClose, onCopy, onSearch) => {
  const modal = document.createElement('div');
  modal.className = `json-viewer-modal json-viewer-${config.theme}`;
  modal.style.display = 'none';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.zIndex = '1000';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.position = 'relative';
  modalContent.style.backgroundColor = '#fff';
  modalContent.style.width = config.width;
  modalContent.style.height = config.height;
  modalContent.style.margin = '50px auto';
  modalContent.style.borderRadius = '8px';
  modalContent.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';

  const modalHeader = createModalHeader(config, onClose, onCopy);
  const modalBody = createModalBody(config, onSearch);

  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modal.appendChild(modalContent);

  return modal;
};

// Global timeout registry for proper cleanup
const activeTimeouts = new Set();

/**
 * Create notification element with proper timeout management
 * @param {string} message - Notification message
 * @param {string} type - Notification type ('success', 'error', 'info')
 * @returns {number} Timeout reference for cleanup
 */
const showNotification = (message, type = 'info') => {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.padding = '12px 16px';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '2000';

  if (type === 'success') {
    notification.style.backgroundColor = '#10b981';
    notification.style.color = 'white';
  } else if (type === 'error') {
    notification.style.backgroundColor = '#ef4444';
    notification.style.color = 'white';
  } else {
    notification.style.backgroundColor = '#3b82f6';
    notification.style.color = 'white';
  }

  document.body.appendChild(notification);

  const timeoutId = setTimeout(() => {
    notification.remove();
    activeTimeouts.delete(timeoutId); // Clean up from registry
  }, 3000);

  activeTimeouts.add(timeoutId); // Track timeout for cleanup
  return timeoutId;
};

/**
 * Clear all active notification timeouts
 * @returns {void}
 */
const clearAllNotifications = () => {
  activeTimeouts.forEach((timeoutId) => {
    clearTimeout(timeoutId);
  });
  activeTimeouts.clear();
};

/**
 * Create search handler for JSON viewer
 * @param {HTMLElement} element - Modal element
 * @param {Function} renderJson - Render function
 * @returns {Function} Search handler function
 */
const createSearchHandler = (element, renderJson) => {
  return (event) => {
    const searchTerm = event.target.value.toLowerCase();
    const jsonContainer = element.querySelector('.json-container');

    if (searchTerm) {
      const regex = new RegExp(`(${searchTerm})`, 'gi');
      jsonContainer.innerHTML = jsonContainer.innerHTML.replace(regex, '<mark>$1</mark>');
    } else {
      renderJson();
    }
  };
};

/**
 * Create JSON viewer lifecycle functions
 * @param {Object} config - Configuration object
 * @param {*} initialData - Initial JSON data
 * @returns {Object} Lifecycle functions
 */
const createViewerLifecycle = (config, initialData) => {
  let element;
  let backdrop;
  let isOpen = false;
  let currentData = initialData;

  const copyToClipboard = () => {
    if (currentData) {
      const jsonString = formatJsonData(currentData);
      navigator.clipboard
        .writeText(jsonString)
        .then(() => {
          showNotification('JSON copied to clipboard', 'success');
        })
        .catch(() => {
          showNotification('Failed to copy JSON', 'error');
        });
    }
  };

  const renderJson = () => {
    const jsonContainer = element.querySelector('.json-container');
    if (currentData) {
      const formattedJson = formatJsonData(currentData);
      const highlightedJson = highlightJsonSyntax(formattedJson);
      jsonContainer.innerHTML = highlightedJson;
    }
  };

  const handleSearch = createSearchHandler(element, renderJson);

  const open = (data) => {
    currentData = data;
    isOpen = true;

    if (!element) {
      element = createModalElement(config, close, copyToClipboard, handleSearch);
    }

    if (!backdrop && config.backdrop) {
      backdrop = createBackdropElement();
    }

    renderJson();

    if (backdrop) {
      document.body.appendChild(backdrop);
    }
    document.body.appendChild(element);

    element.style.display = 'block';
  };

  const close = () => {
    if (isOpen) {
      isOpen = false;

      if (element) {
        element.style.display = 'none';
        element.remove();
      }

      if (backdrop) {
        backdrop.remove();
      }

      currentData = null;
    }
  };

  const destroy = () => {
    close();
    // Clear all active notification timeouts to prevent memory leaks
    clearAllNotifications();
    element = null;
    backdrop = null;
  };

  return {
    open,
    close,
    destroy,
    /** @returns {boolean} Whether the modal is currently open */
    isOpen: () => isOpen,
  };
};

/**
 * Create a JSON viewer modal
 */
const createJsonViewer = (options = {}) => {
  const currentData = null;
  const config = { ...getDefaultOptions(), ...options };

  const lifecycle = createViewerLifecycle(config, currentData);

  return {
    ...lifecycle,
    /** @returns {boolean} Whether the modal is currently open */
    isOpen: lifecycle.isOpen,
  };
};

/**
 * Sealed namespace for JsonViewer utilities
 */
export const JsonViewer = Object.freeze({
  create: createJsonViewer,
});
