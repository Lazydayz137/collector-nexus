import { EventEmitter } from 'events';
import { logger } from '../../../../utils/logger';
import { MTGDataSource, createScryfallSource, createMTGJSONSource, createCardTraderSource } from './index';
import { DataSource, DataSourceConfig } from '../base.source';

export interface MTGSourceManagerConfig {
  sources?: {
    scryfall?: boolean | DataSourceConfig;
    mtgjson?: boolean | DataSourceConfig;
    cardtrader?: boolean | DataSourceConfig;
  };
  defaultSource?: 'scryfall' | 'mtgjson' | 'cardtrader';
  syncInterval?: number;
}

export class MTGSourceManager extends EventEmitter {
  private static instance: MTGSourceManager;
  private sources: Map<string, MTGDataSource> = new Map();
  private defaultSourceId: string = 'scryfall';
  private syncInterval: number = 24 * 60 * 60 * 1000; // 24 hours
  private syncTimer?: NodeJS.Timeout;

  private constructor(config: MTGSourceManagerConfig = {}) {
    super();
    this.initializeSources(config);
    this.setDefaultSource(config.defaultSource || 'scryfall');
    
    if (config.syncInterval) {
      this.syncInterval = config.syncInterval;
    }
  }

  public static getInstance(config: MTGSourceManagerConfig = {}): MTGSourceManager {
    if (!MTGSourceManager.instance) {
      MTGSourceManager.instance = new MTGSourceManager(config);
    }
    return MTGSourceManager.instance;
  }

  private async initializeSources(config: MTGSourceManagerConfig): Promise<void> {
    const { sources = {} } = config;
    
    try {
      // Initialize Scryfall if enabled
      if (sources.scryfall !== false) {
        const scryfallConfig = typeof sources.scryfall === 'object' ? sources.scryfall : {};
        const scryfall = createScryfallSource({
          id: 'scryfall',
          name: 'Scryfall',
          ...scryfallConfig,
        });
        
        await scryfall.initialize();
        this.sources.set('scryfall', scryfall);
        logger.info('Scryfall data source initialized');
      }
      
      // Initialize MTGJSON if enabled
      if (sources.mtgjson !== false) {
        const mtgjsonConfig = typeof sources.mtgjson === 'object' ? sources.mtgjson : {};
        const mtgjson = createMTGJSONSource({
          id: 'mtgjson',
          name: 'MTGJSON',
          ...mtgjsonConfig,
        });
        
        await mtgjson.initialize();
        this.sources.set('mtgjson', mtgjson);
        logger.info('MTGJSON data source initialized');
      }
      
      // Initialize CardTrader if enabled and credentials are provided
      if (sources.cardtrader) {
        const cardtraderConfig = typeof sources.cardtrader === 'object' ? sources.cardtrader : {};
        
        // Check for required CardTrader credentials
        if (!cardtraderConfig.clientId || !cardtraderConfig.clientSecret) {
          logger.warn('CardTrader client ID and secret are required to initialize CardTrader source');
        } else {
          const cardtrader = createCardTraderSource({
            id: 'cardtrader',
            name: 'CardTrader',
            ...cardtraderConfig,
          });
          
          await cardtrader.initialize();
          this.sources.set('cardtrader', cardtrader);
          logger.info('CardTrader data source initialized');
        }
      }
      
      // Start sync if we have any sources
      if (this.sources.size > 0) {
        this.startSync();
      }
    } catch (error) {
      logger.error('Failed to initialize MTG data sources:', error);
      throw error;
    }
  }

  public setDefaultSource(sourceId: string): void {
    if (this.sources.has(sourceId)) {
      this.defaultSourceId = sourceId;
    } else {
      logger.warn(`Cannot set default source to ${sourceId}: source not found`);
    }
  }

  public getDefaultSource(): MTGDataSource | undefined {
    return this.sources.get(this.defaultSourceId);
  }

  public getSource(sourceId: string): MTGDataSource | undefined {
    return this.sources.get(sourceId);
  }

  public getAllSources(): MTGDataSource[] {
    return Array.from(this.sources.values());
  }

