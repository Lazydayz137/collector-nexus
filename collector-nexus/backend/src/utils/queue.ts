import Queue, { Job, JobOptions, Queue as BullQueue, Worker, WorkerOptions } from 'bull';
import { logger } from './logger';
import { ApiError } from '../middleware/errorHandler';
import config from '../config';

// Redis connection options
const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  username: config.redis.username,
  tls: config.redis.tls ? {} : undefined,
  enableReadyCheck: true,
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
};

// Queue options
const defaultQueueOptions = {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 1000, // Keep last 1000 completed jobs
    removeOnFail: 5000, // Keep last 5000 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s, etc.
    },
  },
  settings: {
    // Prevent job stalling
    stalledInterval: 30000, // Check for stalled jobs every 30s
    maxStalledCount: 1, // Mark job as failed after 1 stall
    lockDuration: 300000, // 5 minute lock duration
    lockRenewTime: 150000, // Renew lock every 2.5 minutes
  },
};

// Worker options
const defaultWorkerOptions: WorkerOptions = {
  concurrency: 5,
  lockDuration: 300000, // 5 minute lock duration
  lockRenewTime: 150000, // Renew lock every 2.5 minutes
};

// Job data interface
export interface JobData<T = any> {
  id?: string;
  name: string;
  data: T;
  options?: JobOptions;
}

// Job result interface
export interface JobResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  jobId?: string;
  name?: string;
  timestamp?: Date;
}

// Job handler type
type JobHandler<T = any, R = any> = (data: T, job: Job) => Promise<R>;

// Map to store job handlers
const jobHandlers = new Map<string, JobHandler>();

// Map to store queues
const queues = new Map<string, BullQueue>();

/**
 * Create or get a queue
 */
function createQueue<T = any>(name: string): BullQueue<T> {
  if (queues.has(name)) {
    return queues.get(name)!;
  }

  const queue = new Queue(name, defaultQueueOptions);
  queues.set(name, queue);

  // Log queue events
  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  queue.on('waiting', (jobId) => {
    logger.debug(`Job ${jobId} is waiting in queue ${name}`);
  });

  queue.on('active', (job) => {
    logger.debug(`Job ${job.id} is now active in queue ${name}`);
  });

  queue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed in queue ${name}`, { result });
  });

  queue.on('failed', (job, error) => {
    logger.error(`Job ${job?.id} failed in queue ${name}:`, error);
  });

  queue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} in queue ${name} has stalled`);
  });

  queue.on('paused', () => {
    logger.info(`Queue ${name} is paused`);
  });

  queue.on('resumed', () => {
    logger.info(`Queue ${name} is resumed`);
  });

  queue.on('cleaned', (jobs, type) => {
    logger.info(`Cleaned ${jobs.length} ${type} jobs from queue ${name}`);
  });

  return queue;
}

/**
 * Register a job handler
 */
