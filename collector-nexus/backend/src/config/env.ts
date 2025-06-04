import dotenv from 'dotenv';
import path from 'path';
import Joi from 'joi';
import { logger } from '../utils/logger';

// Load environment variables from .env file
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});

// Define the schema for environment variables
const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    PORT: Joi.number().default(5000),
    
    // MongoDB
    MONGODB_URI: Joi.string().required().description('MongoDB connection URL'),
    
    // JWT
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('Minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('Days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number().default(10).description('Minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number().default(1440).description('Minutes after which verify email token expires'),
    
    // SMTP
    SMTP_HOST: Joi.string().description('Server that will send the emails'),
    SMTP_PORT: Joi.number().description('Port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('Username for email server'),
    SMTP_PASSWORD: Joi.string().description('Password for email server'),
    EMAIL_FROM: Joi.string().description('The from field in the emails sent by the app'),
    
    // AWS S3
    AWS_ACCESS_KEY_ID: Joi.string().description('AWS access key ID'),
    AWS_SECRET_ACCESS_KEY: Joi.string().description('AWS secret access key'),
    AWS_REGION: Joi.string().description('AWS region'),
    AWS_S3_BUCKET: Joi.string().description('AWS S3 bucket name'),
    
    // Redis
    REDIS_URL: Joi.string().description('Redis connection URL'),
    
    // Frontend URL (for CORS and email links)
    FRONTEND_URL: Joi.string().default('http://localhost:3000').description('Frontend URL'),
    
    // API
    API_BASE_URL: Joi.string().default('http://localhost:5000/api').description('API base URL'),
    
    // Logging
    LOG_LEVEL: Joi.string().default('info').description('Log level (error, warn, info, http, debug)'),
    
    // Rate limiting
    RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000).description('Rate limit window in milliseconds'),
    RATE_LIMIT_MAX: Joi.number().default(100).description('Max requests per window per IP'),
    
    // CORS
    CORS_ORIGIN: Joi.string().default('*').description('CORS allowed origins'),
    
    // Sentry
    SENTRY_DSN: Joi.string().description('Sentry DSN for error tracking'),
    
    // Google OAuth
    GOOGLE_CLIENT_ID: Joi.string().description('Google OAuth client ID'),
    GOOGLE_CLIENT_SECRET: Joi.string().description('Google OAuth client secret'),
    
    // Facebook OAuth
    FACEBOOK_APP_ID: Joi.string().description('Facebook OAuth app ID'),
    FACEBOOK_APP_SECRET: Joi.string().description('Facebook OAuth app secret'),
  })
  .unknown();

// Validate environment variables
const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: 'key' } })
  .validate(process.env);

// Throw an error if validation fails
if (error) {
  const errorMessage = `Config validation error: ${error.message}`;
  logger.error(errorMessage);
  throw new Error(errorMessage);
}

// Export validated environment variables
export default {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  
  // MongoDB
  mongoose: {
    url: envVars.MONGODB_URI + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Remove this in production
      // autoIndex: envVars.NODE_ENV !== 'production',
    },
  },
  
  // JWT
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  
  // SMTP
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM || 'noreply@collectorsnexus.com',
  },
  
  // AWS
  aws: {
    accessKeyId: envVars.AWS_ACCESS_KEY_ID,
    secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
    region: envVars.AWS_REGION,
    s3: {
      bucket: envVars.AWS_S3_BUCKET,
    },
  },
  
  // Redis
  redis: {
    url: envVars.REDIS_URL,
  },
  
  // Frontend
  frontend: {
    url: envVars.FRONTEND_URL,
  },
  
  // API
  api: {
    baseUrl: envVars.API_BASE_URL,
  },
  
  // Logging
  logging: {
    level: envVars.LOG_LEVEL,
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    max: envVars.RATE_LIMIT_MAX,
  },
  
  // CORS
  cors: {
    origin: envVars.CORS_ORIGIN,
  },
  
  // Sentry
  sentry: {
    dsn: envVars.SENTRY_DSN,
  },
  
  // OAuth
  oauth: {
    google: {
      clientId: envVars.GOOGLE_CLIENT_ID,
      clientSecret: envVars.GOOGLE_CLIENT_SECRET,
    },
    facebook: {
      clientId: envVars.FACEBOOK_APP_ID,
      clientSecret: envVars.FACEBOOK_APP_SECRET,
    },
  },
};
