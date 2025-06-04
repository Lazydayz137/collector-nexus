import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import { User, IUser } from '../models/User';
import { ApiError } from '../middleware/errorHandler';
import { logger } from './logger';
import config from '../config';

// Promisify JWT functions
const verifyJwt = promisify<string, string, any>(jwt.verify);
const signJwt = promisify(jwt.sign);

// Token types
type TokenType = 'access' | 'refresh' | 'resetPassword' | 'verifyEmail';

// Token payload interface
interface TokenPayload {
  userId: string;
  type: TokenType;
  [key: string]: any;
}

/**
 * Generate a JWT token
 */
const generateToken = async (
  userId: string,
  type: TokenType,
  options: { expiresIn?: string | number; [key: string]: any } = {}
): Promise<string> => {
  const { expiresIn, ...payload } = options;
  
  // Set default expiration based on token type
  let tokenExpiresIn = expiresIn;
  if (!tokenExpiresIn) {
    switch (type) {
      case 'access':
        tokenExpiresIn = config.jwt.accessExpirationMinutes + 'm';
        break;
      case 'refresh':
        tokenExpiresIn = config.jwt.refreshExpirationDays + 'd';
        break;
      case 'resetPassword':
        tokenExpiresIn = config.jwt.resetPasswordExpirationMinutes + 'm';
        break;
      case 'verifyEmail':
        tokenExpiresIn = config.jwt.verifyEmailExpirationMinutes + 'm';
        break;
      default:
        tokenExpiresIn = '15m';
    }
  }
  
  try {
    const token = await signJwt(
      { userId, type, ...payload } as TokenPayload,
      config.jwt.secret,
      { expiresIn: tokenExpiresIn }
    ) as string;
    
    return token;
  } catch (error) {
    logger.error('Error generating token:', error);
    throw new ApiError(500, 'Error generating authentication token');
  }
};

/**
 * Verify a JWT token
 */
const verifyToken = async <T extends TokenPayload>(
  token: string,
  type: TokenType
): Promise<T> => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }
    
    const payload = await verifyJwt(token, config.jwt.secret) as T;
    
    // Verify token type
    if (payload.type !== type) {
      throw new Error(`Invalid token type: expected ${type}`);
    }
    
    return payload;
  } catch (error) {
    logger.error('Token verification failed:', error);
    
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, 'Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError(401, 'Invalid token');
    }
    
    throw new ApiError(401, 'Authentication failed');
  }
};

/**
 * Middleware to authenticate requests using JWT
 */
const authenticate = (roles: string[] = []) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ApiError(401, 'Authentication required');
      }
      
      const token = authHeader.split(' ')[1];
      
      // Verify token
      const payload = await verifyToken<TokenPayload & { role?: string }>(token, 'access');
      
      // Check if user exists
      const user = await User.findById(payload.userId).select('-password');
      if (!user) {
        throw new ApiError(401, 'User not found');
      }
      
      // Check if user account is active
      if (!user.isActive) {
        throw new ApiError(403, 'Account is deactivated');
      }
      
      // Check if password was changed after token was issued
      if (user.passwordChangedAt) {
        const changedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (payload.iat && payload.iat < changedTimestamp) {
          throw new ApiError(401, 'Password was changed. Please log in again.');
        }
      }
      
      // Check user role if required
      if (roles.length > 0 && !roles.includes(user.role)) {
        throw new ApiError(403, 'Insufficient permissions');
      }
      
      // Attach user to request object
      req.user = user;
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if the user has the required permissions
 */
const authorize = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as IUser;
      
      if (!user) {
        throw new ApiError(401, 'Authentication required');
      }
      
      // Check if user has all required permissions
      const hasAllPermissions = requiredPermissions.every(permission => 
        user.permissions?.includes(permission)
      );
      
      if (!hasAllPermissions) {
        throw new ApiError(403, 'Insufficient permissions');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if the user is the owner of the resource
 */
const isOwner = (model: any, paramName: string = 'id') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as IUser;
      const resourceId = req.params[paramName];
      
      if (!user) {
        throw new ApiError(401, 'Authentication required');
      }
      
      // Admins can access any resource
      if (user.role === 'admin') {
        return next();
      }
      
      // Find the resource
      const resource = await model.findById(resourceId);
      
      if (!resource) {
        throw new ApiError(404, 'Resource not found');
      }
      
      // Check if the user is the owner of the resource
      if (resource.user && resource.user.toString() !== user.id) {
        throw new ApiError(403, 'Not authorized to access this resource');
      }
      
      // If the resource has a userId field
      if (resource.userId && resource.userId.toString() !== user.id) {
        throw new ApiError(403, 'Not authorized to access this resource');
      }
      
      // Attach the resource to the request for later use
      req.resource = resource;
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Generate a random token for password reset or email verification
 */
const generateRandomToken = (length: number = 32): string => {
  return require('crypto')
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * Hash a password using bcrypt
 */
const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * Compare a password with a hash
 */
const comparePasswords = async (password: string, hash: string): Promise<boolean> => {
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(password, hash);
};

export {
  generateToken,
  verifyToken,
  authenticate,
  authorize,
  isOwner,
  generateRandomToken,
  hashPassword,
  comparePasswords,
  TokenType,
  TokenPayload,
};
