/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-undef */
/**
 * JSON Editor Modal Component
 * Allows editing JSON data with real-time validation
 */

/**
 * Create modal element with header, body, and footer
 * @param {Object} config - Configuration object
 * @param {Function} formatJson - Format JSON function
 * @param {Function} validateJson - Validate JSON function
 * @param {Function} handleSave - Save handler function
 * @param {Function} handleClose - Close handler function
 * @returns {HTMLDivElement} Modal element
 */
const createModalElement = (config, formatJson, validateJson, handleSave, handleClose) => {
  const modal = document.createElement('div');
  modal.className = `json-editor-modal json-editor-${config.theme}`;
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
  modalContent.style.margin = '30px auto';
  modalContent.style.borderRadius = '8px';
  modalContent.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
  modalContent.style.display = 'flex';
  modalContent.style.flexDirection = 'column';

  // Create header
  const modalHeader = createModalHeader(config, formatJson, handleClose);
  modalContent.appendChild(modalHeader);

  // Create body
  const modalBody = createModalBody(config, validateJson);
  modalContent.appendChild(modalBody);

  // Create footer
  const modalFooter = createModalFooter(handleSave, handleClose);
  modalContent.appendChild(modalFooter);

  modal.appendChild(modalContent);
  return modal;
};

/**
 * Create modal header with title and actions
 * @param {Object} config - Configuration object
 * @param {Function} formatJson - Format JSON function
 * @param {Function} handleClose - Close handler function
 * @returns {HTMLDivElement} Modal header element
 */
const createModalHeader = (config, formatJson, handleClose) => {
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

  const formatBtn = document.createElement('button');
  formatBtn.className = 'btn btn-sm btn-secondary format-btn';

  const formatIcon = document.createElement('i');
  formatIcon.className = 'fas fa-code';
  formatBtn.appendChild(formatIcon);
  formatBtn.appendChild(document.createTextNode(' Format'));
  formatBtn.addEventListener('click', formatJson);

  const validateBtn = document.createElement('button');
  validateBtn.className = 'btn btn-sm btn-info validate-btn';

  const validateIcon = document.createElement('i');
  validateIcon.className = 'fas fa-check';
  validateBtn.appendChild(validateIcon);
  validateBtn.appendChild(document.createTextNode(' Validate'));
  validateBtn.addEventListener('click', validateJson);

  if (config.closable) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm btn-secondary close-btn';

    const closeIcon = document.createElement('i');
    closeIcon.className = 'fas fa-times';
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener('click', handleClose);
    headerActions.appendChild(closeBtn);
  }

  headerActions.appendChild(formatBtn);
  headerActions.appendChild(validateBtn);

  modalHeader.appendChild(title);
  modalHeader.appendChild(headerActions);

  return modalHeader;
};

/**
 * Create modal body with textarea and validation container
 * @param {Object} config - Configuration object
 * @param {Function} validateJson - Validate JSON function
 * @returns {HTMLDivElement} Modal body element
 */
const createModalBody = (config, validateJson) => {
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';
  modalBody.style.padding = '16px';
  modalBody.style.flex = '1';
  modalBody.style.overflow = 'hidden';
  modalBody.style.display = 'flex';
  modalBody.style.flexDirection = 'column';

  const textarea = document.createElement('textarea');
  textarea.className = 'json-editor-textarea';
  textarea.style.width = '100%';
  textarea.style.height = '100%';
  textarea.style.padding = '12px';
  textarea.style.border = '1px solid #d1d5db';
  textarea.style.borderRadius = '4px';
  textarea.style.fontFamily = 'Monaco, Menlo, "Ubuntu Mono", monospace';
  textarea.style.fontSize = `${config.fontSize}px`;
  textarea.style.lineHeight = '1.4';
  textarea.style.resize = 'vertical';
  textarea.style.outline = 'none';
  textarea.style.wordWrap = config.wordWrap ? 'break-word' : 'normal';

  if (config.validateOnChange) {
    textarea.addEventListener('input', validateJson);
  }

  const validationContainer = document.createElement('div');
  validationContainer.className = 'validation-container';
  validationContainer.style.marginTop = '12px';
  validationContainer.style.padding = '12px';
  validationContainer.style.borderRadius = '4px';
  validationContainer.style.border = '1px solid #d1d5db';
  validationContainer.style.display = 'none';

  const validationContent = document.createElement('div');
  validationContent.className = 'validation-content';
  validationContent.style.fontSize = '13px';
  validationContent.style.lineHeight = '1.4';

  validationContainer.appendChild(validationContent);
  modalBody.appendChild(textarea);
  modalBody.appendChild(validationContainer);

  return modalBody;
};

