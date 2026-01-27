/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Worker API Service
 * HTTP client for worker management operations
 */

/**
 * Create HTTP request handler for worker API
 * @param {string} baseUrl - The base URL for the API
 * @returns {Function} HTTP request handler function
 */
const createRequestHandler = (baseUrl) => {
  return async (endpoint, options = {}) => {
    const url = `${baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}: ${response.statusText}`,
          code: data.code || 'HTTP_ERROR',
          status: response.status,
        };
      }

      return {
        success: true,
        data: data.data || data,
        message: data.message,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Network error',
        code: 'NETWORK_ERROR',
      };
    }
  };
};

/**
 * Create query operations for worker API
 * @param {Function} request - HTTP request handler function
 * @returns {Object} Query operations object
 */
const createQueryOperations = (request) => ({
  /**
   * Get all workers with optional query parameters
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} API response
   */
  getWorkers: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `?${queryString}` : '';

    return await request(endpoint);
  },

  /**
   * Get a specific worker by ID
   * @param {string} workerId - Worker ID
   * @returns {Promise<Object>} API response
   */
  getWorker: async (workerId) => {
    return await request(`/${workerId}`);
  },

  /**
   * Get worker data as JSON
   * @param {string} workerId - Worker ID
   * @returns {Promise<Object>} API response
   */
  getWorkerJson: async (workerId) => {
    return await request(`/${workerId}/json`);
  },

  /**
   * Get worker metrics
   * @param {string} workerId - Worker ID
   * @returns {Promise<Object>} API response
   */
  getWorkerMetrics: async (workerId) => {
    return await request(`/${workerId}/metrics`);
  },

  /**
   * Get worker logs with optional query parameters
   * @param {string} workerId - Worker ID
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} API response
   */
  getWorkerLogs: async (workerId, params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/${workerId}/logs?${queryString}` : `/${workerId}/logs`;

    return await request(endpoint);
  },
});

/**
 * Create mutation operations for worker API
 * @param {Function} request - HTTP request handler function
 * @returns {Object} Mutation operations object
 */
const createMutationOperations = (request) => ({
  /**
   * Update a worker
   * @param {string} workerId - Worker ID
   * @param {Object} workerData - Worker data to update
   * @returns {Promise<Object>} API response
   */
  updateWorker: async (workerId, workerData) => {
    return await request(`/${workerId}`, {
      method: 'PUT',
      body: JSON.stringify(workerData),
    });
  },

  /**
   * Update worker data as JSON
   * @param {string} workerId - Worker ID
   * @param {Object} workerData - Worker data to update
   * @returns {Promise<Object>} API response
   */
  updateWorkerJson: async (workerId, workerData) => {
    return await request(`/${workerId}/json`, {
      method: 'PUT',
      body: JSON.stringify(workerData),
    });
  },

  /**
   * Create a new worker
   * @param {Object} workerData - Worker data to create
   * @returns {Promise<Object>} API response
   */
  createWorker: async (workerData) => {
    return await request('', {
      method: 'POST',
      body: JSON.stringify(workerData),
    });
  },

  /**
   * Delete a worker
   * @param {string} workerId - Worker ID
   * @returns {Promise<Object>} API response
   */
  deleteWorker: async (workerId) => {
    return await request(`/${workerId}`, {
      method: 'DELETE',
    });
  },
});

/**
 * Create control operations for worker API
 * @param {Function} request - HTTP request handler function
 * @returns {Object} Control operations object
 */
const createControlOperations = (request) => ({
  /**
   * Start a worker
   * @param {string} workerId - Worker ID
   * @param {string} driver - Driver type
   * @returns {Promise<Object>} API response
   */
  startWorker: async (workerId, driver) => {
    return await request(`/${workerId}/start`, {
      method: 'POST',
      body: JSON.stringify({ driver }),
    });
  },

  /**
   * Stop a worker
   * @param {string} workerId - Worker ID
   * @param {string} driver - Driver type
   * @returns {Promise<Object>} API response
   */
  stopWorker: async (workerId, driver) => {
    return await request(`/${workerId}/stop`, {
      method: 'POST',
      body: JSON.stringify({ driver }),
    });
  },

  /**
   * Set auto-start configuration for a worker
   * @param {string} workerId - Worker ID
   * @param {boolean} autoStart - Auto-start setting
   * @param {string} driver - Driver type
   * @returns {Promise<Object>} API response
   */
  setAutoStart: async (workerId, autoStart, driver) => {
    return await request(`/${workerId}/auto-start`, {
      method: 'POST',
      body: JSON.stringify({ autoStart, driver }),
    });
  },
});

/**
 * Worker API service for HTTP requests
 * @returns {Object} Worker API instance with all operations
 */
const createWorkerApi = () => {
  const baseUrl = '/api/workers';
  const request = createRequestHandler(baseUrl);

  const queryOps = createQueryOperations(request);
  const mutationOps = createMutationOperations(request);
  const controlOps = createControlOperations(request);

  return {
    ...queryOps,
    ...mutationOps,
    ...controlOps,
  };
};

/**
 * Sealed namespace for Worker API
 */
export const workerApi = Object.freeze({
  create: createWorkerApi,
});

// Create default instance
export default createWorkerApi();
