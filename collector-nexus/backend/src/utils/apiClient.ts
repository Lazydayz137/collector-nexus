import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { logger } from './logger';
import { ApiError } from '../middleware/errorHandler';

// Define types for API response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string | number;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// API client configuration
interface ApiClientConfig extends AxiosRequestConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
  withCredentials?: boolean;
  auth?: {
    username: string;
    password: string;
  };
  retry?: {
    maxRetries: number;
    delay: number;
  };
}

/**
 * API Client class for making HTTP requests
 */
class ApiClient {
  private client: AxiosInstance;
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 30000, // 30 seconds default timeout
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...config,
    };

    this.client = axios.create(this.config);
    this.setupInterceptors();
  }

  /**
   * Set up request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Log request details in development
        if (process.env.NODE_ENV === 'development') {
          logger.http(`[${config.method?.toUpperCase()}] ${config.url}`, {
            method: config.method,
            url: config.url,
            params: config.params,
            data: config.data,
          });
        }
        return config;
      },
      (error) => {
        logger.error('Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Log response details in development
        if (process.env.NODE_ENV === 'development') {
          logger.http(`[${response.config.method?.toUpperCase()}] ${response.config.url} - ${response.status}`, {
            status: response.status,
            statusText: response.statusText,
            data: response.data,
          });
        }
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as any;
        
        // Log error
        logger.error('API Error:', {
          url: originalRequest?.url,
          method: originalRequest?.method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });

        // Handle rate limiting (429)
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 1;
          logger.warn(`Rate limited. Retrying after ${retryAfter} seconds...`);
          
          // Wait for the specified time before retrying
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.client(originalRequest);
        }

        // Handle other errors
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a GET request
   */
  public async get<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.get<T>(url, config);
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError<T>(error);
    }
  }

  /**
   * Make a POST request
   */
  public async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.post<T>(url, data, config);
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError<T>(error);
    }
  }

  /**
   * Make a PUT request
   */
  public async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.put<T>(url, data, config);
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError<T>(error);
    }
  }

  /**
   * Make a PATCH request
   */
  public async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.patch<T>(url, data, config);
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError<T>(error);
    }
  }

  /**
   * Make a DELETE request
   */
  public async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.delete<T>(url, config);
      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError<T>(error);
    }
  }

  /**
   * Handle successful response
   */
  private handleResponse<T>(response: AxiosResponse<T>): ApiResponse<T> {
    const { data } = response;
    
    // If the response already has the expected format, return it as is
    if (data && typeof data === 'object' && 'success' in (data as any)) {
      return data as unknown as ApiResponse<T>;
    }
    
    // Otherwise, wrap the response data
    return {
      success: true,
      data,
    };
  }

  /**
   * Handle error response
   */
  private handleError<T>(error: any): ApiResponse<T> {
    if (axios.isAxiosError(error)) {
      const { response } = error;
      
      if (response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        return {
          success: false,
          error: {
            code: response.status,
            message: response.statusText,
            details: response.data,
          },
        };
      } else if (error.request) {
        // The request was made but no response was received
        return {
          success: false,
          error: {
            code: 'NO_RESPONSE',
            message: 'No response received from server',
          },
        };
      }
    }
    
    // Something happened in setting up the request that triggered an Error
    return {
      success: false,
      error: {
        code: 'REQUEST_ERROR',
        message: error.message || 'An unknown error occurred',
      },
    };
  }

  /**
   * Set default headers
   */
  public setHeader(key: string, value: string): void {
    this.client.defaults.headers.common[key] = value;
  }

  /**
   * Remove default header
   */
  public removeHeader(key: string): void {
    delete this.client.defaults.headers.common[key];
  }

  /**
   * Set authentication token
   */
  public setAuthToken(token: string): void {
    if (token) {
      this.setHeader('Authorization', `Bearer ${token}`);
    } else {
      this.removeHeader('Authorization');
    }
  }
}

// Create a default API client instance
const apiClient = new ApiClient({
  baseURL: process.env.API_BASE_URL || 'http://localhost:5000/api',
  timeout: 30000, // 30 seconds
});

export { ApiClient, apiClient };
export default apiClient;
