import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../middleware/errorHandler';
import { logger } from './logger';

// Common validation patterns
const patterns = {
  email: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  username: /^[a-zA-Z0-9_-]{3,20}$/,
  objectId: /^[0-9a-fA-F]{24}$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  phone: /^\+?[1-9]\d{1,14}$/, // E.164 format
  url: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/,
  hexColor: /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
};

// Common validation messages
const messages = {
  'string.empty': '{{#label}} is required',
  'any.required': '{{#label}} is required',
  'string.min': '{{#label}} must be at least {{#limit}} characters',
  'string.max': '{{#label}} must not exceed {{#limit}} characters',
  'string.email': 'Please provide a valid email address',
  'string.pattern.base': '{{#label}} does not match the required format',
  'string.alphanum': '{{#label}} must only contain alphanumeric characters',
  'number.base': '{{#label}} must be a number',
  'number.min': '{{#label}} must be at least {{#limit}}',
  'number.max': '{{#label}} must not exceed {{#limit}}',
  'array.base': '{{#label}} must be an array',
  'array.min': '{{#label}} must contain at least {{#limit}} items',
  'object.base': '{{#label}} must be an object',
  'any.only': '{{#label}} must be one of {{#valids}}',
  'date.base': '{{#label}} must be a valid date',
  'date.format': '{{#label}} must be in the format {{#format}}',
};

// Common validation schemas
const schemas = {
  id: Joi.string().pattern(patterns.objectId).messages({
    'string.pattern.base': 'Invalid ID format',
  }),
  
  email: Joi.string().email().pattern(patterns.email, { name: 'email' }).messages({
    'string.email': 'Please provide a valid email address',
    'string.pattern.name': 'Please provide a valid email address',
  }),
  
  password: Joi.string()
    .min(8)
    .pattern(patterns.password)
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    }),
  
  username: Joi.string()
    .min(3)
    .max(20)
    .pattern(patterns.username)
    .messages({
      'string.pattern.base':
        'Username can only contain letters, numbers, underscores, and hyphens (3-20 characters)',
    }),
  
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().pattern(/^[a-zA-Z0-9_,.\s-]+(:asc|:desc)?$/),
  },
  
  date: {
    iso: Joi.string().isoDate(),
    timestamp: Joi.number().integer().min(0),
  },
  
  address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    postalCode: Joi.string().required(),
    country: Joi.string().required(),
  }),
  
  phone: Joi.string().pattern(patterns.phone).messages({
    'string.pattern.base': 'Please provide a valid phone number in E.164 format',
  }),
  
  url: Joi.string().uri().pattern(patterns.url).messages({
    'string.uri': 'Please provide a valid URL',
    'string.pattern.base': 'Please provide a valid URL',
  }),
};

/**
 * Validate request data against a Joi schema
 */
const validate = (schema: Joi.ObjectSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type,
        }));

        logger.warn('Validation error:', { errors, source });
        return next(new ApiError(400, 'Validation failed', { errors }));
      }

      // Replace the request data with the validated and sanitized data
      req[source] = value;
      next();
    } catch (error) {
      logger.error('Validation middleware error:', error);
      next(new ApiError(500, 'Internal server error during validation'));
    }
  };
};

/**
 * Validate request body
 */
const validateBody = (schema: Joi.ObjectSchema) => validate(schema, 'body');

/**
 * Validate request query parameters
 */
const validateQuery = (schema: Joi.ObjectSchema) => validate(schema, 'query');

/**
 * Validate request URL parameters
 */
const validateParams = (schema: Joi.ObjectSchema) => validate(schema, 'params');

/**
 * Validate file upload
 */
const validateFile = (options: {
  fieldName: string;
  allowedMimeTypes?: string[];
  maxSize?: number; // in bytes
  isRequired?: boolean;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fieldName, allowedMimeTypes, maxSize = 5 * 1024 * 1024, isRequired = true } = options;
      const file = req.file || (req.files && req.files[fieldName]);

      if (isRequired && !file) {
        return next(new ApiError(400, `${fieldName} is required`));
      }

      if (!file) {
        return next();
      }

      // Handle single file
      if (!Array.isArray(file)) {
        if (allowedMimeTypes && !allowedMimeTypes.includes(file.mimetype)) {
          return next(
            new ApiError(400, `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`)
          );
        }

        if (file.size > maxSize) {
          return next(
            new ApiError(400, `File size exceeds the maximum allowed size of ${maxSize / (1024 * 1024)}MB`)
          );
        }
      } else {
        // Handle multiple files
        for (const f of file) {
          if (allowedMimeTypes && !allowedMimeTypes.includes(f.mimetype)) {
            return next(
              new ApiError(400, `Invalid file type for ${f.originalname}. Allowed types: ${allowedMimeTypes.join(', ')}`)
            );
          }

          if (f.size > maxSize) {
            return next(
              new ApiError(400, `File ${f.originalname} exceeds the maximum allowed size of ${maxSize / (1024 * 1024)}MB`)
            );
          }
        }
      }

      next();
    } catch (error) {
      logger.error('File validation error:', error);
      next(new ApiError(500, 'Error validating file upload'));
    }
  };
};

/**
 * Validate if a value is a valid MongoDB ObjectId
 */
const isValidObjectId = (value: string): boolean => {
  return patterns.objectId.test(value);
};

/**
 * Validate if a value is a valid email
 */
const isValidEmail = (value: string): boolean => {
  return patterns.email.test(value);
};

/**
 * Validate if a value is a valid URL
 */
const isValidUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch (error) {
    return false;
  }
};

export {
  Joi,
  patterns,
  messages,
  schemas,
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateFile,
  isValidObjectId,
  isValidEmail,
  isValidUrl,
};
