import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { MTGSourceConfig, BaseMTGSource, Card, Set, PriceData } from './base.source';
import { logger } from '../../../../utils/logger';
import { ApiError } from '../../../../middleware/errorHandler';

export interface ScryfallConfig extends MTGSourceConfig {
  bulkDataEndpoint: string;
  rateLimit: {
    requests: number;
    perSeconds: number;
  };
}

export class ScryfallSource extends BaseMTGSource {
  public readonly type = 'scryfall';
  
  private client: AxiosInstance;
  private bulkDataTypes = {
    oracle_cards: 'oracle_cards',
    default_cards: 'default_cards',
    all_cards: 'all_cards',
    rulings: 'rulings',
  };
  
  constructor(config: Partial<ScryfallConfig> = {}) {
    super({
      id: 'scryfall',
      name: 'Scryfall API',
      baseUrl: 'https://api.scryfall.com',
      bulkDataEndpoint: '/bulk-data',
      batchSize: 100,
      rateLimit: {
        requests: 10,
        perSeconds: 1,
      },
      ...config,
    } as ScryfallConfig);
    
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.rateLimitDelay();
      return config;
    });
  }
  
  async initialize(): Promise<void> {
    // No initialization needed for Scryfall
    logger.info('Scryfall data source initialized');
  }
  
  async close(): Promise<void> {
    // No cleanup needed for Scryfall
    logger.info('Scryfall data source closed');
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.client.get('/');
      return response.status === 200 && response.data?.object === 'root';
    } catch (error) {
      logger.error('Scryfall API is not available:', error);
      return false;
    }
  }
  
  async getStatus() {
    const isAvailable = await this.isAvailable();
    
    return {
      status: isAvailable ? 'ok' : 'unavailable',
      message: isAvailable ? 'Scryfall API is available' : 'Scryfall API is not available',
      lastSync: this.lastSync,
    };
  }
  
  async fetch(options: any = {}): Promise<any> {
    const { query, page = 1, pageSize = this.config.batchSize, ...rest } = options;
    
    try {
      const response = await this.client.get('/cards/search', {
        params: {
          q: query,
          page,
          ...rest,
        },
      });
      
      return {
        data: response.data.data || [],
        total: response.data.total_cards || 0,
        hasMore: response.data.has_more || false,
        page: response.data.page || 1,
        pageSize: response.data.per_page || pageSize,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return { data: [], total: 0, hasMore: false };
      }
      throw this.normalizeError(error);
    }
  }
  
  async fetchById(id: string): Promise<Card | null> {
    try {
      const response = await this.client.get(`/cards/${id}`);
      return this.normalizeCard(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw this.normalizeError(error);
    }
  }
  
  async fetchBatch(ids: string[]): Promise<Card[]> {
    if (!ids.length) return [];
    
    // Scryfall supports batch lookups via the /collection endpoint
    try {
      const response = await this.client.post('/cards/collection', {
        identifiers: ids.map(id => ({ id })),
      });
      
      return (response.data.data || []).map((card: any) => this.normalizeCard(card));
    } catch (error) {
      logger.error('Error fetching batch from Scryfall:', error);
      return [];
    }
  }
  
  async getSets(): Promise<Set[]> {
    try {
      const response = await this.client.get('/sets');
      return (response.data.data || []).map((set: any) => this.normalizeSet(set));
    } catch (error) {
      logger.error('Error fetching sets from Scryfall:', error);
      return [];
    }
  }
  
  async getSetByCode(code: string): Promise<Set | null> {
    try {
      const response = await this.client.get(`/sets/${code.toLowerCase()}`);
      return this.normalizeSet(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw this.normalizeError(error);
    }
  }
  
  async getBulkData(type: string = 'default'): Promise<{ [key: string]: any }> {
    try {
      // First, get the bulk data list
      const listResponse = await this.client.get(this.config.bulkDataEndpoint);
      
      // Find the requested bulk data type
      const bulkData = listResponse.data.data.find((item: any) => 
        item.type === type || 
        (type === 'default' && item.type === this.bulkDataTypes.default_cards)
      );
      
      if (!bulkData) {
        throw new Error(`Bulk data type '${type}' not found`);
      }
      
      // Download the bulk data
      const downloadResponse = await axios.get(bulkData.download_uri, {
        responseType: 'json',
      });
      
      return downloadResponse.data;
    } catch (error) {
      logger.error('Error fetching bulk data from Scryfall:', error);
      throw this.normalizeError(error);
    }
  }
  
  async syncAllData(): Promise<{ success: boolean; stats: any }> {
    try {
      logger.info('Starting Scryfall full data sync...');
      
      // Download all cards bulk data
      const cards = await this.getBulkData('all_cards');
      
      // Here you would process and store the cards in your database
      // This is a simplified example
      const stats = {
        totalCards: Array.isArray(cards) ? cards.length : 0,
        processed: 0,
        errors: 0,
      };
      
      logger.info(`Scryfall sync completed: ${stats.totalCards} cards processed`);
      
      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('Error during Scryfall sync:', error);
      return {
        success: false,
        stats: { error: error.message },
      };
    }
  }
  
  async syncPrices(): Promise<{ success: boolean; stats: any }> {
    try {
      logger.info('Starting Scryfall price sync...');
      
      // Download default cards bulk data which includes prices
      const cards = await this.getBulkData('default_cards');
      
      // Here you would process and update prices in your database
      // This is a simplified example
      const stats = {
        totalPrices: Array.isArray(cards) ? cards.length : 0,
        updated: 0,
        errors: 0,
      };
      
      logger.info(`Scryfall price sync completed: ${stats.totalPrices} prices processed`);
      
      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('Error during Scryfall price sync:', error);
      return {
        success: false,
        stats: { error: error.message },
      };
    }
  }
  
  // Helper methods
  protected normalizeCard(card: any): Card {
    if (!card) return card;
    
    return {
      id: card.id,
      name: card.name,
      set: card.set,
      set_name: card.set_name,
      collector_number: card.collector_number,
      rarity: card.rarity,
      oracle_text: card.oracle_text,
      type_line: card.type_line,
      mana_cost: card.mana_cost,
      cmc: card.cmc,
      power: card.power,
      toughness: card.toughness,
      colors: card.colors,
      color_identity: card.color_identity,
      keywords: card.keywords || [],
      image_uris: card.image_uris,
      prices: card.prices,
      legalities: card.legalities,
      purchase_uris: card.purchase_uris,
      // Include the raw data for reference
      _raw: card,
    };
  }
  
  protected normalizeSet(set: any): Set {
    if (!set) return set;
    
    return {
      id: set.id,
      code: set.code,
      name: set.name,
      released_at: set.released_at,
      set_type: set.set_type,
      card_count: set.card_count,
      parent_set_code: set.parent_set_code,
      digital: set.digital,
      foil_only: set.foil_only,
      nonfoil_only: set.nonfoil_only,
      icon_svg_uri: set.icon_svg_uri,
      search_uri: set.search_uri,
      _raw: set,
    };
  }
  
  private normalizeError(error: any): Error {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return new ApiError(
        error.response.status,
        error.response.data?.details || error.response.data?.message || 'Scryfall API error',
        error.response.data
      );
    } else if (error.request) {
      // The request was made but no response was received
      return new Error('No response received from Scryfall API');
    } else {
      // Something happened in setting up the request that triggered an Error
      return error;
    }
  }
}

// Factory function
export const createScryfallSource = (config: Partial<ScryfallConfig> = {}): ScryfallSource => {
  return new ScryfallSource(config);
};

export default ScryfallSource;