export function registerJobHandler<T = any, R = any>(
  name: string,
  handler: JobHandler<T, R>,
  options: WorkerOptions = {}
): void {
  if (jobHandlers.has(name)) {
    logger.warn(`Job handler for ${name} is already registered`);
    return;
  }

  jobHandlers.set(name, handler);
  
  // Create a worker for this job type
  const workerOptions = { ...defaultWorkerOptions, ...options };
  const queue = createQueue(name);
  
  const worker = new Worker(
    name,
    async (job: Job) => {
      try {
        logger.info(`Processing job ${job.id} of type ${name}`, { job: job.data });
        
        // Execute the job handler
        const result = await handler(job.data, job);
        
        logger.info(`Job ${job.id} completed successfully`, { result });
        return { success: true, data: result };
      } catch (error) {
        logger.error(`Job ${job.id} failed:`, error);
        
        // Check if we should retry
        const willRetry = job.attemptsMade < (job.opts.attempts || 3);
        
        if (willRetry) {
          logger.info(`Job ${job.id} will be retried (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3})`);
        } else {
          logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts`, { error });
        }
        
        // Re-throw to let Bull handle the retry logic
        throw error;
      }
    },
    workerOptions
  );

  // Worker event handlers
  worker.on('completed', (job, result) => {
    logger.info(`Worker completed job ${job.id} in queue ${name}`, { result });
  });

  worker.on('failed', (job, error) => {
    logger.error(`Worker failed job ${job?.id} in queue ${name}:`, error);
  });

  worker.on('error', (error) => {
    logger.error(`Worker error in queue ${name}:`, error);
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`Worker stalled job ${jobId} in queue ${name}`);
  });
}

/**
 * Add a job to the queue
 */
export async function addJob<T = any, R = any>(
  jobData: JobData<T>
): Promise<Job<JobResult<R>>> {
  const { name, data, options } = jobData;
  
  try {
    const queue = createQueue<T>(name);
    
    // Add the job to the queue
    const job = await queue.add(data, {
      ...defaultQueueOptions.defaultJobOptions,
      ...options,
      jobId: jobData.id, // Use provided ID if available
    });
    
    logger.info(`Added job ${job.id} to queue ${name}`, { data });
    
    return job as unknown as Job<JobResult<R>>;
  } catch (error) {
    logger.error(`Failed to add job to queue ${name}:`, error);
    throw new ApiError(500, `Failed to add job to queue: ${error.message}`);
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string, queueName: string): Promise<{
  id: string;
  name: string;
  status: string;
  progress: number;
  result?: any;
  error?: string;
  timestamp?: Date;
  attemptsMade: number;
  failedReason?: string;
  stacktrace?: string[];
  returnvalue?: any;
  data?: any;
}> {
  try {
    const queue = createQueue(queueName);
    const job = await queue.getJob(jobId);
    
    if (!job) {
      throw new ApiError(404, `Job ${jobId} not found in queue ${queueName}`);
    }
    
    const state = await job.getState();
    
    return {
      id: job.id.toString(),
      name: queueName,
      status: state,
      progress: job.progress(),
      result: job.returnvalue,
      error: job.failedReason,
      timestamp: job.processedOn ? new Date(job.processedOn) : undefined,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      returnvalue: job.returnvalue,
      data: job.data,
    };
  } catch (error) {
    logger.error(`Failed to get job status ${jobId} from queue ${queueName}:`, error);
    throw new ApiError(500, `Failed to get job status: ${error.message}`);
  }
}

/**
 * Get queue metrics
 */
export async function getQueueMetrics(queueName: string): Promise<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  isPaused: boolean;
}> {
  try {
    const queue = createQueue(queueName);
    const [counts, isPaused] = await Promise.all([
      queue.getJobCounts(),
      queue.isPaused(),
    ]);
    
    return {
      name: queueName,
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: isPaused,
      isPaused,
    };
  } catch (error) {
    logger.error(`Failed to get metrics for queue ${queueName}:`, error);
    throw new ApiError(500, `Failed to get queue metrics: ${error.message}`);
  }
}

/**
 * Pause a queue
 */
export async function pauseQueue(queueName: string): Promise<boolean> {
  try {
    const queue = createQueue(queueName);
    await queue.pause();
    return true;
  } catch (error) {
    logger.error(`Failed to pause queue ${queueName}:`, error);
    throw new ApiError(500, `Failed to pause queue: ${error.message}`);
  }
}

/**
 * Resume a queue
 */
export async function resumeQueue(queueName: string): Promise<boolean> {
  try {
    const queue = createQueue(queueName);
    await queue.resume();
    return true;
  } catch (error) {
    logger.error(`Failed to resume queue ${queueName}:`, error);
    throw new ApiError(500, `Failed to resume queue: ${error.message}`);
  }
}

/**
 * Clean a queue
 */
export async function cleanQueue(
  queueName: string,
  graceTimeMs: number = 1000 * 60 * 60, // 1 hour
  limit: number = 1000,
  type: 'completed' | 'wait' | 'active' | 'delayed' | 'failed' = 'completed'
): Promise<number> {
  try {
    const queue = createQueue(queueName);
    const jobs = await queue.clean(graceTimeMs, limit, type);
    return jobs.length;
  } catch (error) {
    logger.error(`Failed to clean queue ${queueName}:`, error);
    throw new ApiError(500, `Failed to clean queue: ${error.message}`);
  }
}

/**
 * Remove a job from the queue
 */
export async function removeJob(jobId: string, queueName: string): Promise<boolean> {
  try {
    const queue = createQueue(queueName);
    const job = await queue.getJob(jobId);
    
    if (!job) {
      throw new ApiError(404, `Job ${jobId} not found in queue ${queueName}`);
    }
    
    await job.remove();
    return true;
  } catch (error) {
    logger.error(`Failed to remove job ${jobId} from queue ${queueName}:`, error);
    throw new ApiError(500, `Failed to remove job: ${error.message}`);
  }
}

/**
 * Process a job immediately in the current process (for testing/debugging)
 */
export async function processJobImmediately<T = any, R = any>(
  jobData: JobData<T>,
  handler: JobHandler<T, R>
): Promise<JobResult<R>> {
  const { name, data } = jobData;
  
  try {
    logger.info(`Processing job ${name} immediately`, { data });
    
    // Create a mock job object
    const mockJob = {
      id: 'immediate',
      data,
      progress: () => {},
      log: (message: string) => logger.info(`[${name}] ${message}`),
      updateProgress: (progress: number) => {
        logger.debug(`Job ${name} progress: ${progress}%`);
      },
    };
    
    // Execute the handler
    const result = await handler(data, mockJob as any);
    
    return {
      success: true,
      data: result,
      jobId: 'immediate',
      name,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error(`Error processing job ${name} immediately:`, error);
    
    return {
      success: false,
      error: error.message,
      jobId: 'immediate',
      name,
      timestamp: new Date(),
    };
  }
}

// Export the queue utility
export default {
  registerJobHandler,
  addJob,
  getJobStatus,
  getQueueMetrics,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  removeJob,
  processJobImmediately,
};
