import { Response } from 'express';

/**
 * Standard API response format
 */
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * Send a successful API response
 */
export const successResponse = <T>(
  res: Response,
  data: T,
  message: string = 'Success',
  statusCode: number = 200,
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  }
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a paginated API response
 */
export const paginatedResponse = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message: string = 'Success'
): Response => {
  const totalPages = Math.ceil(total / limit);
  
  return successResponse(
    res,
    data,
    message,
    200,
    {
      page,
      limit,
      total,
      totalPages,
    }
  );
};

/**
 * Send an error response
 */
export const errorResponse = (
  res: Response,
  message: string = 'An error occurred',
  statusCode: number = 500,
  errors?: any[]
): Response => {
  const response: ApiResponse<null> = {
    success: false,
    message,
  };

  if (errors) {
    response.data = errors as any;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a validation error response
 */
export const validationErrorResponse = (
  res: Response,
  errors: any[],
  message: string = 'Validation failed'
): Response => {
  return errorResponse(res, message, 400, errors);
};

/**
 * Send a not found response
 */
export const notFoundResponse = (
  res: Response,
  message: string = 'Resource not found'
): Response => {
  return errorResponse(res, message, 404);
};

/**
 * Send an unauthorized response
 */
export const unauthorizedResponse = (
  res: Response,
  message: string = 'Not authorized to access this resource'
): Response => {
  return errorResponse(res, message, 401);
};

/**
 * Send a forbidden response
 */
export const forbiddenResponse = (
  res: Response,
  message: string = 'Forbidden'
): Response => {
  return errorResponse(res, message, 403);
};

/**
 * Send a bad request response
 */
export const badRequestResponse = (
  res: Response,
  message: string = 'Bad request',
  errors?: any[]
): Response => {
  return errorResponse(res, message, 400, errors);
};

/**
 * Send a conflict response
 */
export const conflictResponse = (
  res: Response,
  message: string = 'Resource already exists'
): Response => {
  return errorResponse(res, message, 409);
};

/**
 * Send a rate limit exceeded response
 */
export const rateLimitExceededResponse = (
  res: Response,
  message: string = 'Too many requests, please try again later'
): Response => {
  res.set('Retry-After', '3600'); // 1 hour
  return errorResponse(res, message, 429);
};
