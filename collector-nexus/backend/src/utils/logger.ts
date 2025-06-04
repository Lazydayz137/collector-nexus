import winston from 'winston';
import path from 'path';
import 'winston-daily-rotate-file';
import { format } from 'winston';
import { Request, Response } from 'express';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for different log levels
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Custom log format
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  format.colorize({ all: true }),
  format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Log file transport configuration
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(__dirname, '../../logs/application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: true,
});

// Error log file transport
const errorFileTransport = new winston.transports.DailyRotateFile({
  level: 'error',
  filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  zippedArchive: true,
});

// HTTP request log file transport
const httpFileTransport = new winston.transports.DailyRotateFile({
  level: 'http',
  filename: path.join(__dirname, '../../logs/http-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: true,
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  levels,
  format: logFormat,
  defaultMeta: { service: 'collectors-nexus-api' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    errorFileTransport,
    // Write all logs with level `http` and below to `http.log`
    httpFileTransport,
    // Write all logs with level `info` and below to `combined.log`
    fileRotateTransport,
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/exceptions.log'),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/rejections.log'),
    }),
  ],
  exitOnError: false, // Don't exit on handled exceptions
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      ),
    })
  );
}

// Log HTTP requests
const httpLogger = (req: Request, res: Response, next: () => void) => {
  // Skip logging for health checks and static files
  if (req.path === '/health' || req.path.startsWith('/static/')) {
    return next();
  }

  const start = Date.now();
  const { method, originalUrl, ip, headers } = req;

  // Log the incoming request
  logger.http(`[${method}] ${originalUrl} - IP: ${ip} - Started`);
  if (process.env.NODE_ENV === 'development' && Object.keys(req.body).length > 0) {
    logger.debug('Request Body:', JSON.stringify(req.body, null, 2));
  }

  // Log the response when it's finished
  res.on('finish', () => {
    const { statusCode } = res;
    const responseTime = Date.now() - start;
    const contentLength = res.get('content-length') || 0;

    let logLevel = 'http';
    if (statusCode >= 500) {
      logLevel = 'error';
    } else if (statusCode >= 400) {
      logLevel = 'warn';
    }

    const message = `[${method}] ${originalUrl} - ${statusCode} - ${responseTime}ms - ${contentLength}b`;
    
    logger.log({
      level: logLevel,
      message,
      meta: {
        method,
        url: originalUrl,
        status: statusCode,
        responseTime: `${responseTime}ms`,
        contentLength: `${contentLength}b`,
        ip,
        userAgent: headers['user-agent'],
        timestamp: new Date().toISOString(),
      },
    });
  });

  next();
};

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Optionally exit the process with a non-zero code
  // process.exit(1);
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Optionally exit the process with a non-zero code
  // process.exit(1);
});

export { logger, httpLogger };
