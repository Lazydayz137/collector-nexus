import { DataSource, DataSourceConfig, FetchOptions, FetchResult } from '../base.source';

export interface MTGSourceConfig extends DataSourceConfig {
  baseUrl: string;
  batchSize: number;
  rateLimit?: {
    requests: number;
    perSeconds: number;
  };
}

export interface Card {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  oracle_text?: string;
  type_line: string;
  mana_cost?: string;
  cmc?: number;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    art_crop?: string;
    border_crop?: string;
  };
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
    eur_foil?: string | null;
    tix?: string | null;
  };
  legalities?: {
    [format: string]: 'legal' | 'not_legal' | 'restricted' | 'banned';
  };
  purchase_uris?: {
    tcgplayer?: string;
    cardmarket?: string;
    cardhoarder?: string;
  };
  [key: string]: any;
}

export interface Set {
  id: string;
  code: string;
  name: string;
  released_at: string;
  set_type: string;
  card_count: number;
  parent_set_code?: string;
  digital: boolean;
  foil_only: boolean;
  nonfoil_only: boolean;
  icon_svg_uri: string;
  search_uri: string;
  [key: string]: any;
}

export interface PriceData {
  cardId: string;
  source: string;
  price: number;
  foil_price?: number;
  currency: string;
  updated_at: Date;
  [key: string]: any;
}

export interface MTGDataSource extends DataSource {
  // Card operations
  getCardById(id: string): Promise<Card | null>;
  getCardsByIds(ids: string[]): Promise<Card[]>;
  searchCards(query: string, options?: FetchOptions): Promise<FetchResult<Card>>;
  
  // Set operations
  getSets(): Promise<Set[]>;
  getSetByCode(code: string): Promise<Set | null>;
  getCardsInSet(setCode: string, options?: FetchOptions): Promise<FetchResult<Card>>;
  
  // Price operations
  getCardPrice(cardId: string): Promise<PriceData | null>;
  getCardPrices(cardIds: string[]): Promise<PriceData[]>;
  getPriceHistory(cardId: string, days?: number): Promise<PriceData[]>;
  
  // Bulk operations
  getBulkData(type?: string): Promise<{ [key: string]: any }>;
  
  // Sync operations
  syncAllData(): Promise<{ success: boolean; stats: any }>;
  syncPrices(): Promise<{ success: boolean; stats: any }>;
}

export abstract class BaseMTGSource implements MTGDataSource {
  public readonly id: string;
  public readonly name: string;
  public readonly type: string;
  public readonly config: MTGSourceConfig;
  
  protected lastSync: Date | null = null;
  protected syncInProgress: boolean = false;
  
  constructor(config: Partial<MTGSourceConfig> = {}) {
    this.id = config.id || 'mtg';
    this.name = config.name || 'MTG Data Source';
    this.type = 'mtg';
    
    this.config = {
      baseUrl: config.baseUrl || '',
      batchSize: config.batchSize || 100,
      rateLimit: {
        requests: 10,
        perSeconds: 1,
        ...config.rateLimit,
      },
      ...config,
    };
  }
  
  // Abstract methods that must be implemented by subclasses
  abstract initialize(): Promise<void>;
  abstract close(): Promise<void>;
  abstract fetch(options?: FetchOptions): Promise<FetchResult>;
  abstract fetchById(id: string): Promise<any>;
  abstract fetchBatch(ids: string[]): Promise<any[]>;
  abstract isAvailable(): Promise<boolean>;
  abstract getStatus(): Promise<{
    status: 'ok' | 'degraded' | 'unavailable';
    message?: string;
    metrics?: Record<string, any>;
  }>;
  
  // MTG-specific methods with default implementations
  async getCardById(id: string): Promise<Card | null> {
    try {
      return await this.fetchById(id);
    } catch (error) {
      console.error(`Error fetching card ${id}:`, error);
      return null;
    }
  }
  
  async getCardsByIds(ids: string[]): Promise<Card[]> {
    if (!ids.length) return [];
    return this.fetchBatch(ids);
  }
  
  async searchCards(query: string, options: FetchOptions = {}): Promise<FetchResult<Card>> {
    return this.fetch({
      ...options,
      query,
    }) as Promise<FetchResult<Card>>;
  }
  
  async getSets(): Promise<Set[]> {
    throw new Error('Method not implemented');
  }
  
  async getSetByCode(code: string): Promise<Set | null> {
    throw new Error('Method not implemented');
  }
  
  async getCardsInSet(setCode: string, options: FetchOptions = {}): Promise<FetchResult<Card>> {
    return this.fetch({
      ...options,
      set: setCode,
    }) as Promise<FetchResult<Card>>;
  }
  
  async getCardPrice(cardId: string): Promise<PriceData | null> {
    const prices = await this.getCardPrices([cardId]);
    return prices[0] || null;
  }
  
  async getCardPrices(cardIds: string[]): Promise<PriceData[]> {
    const cards = await this.getCardsByIds(cardIds);
    return cards.map(card => ({
      cardId: card.id,
      source: this.id,
      price: card.prices?.usd ? parseFloat(card.prices.usd) : 0,
      foil_price: card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : undefined,
      currency: 'USD',
      updated_at: new Date(),
    }));
  }
  
  async getPriceHistory(cardId: string, days: number = 30): Promise<PriceData[]> {
    // Default implementation returns current price as a single data point
    const currentPrice = await this.getCardPrice(cardId);
    return currentPrice ? [currentPrice] : [];
  }
  
  async getBulkData(type: string = 'default'): Promise<{ [key: string]: any }> {
    throw new Error('Method not implemented');
  }
  
  async syncAllData(): Promise<{ success: boolean; stats: any }> {
    if (this.syncInProgress) {
      return { success: false, stats: { error: 'Sync already in progress' } };
    }
    
    this.syncInProgress = true;
    
    try {
      // Sync sets first
      await this.syncSets();
      
      // Sync cards
      const cardStats = await this.syncCards();
      
      // Sync prices
      const priceStats = await this.syncPrices();
      
      this.lastSync = new Date();
      
      return {
        success: true,
        stats: {
          lastSync: this.lastSync,
          cards: cardStats,
          prices: priceStats,
        },
      };
    } catch (error) {
      console.error('Error during sync:', error);
      return {
        success: false,
        stats: { error: error.message },
      };
    } finally {
      this.syncInProgress = false;
    }
  }
  
  async syncPrices(): Promise<{ success: boolean; stats: any }> {
    // Default implementation does nothing
    return { success: true, stats: {} };
  }
  
  protected async syncSets(): Promise<void> {
    // Default implementation does nothing
  }
  
  protected async syncCards(): Promise<{ total: number; processed: number }> {
    // Default implementation does nothing
    return { total: 0, processed: 0 };
  }
  
  // Helper methods
  protected async rateLimitDelay(): Promise<void> {
    if (!this.config.rateLimit) return;
    
    const { requests, perSeconds } = this.config.rateLimit;
    const delay = (perSeconds * 1000) / requests;
    
    return new Promise(resolve => setTimeout(resolve, delay));
  }
  
  protected normalizeCard(card: any): Card {
    // Default implementation just returns the card as-is
    return card;
  }
  
  protected normalizeSet(set: any): Set {
    // Default implementation just returns the set as-is
    return set;
  }
}