  public async addSource(source: MTGDataSource, setAsDefault: boolean = false): Promise<void> {
    try {
      await source.initialize();
      this.sources.set(source.id, source);
      
      if (setAsDefault) {
        this.defaultSourceId = source.id;
      }
      
      logger.info(`Added data source: ${source.name} (${source.id})`);
      this.emit('source:added', source);
    } catch (error) {
      logger.error(`Failed to add data source ${source.id}:`, error);
      throw error;
    }
  }

  public removeSource(sourceId: string): boolean {
    const source = this.sources.get(sourceId);
    if (!source) return false;
    
    // Don't allow removing the default source if it's the last one
    if (this.sources.size === 1) {
      logger.warn('Cannot remove the last data source');
      return false;
    }
    
    // If removing the default source, set a new default
    if (sourceId === this.defaultSourceId) {
      const newDefault = Array.from(this.sources.keys()).find(id => id !== sourceId);
      if (newDefault) {
        this.defaultSourceId = newDefault;
      }
    }
    
    source.close().catch(error => {
      logger.error(`Error closing data source ${sourceId}:`, error);
    });
    
    this.sources.delete(sourceId);
    this.emit('source:removed', source);
    return true;
  }

  public async syncAllData(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    for (const [id, source] of this.sources.entries()) {
      try {
        logger.info(`Starting data sync for ${id}...`);
        const result = await source.syncAllData();
        results[id] = result;
        logger.info(`Data sync completed for ${id}`, result);
      } catch (error) {
        logger.error(`Error syncing data for ${id}:`, error);
        results[id] = { success: false, error: error.message };
      }
    }
    
    this.emit('sync:complete', results);
    return results;
  }

  public async syncPrices(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    for (const [id, source] of this.sources.entries()) {
      try {
        logger.info(`Starting price sync for ${id}...`);
        const result = await source.syncPrices();
        results[id] = result;
        logger.info(`Price sync completed for ${id}`, result);
      } catch (error) {
        logger.error(`Error syncing prices for ${id}:`, error);
        results[id] = { success: false, error: error.message };
      }
    }
    
    this.emit('sync:prices:complete', results);
    return results;
  }

  public startSync(interval: number = this.syncInterval): void {
    this.stopSync(); // Clear any existing timer
    
    const runSync = async () => {
      try {
        await this.syncAllData();
        await this.syncPrices();
      } catch (error) {
        logger.error('Error during scheduled sync:', error);
      }
    };
    
    // Run immediately on start
    runSync().catch(error => {
      logger.error('Error during initial sync:', error);
    });
    
    // Then set up the interval
    if (interval > 0) {
      this.syncTimer = setInterval(runSync, interval);
      logger.info(`Scheduled sync started with interval: ${interval}ms`);
    }
  }

  public stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
      logger.info('Stopped scheduled sync');
    }
  }

  public async close(): Promise<void> {
    this.stopSync();
    
    for (const [id, source] of this.sources.entries()) {
      try {
        await source.close();
        logger.info(`Closed data source: ${id}`);
      } catch (error) {
        logger.error(`Error closing data source ${id}:`, error);
      }
    }
    
    this.sources.clear();
    this.removeAllListeners();
    logger.info('MTG source manager closed');
  }

  // Proxy methods to the default source for convenience
  public async getCardById(id: string, sourceId?: string): Promise<any> {
    const source = sourceId ? this.getSource(sourceId) : this.getDefaultSource();
    if (!source) throw new Error('No data source available');
    return source.getCardById(id);
  }

  public async searchCards(query: string, options: any = {}, sourceId?: string): Promise<any> {
    const source = sourceId ? this.getSource(sourceId) : this.getDefaultSource();
    if (!source) throw new Error('No data source available');
    return source.searchCards(query, options);
  }

  public async getSets(sourceId?: string): Promise<any[]> {
    const source = sourceId ? this.getSource(sourceId) : this.getDefaultSource();
    if (!source) throw new Error('No data source available');
    return source.getSets();
  }

  public async getCardPrice(cardId: string, sourceId?: string): Promise<any> {
    const source = sourceId ? this.getSource(sourceId) : this.getDefaultSource();
    if (!source) throw new Error('No data source available');
    return source.getCardPrice(cardId);
  }
}

// Create and export a singleton instance
export const mtgSourceManager = MTGSourceManager.getInstance();

export default mtgSourceManager;
