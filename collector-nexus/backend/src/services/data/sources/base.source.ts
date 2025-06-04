import { DataRecord } from '../acquisition.service';

export interface DataSourceConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  rateLimit?: {
    requests: number;
    perSeconds: number;
  };
  [key: string]: any;
}

export interface FetchOptions {
  query?: string;
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  sort?: Record<string, 1 | -1>;
  [key: string]: any;
}

export interface FetchResult<T = any> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  source: string;
  metadata: Record<string, any>;
}

export interface DataSource {
  // Source identification
  readonly id: string;
  readonly name: string;
  readonly type: string;
  
  // Configuration
  readonly config: DataSourceConfig;
  
  // Lifecycle methods
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // Data operations
  fetch(options?: FetchOptions): Promise<FetchResult>;
  fetchById(id: string): Promise<DataRecord | null>;
  fetchBatch(ids: string[]): Promise<DataRecord[]>;
  
  // Status and health
  isAvailable(): Promise<boolean>;
  getStatus(): Promise<{
    status: 'ok' | 'degraded' | 'unavailable';
    message?: string;
    metrics?: Record<string, any>;
  }>;
  
  // Rate limiting
  getRateLimitStatus(): Promise<{
    remaining: number;
    limit: number;
    resetAt: Date;
  } | null>;
}
