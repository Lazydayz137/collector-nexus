import { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import { promisify } from 'util';
import { ApiError } from '../middleware/errorHandler';

// Create Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 5) {
        console.error('Too many retries on Redis. Connection Terminated');
        return new Error('Too many retries on Redis. Connection Terminated');
      }
      return Math.min(retries * 100, 5000); // Reconnect after 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, 5000ms, etc.
    },
  },
});

// Promisify Redis methods
const getAsync = promisify(redisClient.get).bind(redisClient);
const setexAsync = promisify(redisClient.setex).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);
const flushAsync = promisify(redisClient.flushdb).bind(redisClient);

// Connect to Redis
const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Redis connection error:', error);
    // Don't throw error to allow the app to continue without cache
  }
};

// Middleware to cache responses
const cache = (duration: number = 300) => {
  return async (req: Request, res: any, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip cache for authenticated routes
    if (req.headers.authorization) {
      return next();
    }

    const key = `cache:${req.originalUrl || req.url}`;

    try {
      // Try to get cached data
      const cachedData = await getAsync(key);
      
      if (cachedData) {
        // If cached data exists, send it
        const data = JSON.parse(cachedData);
        return res.json(data);
      } else {
        // If not cached, override res.json to cache the response
        const originalJson = res.json;
        res.json = (body: any) => {
          // Only cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            setexAsync(key, duration, JSON.stringify(body));
          }
          return originalJson.call(res, body);
        };
        next();
      }
    } catch (error) {
      console.error('Cache error:', error);
      next();
    }
  };
};

// Invalidate cache for a specific key
const invalidateCache = async (key: string) => {
  try {
    if (!key.startsWith('cache:')) {
      key = `cache:${key}`;
    }
    await delAsync(key);
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
};

// Invalidate cache by pattern (supports wildcards)
const invalidateCacheByPattern = async (pattern: string) => {
  try {
    if (!pattern.startsWith('cache:')) {
      pattern = `cache:${pattern}`;
    }
    
    // Get all keys matching the pattern
    const keys = await new Promise<string[]>((resolve, reject) => {
      const stream = redisClient.scanStream({
        match: pattern,
        count: 100,
      });
      
      const keys: string[] = [];
      
      stream.on('data', (resultKeys: string[]) => {
        keys.push(...resultKeys);
      });
      
      stream.on('end', () => {
        resolve(keys);
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
    });
    
    // Delete all matching keys
    if (keys.length > 0) {
      await Promise.all(keys.map(key => delAsync(key)));
    }
    
    return keys.length;
  } catch (error) {
    console.error('Error invalidating cache by pattern:', error);
    return 0;
  }
};

// Clear all cache
const clearAllCache = async () => {
  try {
    await flushAsync();
    return true;
  } catch (error) {
    console.error('Error clearing all cache:', error);
    return false;
  }
};

// Cache response for a specific key
const cacheResponse = async (key: string, data: any, ttl: number = 300) => {
  try {
    if (!key.startsWith('cache:')) {
      key = `cache:${key}`;
    }
    await setexAsync(key, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Error caching response:', error);
    return false;
  }
};

// Get cached response
const getCachedResponse = async <T>(key: string): Promise<T | null> => {
  try {
    if (!key.startsWith('cache:')) {
      key = `cache:${key}`;
    }
    const data = await getAsync(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting cached response:', error);
    return null;
  }
};

export {
  connectRedis,
  cache,
  invalidateCache,
  invalidateCacheByPattern,
  clearAllCache,
  cacheResponse,
  getCachedResponse,
  redisClient,
};
