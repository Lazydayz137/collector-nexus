import { DataSource, DataSourceConfig, FetchOptions, FetchResult } from './sources';
import { logger } from '../../utils/logger';
import { ApiError } from '../../middleware/errorHandler';

export class DataSourceManager {
  private static instance: DataSourceManager;
  private sources: Map<string, DataSource> = new Map();
  private defaultSource: string | null = null;
  private initialized: boolean = false;

  private constructor() {}

  /**
   * Get the singleton instance of DataSourceManager
   */
  public static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  /**
   * Initialize the data source manager
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize all registered sources
      const initPromises = Array.from(this.sources.values()).map(source => 
        source.initialize().catch(error => {
          logger.error(`Failed to initialize data source ${source.id}:`, error);
          return null;
        })
      );

      await Promise.all(initPromises);
      this.initialized = true;
      
      logger.info(`Data source manager initialized with ${this.sources.size} sources`);
    } catch (error) {
      logger.error('Failed to initialize data source manager:', error);
      throw new ApiError(500, 'Failed to initialize data source manager');
    }
  }

  /**
   * Register a new data source
   */
  public registerSource(source: DataSource, setAsDefault: boolean = false): void {
    if (this.sources.has(source.id)) {
      logger.warn(`Data source with ID '${source.id}' already exists. Overwriting.`);
    }

    this.sources.set(source.id, source);
    
    if (setAsDefault || this.sources.size === 1) {
      this.setDefaultSource(source.id);
    }
    
    logger.info(`Registered data source: ${source.name} (${source.id})`);
  }

  /**
   * Get a data source by ID
   */
  public getSource(id: string): DataSource | undefined {
    return this.sources.get(id);
  }

  /**
   * Get all registered data sources
   */
  public getAllSources(): DataSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Remove a data source by ID
   */
  public async removeSource(id: string): Promise<boolean> {
    const source = this.sources.get(id);
    
    if (!source) {
      return false;
    }

    try {
      await source.close();
      this.sources.delete(id);
      
      // If we removed the default source, set a new default if available
      if (this.defaultSource === id) {
        this.defaultSource = this.sources.size > 0 ? this.sources.keys().next().value : null;
      }
      
      logger.info(`Removed data source: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to remove data source ${id}:`, error);
      return false;
    }
  }

  /**
   * Set the default data source
   */
  public setDefaultSource(id: string): boolean {
    if (!this.sources.has(id)) {
      logger.warn(`Cannot set default source: Data source '${id}' not found`);
      return false;
    }
    
    this.defaultSource = id;
    logger.info(`Set default data source: ${id}`);
    return true;
  }

  /**
   * Get the default data source
   */
  public getDefaultSource(): DataSource | undefined {
    if (!this.defaultSource) {
      return undefined;
    }
    return this.sources.get(this.defaultSource);
  }

  /**
   * Fetch data from a specific source or all sources
   */
  public async fetch(
    sourceId?: string,
    options: FetchOptions = {}
  ): Promise<FetchResult[]> {
    await this.ensureInitialized();
    
    if (sourceId) {
      const source = this.sources.get(sourceId);
      if (!source) {
        throw new ApiError(404, `Data source '${sourceId}' not found`);
      }
      
      const result = await source.fetch(options);
      return [result];
    }
    
    // Fetch from all sources in parallel
    const fetchPromises = Array.from(this.sources.values()).map(source =>
      source.fetch(options).catch(error => ({
        data: [],
        total: 0,
        limit: options.limit || 0,
        offset: options.offset || 0,
        hasMore: false,
        source: source.id,
        error: error.message,
      }))
    );
    
    return Promise.all(fetchPromises);
  }

  /**
   * Fetch an item by ID from a specific source or try all sources
   */
  public async fetchById(
    id: string,
    sourceId?: string
  ): Promise<{ source: string; data: any } | null> {
    await this.ensureInitialized();
    
    if (sourceId) {
      const source = this.sources.get(sourceId);
      if (!source) {
        throw new ApiError(404, `Data source '${sourceId}' not found`);
      }
      
      const item = await source.fetchById(id);
      return item ? { source: sourceId, data: item } : null;
    }
    
    // Try all sources until we find the item
    for (const [sourceId, source] of this.sources.entries()) {
      try {
        const item = await source.fetchById(id);
        if (item) {
          return { source: sourceId, data: item };
        }
      } catch (error) {
        logger.error(`Error fetching item ${id} from ${sourceId}:`, error);
        // Continue to the next source
      }
    }
    
    return null;
  }

  /**
   * Fetch multiple items by their IDs from a specific source
   */
  public async fetchBatch(
    ids: string[],
    sourceId?: string
  ): Promise<{ source: string; data: any[] }[]> {
    await this.ensureInitialized();
    
    if (sourceId) {
      const source = this.sources.get(sourceId);
      if (!source) {
        throw new ApiError(404, `Data source '${sourceId}' not found`);
      }
      
      const items = await source.fetchBatch(ids);
      return [{ source: sourceId, data: items }];
    }
    
    // Fetch from all sources in parallel
    const fetchPromises = Array.from(this.sources.entries()).map(([srcId, source]) =>
      source.fetchBatch(ids)
        .then(data => ({ source: srcId, data }))
        .catch(error => {
          logger.error(`Error fetching batch from ${srcId}:`, error);
          return { source: srcId, data: [], error: error.message };
        })
    );
    
    return Promise.all(fetchPromises);
  }

  /**
   * Get the status of all data sources
   */
  public async getStatus() {
    const statusPromises = Array.from(this.sources.entries()).map(
      async ([id, source]) => {
        try {
          const status = await source.getStatus();
          return { id, ...status };
        } catch (error) {
          return {
            id,
            status: 'error',
            message: `Failed to get status: ${error.message}`,
            error: error.stack,
          };
        }
      }
    );
    
    const statuses = await Promise.all(statusPromises);
    
    return {
      timestamp: new Date(),
      sources: statuses,
      defaultSource: this.defaultSource,
    };
  }

  /**
   * Close all data sources and clean up
   */
  public async close(): Promise<void> {
    const closePromises = Array.from(this.sources.values()).map(source =>
      source.close().catch(error =>
        logger.error(`Error closing data source ${source.id}:`, error)
      )
    );
    
    await Promise.all(closePromises);
    this.sources.clear();
    this.defaultSource = null;
    this.initialized = false;
    
    logger.info('Closed all data sources');
  }

  /**
   * Ensure the manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export a singleton instance
export const dataSourceManager = DataSourceManager.getInstance();

export default dataSourceManager;