/**
 * Create modal footer with action buttons
 * @param {Function} handleSave - Save handler function
 * @param {Function} handleClose - Close handler function
 * @returns {HTMLDivElement} Modal footer element
 */
const createModalFooter = (handleSave, handleClose) => {
  const modalFooter = document.createElement('div');
  modalFooter.className = 'modal-footer';
  modalFooter.style.display = 'flex';
  modalFooter.style.justifyContent = 'flex-end';
  modalFooter.style.gap = '8px';
  modalFooter.style.padding = '16px';
  modalFooter.style.borderTop = '1px solid #e5e7eb';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', handleClose);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary save-btn';

  const saveIcon = document.createElement('i');
  saveIcon.className = 'fas fa-save';
  saveBtn.appendChild(saveIcon);
  saveBtn.appendChild(document.createTextNode(' Save'));
  saveBtn.addEventListener('click', handleSave);

  modalFooter.appendChild(cancelBtn);
  modalFooter.appendChild(saveBtn);

  return modalFooter;
};

/**
 * Create validation success message
 * @param {HTMLElement} validationContent - Validation content element
 * @returns {void}
 */
const createValidationSuccess = (validationContent) => {
  const successDiv = document.createElement('div');
  successDiv.style.color = '#10b981';
  successDiv.style.fontWeight = '600';

  const successIcon = document.createElement('i');
  successIcon.className = 'fas fa-check-circle';
  successDiv.appendChild(successIcon);
  successDiv.appendChild(document.createTextNode(' Valid JSON and worker data'));

  validationContent.appendChild(successDiv);
};

/**
 * Create validation error messages
 * @param {HTMLElement} validationContent - Validation content element
 * @param {Array} errors - Array of error objects
 * @returns {void}
 */
const createValidationErrors = (validationContent, errors) => {
  const errorHeader = document.createElement('div');
  errorHeader.style.color = '#ef4444';
  errorHeader.style.fontWeight = '600';
  errorHeader.style.marginBottom = '8px';

  const errorIcon = document.createElement('i');
  errorIcon.className = 'fas fa-exclamation-triangle';
  errorHeader.appendChild(errorIcon);
  errorHeader.appendChild(document.createTextNode(' Validation Errors:'));

  validationContent.appendChild(errorHeader);

  errors.forEach((error) => {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = '#ef4444';
    errorDiv.style.marginBottom = '4px';
    errorDiv.textContent = `• ${error.path}: ${error.message}`;
    validationContent.appendChild(errorDiv);
  });
};

/**
 * Create JSON parse error message
 * @param {HTMLElement} validationContent - Validation content element
 * @param {string} errorMessage - Error message
 * @returns {void}
 */
const createParseError = (validationContent, errorMessage) => {
  const invalidDiv = document.createElement('div');
  invalidDiv.style.color = '#ef4444';
  invalidDiv.style.fontWeight = '600';

  const invalidIcon = document.createElement('i');
  invalidIcon.className = 'fas fa-exclamation-circle';
  invalidDiv.appendChild(invalidIcon);
  invalidDiv.appendChild(document.createTextNode(` Invalid JSON: ${errorMessage}`));

  validationContent.appendChild(invalidDiv);
};

/**
 * Clear validation content
 * @param {HTMLElement} validationContent - Validation content element
 * @returns {void}
 */
const clearValidationContent = (validationContent) => {
  while (validationContent.firstChild) {
    validationContent.firstChild.remove();
  }
};

