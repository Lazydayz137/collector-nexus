import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { ApiError } from './errorHandler';

// Custom validation middleware
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const errorMessages = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
    }));

    next(new ApiError(400, 'Validation failed', errorMessages));
  };
};

// Common validation rules
export const commonRules = {
  email: {
    isEmail: { errorMessage: 'Please provide a valid email address' },
    normalizeEmail: true,
  },
  password: {
    isLength: {
      options: { min: 8 },
      errorMessage: 'Password must be at least 8 characters long',
    },
  },
  name: {
    notEmpty: { errorMessage: 'Name is required' },
    isLength: {
      options: { min: 2, max: 50 },
      errorMessage: 'Name must be between 2 and 50 characters',
    },
  },
  objectId: {
    custom: {
      options: (value: string) => {
        if (!value || !/^[0-9a-fA-F]{24}$/.test(value)) {
          throw new Error('Invalid ID format');
        }
        return true;
      },
    },
  },
  tcg: {
    isIn: {
      options: [['mtg', 'ptcg']],
      errorMessage: 'TCG must be either MTG or PTCG',
    },
  },
  condition: {
    isIn: {
      options: [['NM', 'SP', 'MP', 'HP', 'DMG']],
      errorMessage: 'Invalid condition. Must be one of: NM, SP, MP, HP, DMG',
    },
  },
  priority: {
    isIn: {
      options: [['LOW', 'MEDIUM', 'HIGH']],
      errorMessage: 'Priority must be one of: LOW, MEDIUM, HIGH',
    },
  },
  notificationFrequency: {
    isIn: {
      options: [['DAILY', 'WEEKLY', 'IMMEDIATE']],
      errorMessage: 'Frequency must be one of: DAILY, WEEKLY, IMMEDIATE',
    },
  },
};

// Validation schemas
export const authValidation = {
  register: [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
    body('name').notEmpty().withMessage('Name is required'),
  ],
  login: [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
};

export const collectionValidation = {
  create: [
    body('name').notEmpty().withMessage('Collection name is required'),
    body('description').optional().isString(),
    body('isPublic').optional().isBoolean(),
    body('tcg').isIn(['mtg', 'ptcg']).withMessage('Invalid TCG type'),
    body('tags').optional().isArray(),
  ],
  update: [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('description').optional().isString(),
    body('isPublic').optional().isBoolean(),
    body('tags').optional().isArray(),
  ],
  addItem: [
    body('cardId').notEmpty().withMessage('Card ID is required'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('condition').optional().isIn(['NM', 'SP', 'MP', 'HP', 'DMG']),
    body('isFoil').optional().isBoolean(),
    body('isAltered').optional().isBoolean(),
    body('isSigned').optional().isBoolean(),
    body('isGraded').optional().isBoolean(),
    body('grade').optional().isString(),
    body('language').optional().isString(),
    body('purchasePrice').optional().isNumeric(),
    body('purchaseCurrency').optional().isString(),
    body('purchaseDate').optional().isISO8601(),
    body('notes').optional().isString(),
  ],
};

export const wishlistValidation = {
  create: [
    body('name').notEmpty().withMessage('Wishlist name is required'),
    body('description').optional().isString(),
    body('tcg').isIn(['mtg', 'ptcg']).withMessage('Invalid TCG type'),
    body('isPublic').optional().isBoolean(),
    body('notificationPreferences').optional().isObject(),
    body('notificationPreferences.email').optional().isBoolean(),
    body('notificationPreferences.push').optional().isBoolean(),
    body('notificationPreferences.priceDropPercentage')
      .optional()
      .isInt({ min: 1, max: 100 }),
    body('notificationPreferences.frequency')
      .optional()
      .isIn(['DAILY', 'WEEKLY', 'IMMEDIATE']),
  ],
  addItem: [
    body('cardId').notEmpty().withMessage('Card ID is required'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('maxPrice').optional().isNumeric(),
    body('condition').optional().isIn(['NM', 'SP', 'MP', 'HP', 'DMG']),
    body('isFoil').optional().isBoolean(),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']),
    body('notes').optional().isString(),
  ],
};

export const priceValidation = {
  updateCardPrice: [
    body('price').isNumeric().withMessage('Price must be a number'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('source').optional().isString(),
  ],
  getPriceTrends: [
    body('cardIds')
      .isArray({ min: 1 })
      .withMessage('At least one card ID is required'),
    body('cardIds.*').isString().withMessage('Invalid card ID format'),
    body('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
  ],
};
