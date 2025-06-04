import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

// Load environment variables from .env file
const envPath = path.resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn('.env file not found. Using system environment variables.');
}

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'MONGODB_DATABASE',
  'REDIS_HOST',
  'REDIS_PORT',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Application configuration
export const appConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  name: process.env.APP_NAME || 'CollectorsNexus',
  version: process.env.APP_VERSION || '1.0.0',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
  isTest: process.env.NODE_ENV === 'test',
};

// Database configuration
export const dbConfig = {
  uri: process.env.MONGODB_URI!,
  database: process.env.MONGODB_DATABASE!,
  username: process.env.MONGODB_USERNAME,
  password: process.env.MONGODB_PASSWORD,
  authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    retryWrites: true,
    w: 'majority',
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    connectTimeoutMS: 10000,
  },
};

// Redis configuration
export const redisConfig = {
  host: process.env.REDIS_HOST!,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true',
  keyPrefix: 'collectors_nexus:',
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    console.error('Redis connection error:', err);
    return false;
  },
};

// API configuration
export const apiConfig = {
  prefix: process.env.API_PREFIX || '/api/v1',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    methods: process.env.CORS_METHODS?.split(',') || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS?.split(',') || ['Content-Type', 'Authorization'],
    credentials: true,
  },
};

// Logging configuration
export const logConfig = {
  level: process.env.LOG_LEVEL || 'info',
  toFile: process.env.LOG_TO_FILE === 'true',
  directory: process.env.LOG_DIRECTORY || 'logs',
  maxSize: '20m',
  maxFiles: '14d',
  timestamp: 'YYYY-MM-DD HH:mm:ss',
};

// Authentication configuration
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  passwordSaltRounds: 10,
};

// File upload configuration
export const uploadConfig = {
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
  uploadDirectory: process.env.UPLOAD_DIRECTORY || 'uploads',
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/zip',
  ],
};

// Data processing configuration
export const dataProcessingConfig = {
  batchSize: parseInt(process.env.BATCH_PROCESSING_SIZE || '100', 10),
  maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000', 10),
};

// External APIs configuration
export const externalApis = {
  ebay: {
    apiKey: process.env.EBAY_API_KEY!,
    apiSecret: process.env.EBAY_API_SECRET!,
    endpoint: process.env.EBAY_API_ENDPOINT || 'https://api.ebay.com',
    marketplaceId: 'EBAY-US',
    compatibilityLevel: 967,
    siteId: 0, // US
    trackingId: 'your_tracking_id',
  },
  // Add other external APIs here
};

// Feature flags
export const featureFlags = {
  maintenanceMode: process.env.FEATURE_MAINTENANCE_MODE === 'true',
  analytics: process.env.FEATURE_ANALYTICS === 'true',
  // Add other feature flags here
};

// Export all configurations
export default {
  app: appConfig,
  db: dbConfig,
  redis: redisConfig,
  api: apiConfig,
  log: logConfig,
  auth: authConfig,
  upload: uploadConfig,
  dataProcessing: dataProcessingConfig,
  externalApis,
  features: featureFlags,
};
