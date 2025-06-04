import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { ApiError } from './errorHandler';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      next();
    } catch (error) {
      console.error(error);
      throw new ApiError(401, 'Not authorized, token failed');
    }
  }

  if (!token) {
    throw new ApiError(401, 'Not authorized, no token');
  }
};

export const admin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403);
    throw new ApiError(403, 'Not authorized as an admin');
  }
};
