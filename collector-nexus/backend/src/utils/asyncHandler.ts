import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from '../middleware/errorHandler';

/**
 * Wraps an async function to handle errors and pass them to Express's error handler
 * @param fn The async function to wrap
 * @returns A middleware function that handles async/await errors
 */
const asyncHandler = <
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>
>(
  fn: (
    req: Request<P, ResBody, ReqBody, ReqQuery, Locals>,
    res: Response<ResBody, Locals>,
    next: NextFunction
  ) => Promise<any>
): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> => {
  return (req, res, next) => {
    // Execute the async function and catch any errors
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // Pass the error to Express's error handler
      next(error);
    });
  };
};

/**
 * Wraps a controller function to handle errors and send appropriate responses
 * @param fn The controller function to wrap
 * @returns A middleware function that handles errors and sends responses
 */
const controllerHandler = <
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>
>(
  fn: (
    req: Request<P, ResBody, ReqBody, ReqQuery, Locals>,
    res: Response<ResBody, Locals>,
    next: NextFunction
  ) => Promise<ResBody | void>
): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> => {
  return async (req, res, next) => {
    try {
      const result = await fn(req, res, next);
      
      // If headers have already been sent, do nothing
      if (res.headersSent) {
        return;
      }
      
      // If the controller returned a result, send it as JSON
      if (result !== undefined) {
        res.json(result);
      }
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Wraps a service function to handle errors and return a consistent response
 * @param fn The service function to wrap
 * @param errorMessage Custom error message to use if the function throws
 * @returns A function that returns a promise with the service result or throws an ApiError
 */
const serviceHandler = async <T>(
  fn: () => Promise<T>,
  errorMessage: string = 'An error occurred',
  statusCode: number = 500
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Log the actual error for debugging
    console.error('Service error:', error);
    
    // Throw a new ApiError with the provided message
    throw new ApiError(statusCode, errorMessage, { cause: error });
  }
};

/**
 * Wraps a database operation with retry logic for transient errors
 * @param fn The database operation to retry
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay between retries in ms
 * @returns A promise that resolves with the result of the operation
 */
const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 100
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // If this is the last attempt or the error is not retryable, break the loop
      if (attempt === maxRetries || !isRetryableError(error as Error)) {
        break;
      }
      
      // Exponential backoff: wait longer between each retry
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // If we get here, all retries failed
  throw lastError || new Error('Unknown error occurred');
};

/**
 * Checks if an error is retryable
 * @param error The error to check
 * @returns True if the error is retryable, false otherwise
 */
const isRetryableError = (error: Error): boolean => {
  // List of error codes/messages that are considered retryable
  const retryableErrors = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ESOCKETTIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'EADDRINUSE',
    'ECONNABORTED',
    'EPROTO',
    'ETIMEDOUT',
    'ESOCKET',
    'timeout',
    'connection lost',
    'connection closed',
    'disconnected',
    'connection timeout',
    'write EPIPE',
    'This socket has been ended by the other party',
    'read ECONNRESET',
    'write ECONNABORTED',
  ];
  
  return retryableErrors.some(e => 
    error.message.includes(e) || 
    (error as any).code === e ||
    (error as any).errno === e
  );
};

/**
 * Executes multiple async operations in parallel with a concurrency limit
 * @param items Array of items to process
 * @param asyncFn Async function to process each item
 * @param concurrency Maximum number of concurrent operations
 * @returns A promise that resolves when all operations are complete
 */
const parallelLimit = async <T, R>(
  items: T[],
  asyncFn: (item: T, index: number) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> => {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  let index = 0;
  
  // Process items in batches
  for (const item of items) {
    const currentIndex = index++;
    const p = Promise.resolve().then(() => asyncFn(item, currentIndex));
    results.push(p as unknown as R);
    
    // When a promise completes, remove it from the executing array
    const e: Promise<void> = p.then(() => {
      const i = executing.indexOf(e);
      if (i !== -1) {
        executing.splice(i, 1);
      }
    });
    
    executing.push(e);
    
    // If we've reached the concurrency limit, wait for one promise to finish
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  // Wait for all remaining promises to complete
  await Promise.all(executing);
  return Promise.all(results);
};

export {
  asyncHandler,
  controllerHandler,
  serviceHandler,
  withRetry,
  isRetryableError,
  parallelLimit,
};
