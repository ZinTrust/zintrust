/**
 * Worker UI Types
 * Type definitions for worker management UI components
 */

// DOM types for browser environment
declare global {
  interface HTMLElement {
    appendChild(node: Node): Node;
    remove(): void;
    classList: DOMTokenList;
    style: CSSStyleDeclaration;
    textContent: string;
    // Note: innerHTML is included for legitimate use cases (JSON highlighting, safe HTML templates)
    // Always sanitize content before using innerHTML to prevent XSS attacks
    // eslint-disable-next-line no-restricted-syntax
    innerHTML: string;
    className: string;
    id: string;
    querySelector(selector: string): Element | null;
    addEventListener(type: string, listener: UIEventListener): void;
    dataset: DOMStringMap;
  }

  // UIEventListener type for browser environment
  type UIEventListener = (evt: Event) => void;

  interface Event {
    target: EventTarget | null;
  }

  interface Element {
    querySelector(selector: string): Element | null;
  }

  interface EventTarget {
    addEventListener(type: string, listener: UIEventListener): void;
  }

  interface DOMTokenList {
    add(token: string): void;
    remove(token: string): void;
  }

  interface CSSStyleDeclaration {
    display:
      | 'block'
      | 'none'
      | 'inline'
      | 'inline-block'
      | 'flex'
      | 'grid'
      | 'hidden'
      | 'inherit'
      | 'initial'
      | 'revert'
      | 'unset'
      | number;
    [property: string]: string | number;
  }

  interface DOMStringMap {
    [key: string]: string;
  }

  interface Node {
    remove(): void;
  }
}

// Make DOM types available for exported interfaces
export interface Node {
  remove(): void;
}

export interface DOMTokenList {
  add(token: string): void;
  remove(token: string): void;
}

export interface CSSStyleDeclaration {
  display: string | number;
  [property: string]: string | number;
}

export interface DOMStringMap {
  [key: string]: string;
}

export interface Element {
  querySelector(selector: string): Element | null;
}

export interface EventTarget {
  addEventListener(type: string, listener: UIEventListener): void;
}

export interface Event {
  target: EventTarget | null;
}

// UIEventListener type for browser environment
export type UIEventListener = (evt: Event) => void;

export interface HTMLElement {
  appendChild(node: Node): Node;
  remove(): void;
  classList: DOMTokenList;
  style: CSSStyleDeclaration;
  textContent: string;
  // Note: innerHTML is included for legitimate use cases (JSON highlighting, safe HTML templates)
  // Always sanitize content before using innerHTML to prevent XSS attacks
  // eslint-disable-next-line no-restricted-syntax
  innerHTML: string;
  className: string;
  id: string;
  querySelector(selector: string): Element | null;
  addEventListener(type: string, listener: UIEventListener): void;
  dataset: DOMStringMap;
}

/**
 * Worker instance interface for UI components
 */
export interface WorkerInstance {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'failed' | 'paused';
  queueName: string;
  driver: 'database' | 'redis' | 'memory';
  concurrency: number;
  autoStart: boolean;
  createdAt: string;
  updatedAt: string;
  lastHealthCheck?: string;
  lastError?: string;
  connectionState?: 'connected' | 'disconnected' | 'connecting';
  version?: string;
  region?: string;
  processor?: string;
  features?: Record<string, boolean>;
  infrastructure?: Record<string, unknown>;
  datacenter?: Record<string, unknown>;
}

/**
 * Worker card instance interface
 */
export interface WorkerCardInstance {
  element: HTMLElement;
  worker: WorkerInstance;
  isExpanded: () => boolean;
  toggleExpand: () => void;
  updateWorker: (worker: WorkerInstance) => void;
  destroy: () => void;
}

/**
 * Worker expand panel instance interface
 */
export interface WorkerExpandPanelInstance {
  element: HTMLElement;
  worker: WorkerInstance;
  render: () => void;
  destroy: () => void;
}

/**
 * JSON viewer modal instance interface
 */
export interface JsonViewerInstance {
  element: HTMLElement;
  isOpen: () => boolean;
  open: (data: unknown) => void;
  close: () => void;
  destroy: () => void;
}

/**
 * JSON editor modal instance interface
 */
export interface JsonEditorInstance {
  element: HTMLElement;
  isOpen: () => boolean;
  open: (data: unknown) => void;
  close: () => void;
  getJsonData: () => unknown;
  setJsonData: (data: unknown) => void;
  validate: () => ValidationResult;
  destroy: () => void;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error interface
 */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
  field?: string;
}

/**
 * Validation warning interface
 */
export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
  field?: string;
}

/**
 * Modal options interface
 */
export interface ModalOptions {
  title?: string;
  width?: string;
  height?: string;
  closable?: boolean;
  backdrop?: boolean;
}

/**
 * JSON viewer options interface
 */
export interface JsonViewerOptions extends ModalOptions {
  expandAll?: boolean;
  searchEnabled?: boolean;
  copyEnabled?: boolean;
  theme?: 'light' | 'dark';
}

/**
 * JSON editor options interface
 */
export interface JsonEditorOptions extends ModalOptions {
  validateOnChange?: boolean;
  autoFormat?: boolean;
  theme?: 'light' | 'dark';
  fontSize?: number;
  wordWrap?: boolean;
}

/**
 * API response interface
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

/**
 * Worker API response interface
 */
export interface WorkerApiResponse extends ApiResponse<WorkerInstance> {
  data?: WorkerInstance;
}

/**
 * Workers list API response interface
 */
export interface WorkersListApiResponse extends ApiResponse<WorkerInstance[]> {
  data?: WorkerInstance[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