/**
 * Format JSON in textarea
 * @param {HTMLElement} element - Modal element
 * @param {Function} validateJson - Validate function
 * @returns {void}
 */
const createFormatHandler = (element, validateJson) => {
  return () => {
    const textarea = element.querySelector('.json-editor-textarea');
    try {
      const data = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(data, null, 2);
    } catch (error) {
      console.log('error :', error);
      // Show validation error
      validateJson();
    }
  };
};

/**
 * Create JSON validator function
 * @param {HTMLElement} element - Modal element
 * @returns {Function} Validator function
 */
const createValidator = (element) => {
  return () => {
    const textarea = element.querySelector('.json-editor-textarea');
    const validationContainer = element.querySelector('.validation-container');
    const validationContent = element.querySelector('.validation-content');

    try {
      const data = JSON.parse(textarea.value);
      const validationResult = validateWorkerData(data);

      validationContainer.style.display = 'block';
      clearValidationContent(validationContent);

      if (validationResult.isValid) {
        createValidationSuccess(validationContent);
      } else {
        createValidationErrors(validationContent, validationResult.errors);
      }
    } catch (error) {
      validationContainer.style.display = 'block';
      clearValidationContent(validationContent);
      createParseError(validationContent, error.message);
    }
  };
};

/**
 * Create save handler
 * @param {HTMLElement} element - Modal element
 * @param {Function} onSaveCallback - Save callback function
 * @param {Function} validateJson - Validate function
 * @param {Function} close - Close function
 * @returns {Function} Save handler function
 */
const createSaveHandler = (element, onSaveCallback, validateJson, close) => {
  return () => {
    const textarea = element.querySelector('.json-editor-textarea');
    try {
      const data = JSON.parse(textarea.value);
      const validationResult = validateWorkerData(data);

      if (validationResult.isValid) {
        if (onSaveCallback) {
          onSaveCallback(data);
        }
        close();
      } else {
        validateJson();
      }
    } catch {
      validateJson();
    }
  };
};

/**
 * Create close handler
 * @param {Function} close - Close function
 * @returns {Function} Close handler function
 */
const createCloseHandler = (close) => {
  return () => {
    close();
  };
};

/**
 * Create modal management functions
 * @param {HTMLElement} element - Modal element
 * @param {Object} config - Configuration object
 * @param {Function} formatJson - Format function
 * @param {Function} validateJson - Validate function
 * @param {Function} handleSave - Save handler
 * @param {Function} handleClose - Close handler
 * @returns {Object} Modal management functions
 */
const createModalManagement = (
  element,
  config,
  formatJson,
  validateJson,
  handleSave,
  handleClose
) => {
  let isOpen = false;
  let backdrop = null;

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

      // Clean up state
    }
  };

  const open = (data) => {
    isOpen = true;

    if (!element) {
      const modalElement = createModalElement(
        config,
        formatJson,
        validateJson,
        handleSave,
        handleClose
      );
      // Replace the element reference
      Object.assign(element, modalElement);
    }

    if (!backdrop && config.backdrop) {
      backdrop = createBackdropElement();
    }

    const textarea = element.querySelector('.json-editor-textarea');
    textarea.value = JSON.stringify(data, null, 2);

    if (backdrop) {
      document.body.appendChild(backdrop);
    }
    document.body.appendChild(element);

    element.style.display = 'block';
    textarea.focus();
  };

  return {
    open,
    close,
    /** @returns {boolean} Whether the modal is currently open */
    isOpen: () => isOpen,
  };
};

/**
 * Create JSON data management functions
 * @param {HTMLElement} element - Modal element
 * @returns {Object} Data management functions
 */
const createDataManagement = (element) => {
  const getJsonData = () => {
    const textarea = element.querySelector('.json-editor-textarea');
    try {
      return JSON.parse(textarea.value);
    } catch {
      return null;
    }
  };

  const setJsonData = (data) => {
    const textarea = element.querySelector('.json-editor-textarea');
    textarea.value = JSON.stringify(data, null, 2);
  };

  const validate = () => {
    const textarea = element.querySelector('.json-editor-textarea');
    try {
      const data = JSON.parse(textarea.value);
      return validateWorkerData(data);
    } catch (error) {
      return {
        isValid: false,
        errors: [{ path: 'json', message: error.message }],
      };
    }
  };

  return {
    getJsonData,
    setJsonData,
    validate,
  };
};

