import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { rateLimitExceededResponse } from '../utils/apiResponse';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100; // Limit each IP to 100 requests per windowMs
const RATE_LIMIT_MESSAGE = 'Too many requests from this IP, please try again later';

// Create the rate limiter middleware
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: RATE_LIMIT_MESSAGE,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    return rateLimitExceededResponse(res);
  },
});

// More strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    return rateLimitExceededResponse(res, 'Too many login attempts, please try again later');
  },
});

// Rate limiter for public APIs (more lenient)
export const publicApiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Limit each IP to 1000 requests per hour
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for admin endpoints (stricter)
export const adminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Limit each IP to 100 requests per hour
  message: 'Too many admin requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Dynamic rate limiter based on user role
export const dynamicRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Apply different rate limits based on user role
  if (req.user && req.user.role === 'admin') {
    return adminLimiter(req, res, next);
  } else if (req.user) {
    return apiLimiter(req, res, next);
  } else {
    return publicApiLimiter(req, res, next);
  }
};

// Rate limiter for file uploads
export const fileUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 file uploads per hour
  message: 'Too many file uploads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for password reset endpoints
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 password reset requests per hour
  message: 'Too many password reset attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for contact form submissions
export const contactFormLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // Limit each IP to 10 contact form submissions per day
  message: 'Too many contact form submissions, please try again tomorrow',
  standardHeaders: true,
  legacyHeaders: false,
});
