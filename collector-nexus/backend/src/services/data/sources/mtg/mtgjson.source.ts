import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { MTGSourceConfig, BaseMTGSource, Card, Set, PriceData } from './base.source';
import { logger } from '../../../../utils/logger';
import { ApiError } from '../../../../middleware/errorHandler';

export interface MTGJSONConfig extends MTGSourceConfig {
  apiKey?: string;
  bulkDataEndpoint: string;
  version: string;
}

export class MTGJSONSource extends BaseMTGSource {
  public readonly type = 'mtgjson';
  
  private client: AxiosInstance;
  private bulkDataTypes = {
    allPrintings: 'AllPrintings',
    allPrices: 'AllPrices',
    allDeck: 'AllDeck',
    setList: 'SetList',
  };
  
  constructor(config: Partial<MTGJSONConfig> = {}) {
    super({
      id: 'mtgjson',
      name: 'MTGJSON API',
      baseUrl: 'https://mtgjson.com/api/v5',
      bulkDataEndpoint: '/bulk-data',
      version: '5.0.0+20210924',
      batchSize: 100,
      rateLimit: {
        requests: 10,
        perSeconds: 1,
      },
      ...config,
    } as MTGJSONConfig);
    
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 60000, // Longer timeout for bulk operations
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    // Add API key if provided
    if (this.config.apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.rateLimitDelay();
      return config;
    });
  }
  
  async initialize(): Promise<void> {
    logger.info('MTGJSON data source initialized');
  }
  
  async close(): Promise<void> {
    logger.info('MTGJSON data source closed');
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.client.get('/version');
      return response.status === 200 && response.data?.version;
    } catch (error) {
      logger.error('MTGJSON API is not available:', error);
      return false;
    }
  }
  
  async getStatus() {
    const isAvailable = await this.isAvailable();
    
    return {
      status: isAvailable ? 'ok' : 'unavailable',
      message: isAvailable ? 'MTGJSON API is available' : 'MTGJSON API is not available',
      lastSync: this.lastSync,
    };
  }
  
  async fetch(options: any = {}): Promise<any> {
    const { query, set, page = 1, pageSize = this.config.batchSize } = options;
    
    try {
      // MTGJSON doesn't have a direct search endpoint, so we'll use the bulk data
      // and filter client-side for now
      const allCards = await this.getBulkData('AllPrintings');
      let cards: any[] = [];
      
      // Filter by set if provided
      if (set) {
        cards = allCards[set]?.cards || [];
      } else {
        // Flatten all sets into a single array of cards
        cards = Object.values(allCards).flatMap((setData: any) => setData.cards || []);
      }
      
      // Apply query filter if provided
      if (query) {
        const queryLower = query.toLowerCase();
        cards = cards.filter((card: any) => 
          card.name?.toLowerCase().includes(queryLower) ||
          card.text?.toLowerCase().includes(queryLower) ||
          card.type?.toLowerCase().includes(queryLower)
        );
      }
      
      // Apply pagination
      const start = (page - 1) * pageSize;
      const paginatedCards = cards.slice(start, start + pageSize);
      
      return {
        data: paginatedCards.map((card: any) => this.normalizeCard(card)),
        total: cards.length,
        hasMore: start + pageSize < cards.length,
        page,
        pageSize,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
  
  async fetchById(id: string): Promise<Card | null> {
    try {
      // MTGJSON doesn't have a direct ID lookup, so we need to search through sets
      const allSets = await this.getBulkData('AllPrintings');
      
      for (const set of Object.values(allSets) as any[]) {
        const card = (set.cards || []).find((c: any) => c.uuid === id || c.identifiers?.scryfallId === id);
        if (card) {
          return this.normalizeCard(card);
        }
      }
      
      return null;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
  
  async fetchBatch(ids: string[]): Promise<Card[]> {
    if (!ids.length) return [];
    
    try {
      const allSets = await this.getBulkData('AllPrintings');
      const cards: Card[] = [];
      const idSet = new Set(ids);
      
      // Search through all sets for the requested cards
      for (const set of Object.values(allSets) as any[]) {
        if (cards.length >= ids.length) break;
        
        const matchingCards = (set.cards || []).filter((c: any) => 
          idSet.has(c.uuid) || idSet.has(c.identifiers?.scryfallId)
        );
        
        cards.push(...matchingCards.map((card: any) => this.normalizeCard(card)));
      }
      
      return cards;
    } catch (error) {
      logger.error('Error fetching batch from MTGJSON:', error);
      return [];
    }
  }
  
  async getSets(): Promise<Set[]> {
    try {
      const response = await this.client.get('/SetList.json');
      return (response.data.data || []).map((set: any) => this.normalizeSet(set));
    } catch (error) {
      logger.error('Error fetching sets from MTGJSON:', error);
      return [];
    }
  }
  
  async getSetByCode(code: string): Promise<Set | null> {
    try {
      const response = await this.client.get(`/set/${code.toUpperCase()}.json`);
      return this.normalizeSet(response.data.data);
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw this.normalizeError(error);
    }
  }
  
  async getBulkData(type: string = 'AllPrintings'): Promise<{ [key: string]: any }> {
    try {
      const response = await this.client.get(`/${type}.json`);
      return response.data.data || {};
    } catch (error) {
      logger.error(`Error fetching bulk data '${type}' from MTGJSON:`, error);
      throw this.normalizeError(error);
    }
  }
  
  async syncAllData(): Promise<{ success: boolean; stats: any }> {
    try {
      logger.info('Starting MTGJSON full data sync...');
      
      // Download all printings data
      const allPrintings = await this.getBulkData('AllPrintings');
      
      // Here you would process and store the data in your database
      // This is a simplified example
      const stats = {
        totalSets: Object.keys(allPrintings).length,
        totalCards: Object.values(allPrintings).reduce(
          (sum: number, set: any) => sum + (set.cards?.length || 0), 0
        ),
        processed: 0,
        errors: 0,
      };
      
      logger.info(`MTGJSON sync completed: ${stats.totalCards} cards across ${stats.totalSets} sets`);
      
      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('Error during MTGJSON sync:', error);
      return {
        success: false,
        stats: { error: error.message },
      };
    }
  }
  
  async syncPrices(): Promise<{ success: boolean; stats: any }> {
    try {
      logger.info('Starting MTGJSON price sync...');
      
      // Download all prices data
      const allPrices = await this.getBulkData('AllPrices');
      
      // Here you would process and update prices in your database
      // This is a simplified example
      const stats = {
        totalPrices: Object.keys(allPrices).length,
        updated: 0,
        errors: 0,
      };
      
      logger.info(`MTGJSON price sync completed: ${stats.totalPrices} prices processed`);
      
      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('Error during MTGJSON price sync:', error);
      return {
        success: false,
        stats: { error: error.message },
      };
    }
  }
  
  // Helper methods
  protected normalizeCard(card: any): Card {
    if (!card) return card;
    
    // MTGJSON uses a different structure than Scryfall
    return {
      id: card.uuid,
      name: card.name,
      set: card.setCode,
      set_name: card.setName,
      collector_number: card.number,
      rarity: card.rarity,
      oracle_text: card.text,
      type_line: card.type,
      mana_cost: card.manaCost,
      cmc: card.convertedManaCost,
      power: card.power,
      toughness: card.toughness,
      colors: card.colors,
      color_identity: card.colorIdentity,
      keywords: card.keywords || [],
      image_uris: card.identifiers?.scryfallId ? {
        small: `https://cards.scryfall.io/small/front/${card.identifiers.scryfallId[0]}/${card.identifiers.scryfallId[1]}/${card.identifiers.scryfallId}.jpg`,
        normal: `https://cards.scryfall.io/normal/front/${card.identifiers.scryfallId[0]}/${card.identifiers.scryfallId[1]}/${card.identifiers.scryfallId}.jpg`,
        large: `https://cards.scryfall.io/large/front/${card.identifiers.scryfallId[0]}/${card.identifiers.scryfallId[1]}/${card.identifiers.scryfallId}.jpg`,
        png: `https://cards.scryfall.io/png/front/${card.identifiers.scryfallId[0]}/${card.identifiers.scryfallId[1]}/${card.identifiers.scryfallId}.png`,
        art_crop: `https://cards.scryfall.io/art_crop/front/${card.identifiers.scryfallId[0]}/${card.identifiers.scryfallId[1]}/${card.identifiers.scryfallId}.jpg`,
        border_crop: `https://cards.scryfall.io/border_crop/front/${card.identifiers.scryfallId[0]}/${card.identifiers.scryfallId[1]}/${card.identifiers.scryfallId}.jpg`,
      } : undefined,
      prices: card.prices || {},
      legalities: card.legalities || {},
      purchase_uris: {
        tcgplayer: card.identifiers?.tcgplayerProductId ? `https://shop.tcgplayer.com/product/productsearch?id=${card.identifiers.tcgplayerProductId}` : undefined,
        cardmarket: card.identifiers?.mcmId ? `https://www.cardmarket.com/en/Magic/Products/Singles/${card.setName.replace(/\s+/g, '-')}/${card.name}` : undefined,
        cardhoarder: card.identifiers?.cardhoarderId ? `https://www.cardhoarder.com/cards/${card.identifiers.cardhoarderId}` : undefined,
      },
      // Include the raw data for reference
      _raw: card,
    };
  }
  
  protected normalizeSet(set: any): Set {
    if (!set) return set;
    
    return {
      id: set.uuid,
      code: set.code,
      name: set.name,
      released_at: set.releaseDate,
      set_type: set.type,
      card_count: set.totalSetSize || 0,
      parent_set_code: set.parentCode,
      digital: set.isOnlineOnly || false,
      foil_only: set.isFoilOnly || false,
      nonfoil_only: set.isNonFoilOnly || false,
      icon_svg_uri: set.keyruneCode ? `https://svgs.scryfall.io/sets/${set.keyruneCode.toLowerCase()}.svg` : undefined,
      search_uri: `https://scryfall.com/sets/${set.code}`,
      _raw: set,
    };
  }
  
  private normalizeError(error: any): Error {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return new ApiError(
        error.response.status,
        error.response.data?.message || 'MTGJSON API error',
        error.response.data
      );
    } else if (error.request) {
      // The request was made but no response was received
      return new Error('No response received from MTGJSON API');
    } else {
      // Something happened in setting up the request that triggered an Error
      return error;
    }
  }
}

// Factory function
export const createMTGJSONSource = (config: Partial<MTGJSONConfig> = {}): MTGJSONSource => {
  return new MTGJSONSource(config);
};

export default MTGJSONSource;