/**
 * Create JSON editor event handlers
 * @param {HTMLElement} element - Modal element
 * @param {Object} config - Configuration object
 * @param {Function} onSaveCallback - Save callback function
 * @returns {Object} Event handlers object
 */
const createEventHandlers = (element, config, onSaveCallback) => {
  // Create local copy to avoid parameter reassignment
  let callbackRef = onSaveCallback;

  const validateJson = createValidator(element);
  const formatJson = createFormatHandler(element, validateJson);

  const handleSave = createSaveHandler(element, callbackRef, validateJson, () => {});
  const handleClose = createCloseHandler(() => {});

  const modalManagement = createModalManagement(
    element,
    config,
    formatJson,
    validateJson,
    handleSave,
    handleClose
  );
  const dataManagement = createDataManagement(element);

  // Update handlers with actual close function
  const actualHandleSave = createSaveHandler(
    element,
    callbackRef,
    validateJson,
    modalManagement.close
  );
  const actualHandleClose = createCloseHandler(modalManagement.close);

  const destroy = () => {
    modalManagement.close();
    // Note: element and backdrop cleanup handled in modalManagement
    callbackRef = null;
  };

  return {
    ...modalManagement,
    ...dataManagement,
    formatJson,
    validateJson,
    handleSave: actualHandleSave,
    handleClose: actualHandleClose,
    destroy,
  };
};

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
 * Create JSON editor lifecycle functions
 * @param {HTMLElement} element - Modal element
 * @param {Object} config - Configuration object
 * @param {Object} eventHandlers - Event handlers object
 * @returns {Object} Lifecycle functions
 */
const createEditorLifecycle = (element, config, eventHandlers) => {
  let isOpen = false;
  let backdrop = null;
  let modalElement = element; // Use local variable to avoid parameter reassignment

  const open = (data) => {
    isOpen = true;

    if (!modalElement) {
      modalElement = createModalElement(
        config,
        eventHandlers.formatJson,
        eventHandlers.validateJson,
        eventHandlers.handleSave,
        eventHandlers.handleClose
      );
    }

    if (!backdrop && config.backdrop) {
      backdrop = createBackdropElement();
    }

    const textarea = modalElement.querySelector('.json-editor-textarea');
    textarea.value = JSON.stringify(data, null, 2);

    if (backdrop) {
      document.body.appendChild(backdrop);
    }
    document.body.appendChild(modalElement);

    modalElement.style.display = 'block';
    textarea.focus();
  };

  const close = () => {
    if (isOpen) {
      isOpen = false;

      if (modalElement) {
        modalElement.style.display = 'none';
        modalElement.remove();
      }

      if (backdrop) {
        backdrop.remove();
      }

      // Clean up state
    }
  };

  const destroy = () => {
    close();
    modalElement = null;
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
 * Create JSON editor instance
 * @param {Object} config - Configuration object
 * @param {Function} onSaveCallback - Save callback function
 * @returns {Object} JSON editor instance with methods
 */
const createJsonEditor = (config, onSaveCallback) => {
  const element = null;

  const eventHandlers = createEventHandlers(
    {
      querySelector: (selector) => element?.querySelector(selector),
    },
    config,
    onSaveCallback
  );

  const lifecycle = createEditorLifecycle(element, config, eventHandlers);
  const data = createDataManagement(element);

  return {
    ...lifecycle,
    ...data,
    formatJson: eventHandlers.formatJson,
    validateJson: eventHandlers.validateJson,
    handleSave: eventHandlers.handleSave,
    handleClose: eventHandlers.handleClose,
  };
};

/**
 * Sealed namespace for JsonEditor utilities
 */
export const JsonEditor = Object.freeze({
  create: createJsonEditor,
});
