import axios, { AxiosInstance } from 'axios';
import { MTGSourceConfig, BaseMTGSource, Card, Set, PriceData } from './base.source';
import { logger } from '../../../../utils/logger';
import { ApiError } from '../../../../middleware/errorHandler';

export interface CardTraderConfig extends MTGSourceConfig {
  apiKey: string;
  marketplaceId: number;
  authEndpoint: string;
  apiEndpoint: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}

export class CardTraderSource extends BaseMTGSource {
  public readonly type = 'cardtrader';
  
  private client: AxiosInstance;
  private authClient: AxiosInstance;
  private tokenData: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  } | null = null;
  
  constructor(config: Partial<CardTraderConfig> = {}) {
    super({
      id: 'cardtrader',
      name: 'CardTrader API',
      baseUrl: 'https://api.cardtrader.com/api/v2',
      authEndpoint: 'https://api.cardtrader.com/oauth/token',
      apiEndpoint: 'https://api.cardtrader.com/api/v2',
      marketplaceId: 1, // Default to MTG marketplace
      batchSize: 100,
      rateLimit: {
        requests: 60, // CardTrader has a limit of 60 requests per minute
        perSeconds: 60,
      },
      ...config,
    } as CardTraderConfig);
    
    this.client = axios.create({
      baseURL: this.config.apiEndpoint,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    this.authClient = axios.create({
      baseURL: this.config.authEndpoint,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: this.config.clientId,
        password: this.config.clientSecret,
      },
    });
    
    // Add request interceptor for authentication
    this.client.interceptors.request.use(async (config) => {
      await this.ensureAuthenticated();
      
      if (this.tokenData) {
        config.headers.Authorization = `Bearer ${this.tokenData.accessToken}`;
      }
      
      await this.rateLimitDelay();
      return config;
    });
  }
  
  async initialize(): Promise<void> {
    await this.ensureAuthenticated();
    logger.info('CardTrader data source initialized');
  }
  
  async close(): Promise<void> {
    // No cleanup needed for CardTrader
    logger.info('CardTrader data source closed');
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureAuthenticated();
      const response = await this.client.get('/ping');
      return response.status === 200 && response.data?.status === 'ok';
    } catch (error) {
      logger.error('CardTrader API is not available:', error);
      return false;
    }
  }
  
  async getStatus() {
    const isAvailable = await this.isAvailable();
    
    return {
      status: isAvailable ? 'ok' : 'unavailable',
      message: isAvailable ? 'CardTrader API is available' : 'CardTrader API is not available',
      lastSync: this.lastSync,
      marketplaceId: this.config.marketplaceId,
    };
  }
  
  async fetch(options: any = {}): Promise<any> {
    const { query, set, page = 1, pageSize = this.config.batchSize } = options;
    
    try {
      const params: any = {
        marketplace_id: this.config.marketplaceId,
        page,
        per_page: pageSize,
      };
      
      if (query) {
        params.q = query;
      }
      
      if (set) {
        params.expansion_id = await this.getExpansionIdByCode(set);
      }
      
      const response = await this.client.get('/marketplace/cards', { params });
      const cards = response.data || [];
      
      return {
        data: cards.map((card: any) => this.normalizeCard(card)),
        total: response.headers['x-total-count'] ? parseInt(response.headers['x-total-count'], 10) : cards.length,
        page: parseInt(response.headers['x-page'] || page, 10),
        pageSize: parseInt(response.headers['x-per-page'] || pageSize, 10),
        hasMore: response.headers['x-total-pages'] ? 
          parseInt(response.headers['x-page'], 10) < parseInt(response.headers['x-total-pages'], 10) : 
          cards.length >= pageSize,
      };
    } catch (error) {
      logger.error('Error fetching cards from CardTrader:', error);
      throw this.normalizeError(error);
    }
  }
  
  async fetchById(id: string): Promise<Card | null> {
    try {
      const response = await this.client.get(`/marketplace/cards/${id}`, {
        params: {
          marketplace_id: this.config.marketplaceId,
        },
      });
      
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
    
    try {
      // CardTrader doesn't have a batch endpoint, so we'll fetch them one by one
      const cards: Card[] = [];
      
      for (const id of ids) {
        try {
          const card = await this.fetchById(id);
          if (card) {
            cards.push(card);
          }
        } catch (error) {
          logger.error(`Error fetching card ${id} from CardTrader:`, error);
        }
      }
      
      return cards;
    } catch (error) {
      logger.error('Error fetching batch from CardTrader:', error);
      throw this.normalizeError(error);
    }
  }
  
  async getSets(): Promise<Set[]> {
    try {
      const response = await this.client.get('/public/sets', {
        params: {
          game_id: 1, // MTG
        },
      });
      
      return (response.data || []).map((set: any) => this.normalizeSet(set));
    } catch (error) {
      logger.error('Error fetching sets from CardTrader:', error);
      throw this.normalizeError(error);
    }
  }
  
  async getSetByCode(code: string): Promise<Set | null> {
    try {
      const sets = await this.getSets();
      return sets.find(s => s.code.toLowerCase() === code.toLowerCase()) || null;
    } catch (error) {
      logger.error(`Error fetching set ${code} from CardTrader:`, error);
      return null;
    }
  }
  
  async getCardPrice(cardId: string): Promise<PriceData | null> {
    try {
      const response = await this.client.get(`/marketplace/cards/${cardId}/prices`, {
        params: {
          marketplace_id: this.config.marketplaceId,
        },
      });
      
      const priceData = response.data;
      if (!priceData) return null;
      
      return {
        cardId,
        source: this.id,
        price: parseFloat(priceData.price_eur) || 0,
        foil_price: parseFloat(priceData.price_eur_foil) || undefined,
        currency: 'EUR', // CardTrader uses EUR as default
        updated_at: new Date(priceData.updated_at || Date.now()),
        _raw: priceData,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw this.normalizeError(error);
    }
  }
  
  async getCardPrices(cardIds: string[]): Promise<PriceData[]> {
    if (!cardIds.length) return [];
    
    try {
      // CardTrader doesn't have a batch price endpoint, so we'll fetch them one by one
      const prices: PriceData[] = [];
      
      for (const cardId of cardIds) {
        try {
          const price = await this.getCardPrice(cardId);
          if (price) {
            prices.push(price);
          }
        } catch (error) {
          logger.error(`Error fetching price for card ${cardId} from CardTrader:`, error);
        }
      }
      
      return prices;
    } catch (error) {
      logger.error('Error fetching prices from CardTrader:', error);
      throw this.normalizeError(error);
    }
  }
  
  async syncPrices(): Promise<{ success: boolean; stats: any }> {
    try {
      logger.info('Starting CardTrader price sync...');
      
      // Get all sets
      const sets = await this.getSets();
      let totalPrices = 0;
      
      // Process each set
      for (const set of sets) {
        try {
          // Get all cards in the set with prices
          const response = await this.client.get('/marketplace/cards', {
            params: {
              marketplace_id: this.config.marketplaceId,
              expansion_id: set.id,
              per_page: 250, // Max per page
            },
          });
          
          const cards = response.data || [];
          totalPrices += cards.length;
          
          // Here you would process and update prices in your database
          // This is a simplified example
          logger.debug(`Processed ${cards.length} prices for set ${set.code}`);
          
          // Respect rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error(`Error processing set ${set.code}:`, error);
        }
      }
      
      logger.info(`CardTrader price sync completed: ${totalPrices} prices processed`);
      
      return {
        success: true,
        stats: {
          totalPrices,
          lastSync: new Date(),
        },
      };
    } catch (error) {
      logger.error('Error during CardTrader price sync:', error);
      return {
        success: false,
        stats: { error: error.message },
      };
    }
  }
  
  // Helper methods
  private async ensureAuthenticated(): Promise<void> {
    // Check if we have a valid token
    if (this.tokenData && this.tokenData.expiresAt > Date.now() + 60000) {
      return; // Token is still valid
    }
    
    try {
      const params = new URLSearchParams();
      
      if (this.tokenData?.refreshToken) {
        // Try to refresh the token
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', this.tokenData.refreshToken);
      } else {
        // Get a new token using client credentials
        params.append('grant_type', 'client_credentials');
      }
      
      const response = await this.authClient.post('', params);
      
      this.tokenData = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || this.tokenData?.refreshToken || '',
        expiresAt: Date.now() + (response.data.expires_in * 1000),
      };
      
      // Update the default authorization header
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.tokenData.accessToken}`;
    } catch (error) {
      logger.error('Failed to authenticate with CardTrader API:', error);
      throw new Error('Failed to authenticate with CardTrader API');
    }
  }
  
  private async getExpansionIdByCode(code: string): Promise<number | null> {
    try {
      const sets = await this.getSets();
      const set = sets.find(s => s.code.toLowerCase() === code.toLowerCase());
      return set?.id ? parseInt(set.id as string, 10) : null;
    } catch (error) {
      logger.error(`Error finding expansion ID for code ${code}:`, error);
      return null;
    }
  }
  
  protected normalizeCard(card: any): Card {
    if (!card) return card;
    
    return {
      id: card.id?.toString(),
      name: card.name,
      set: card.expansion_code,
      set_name: card.expansion_name,
      collector_number: card.number,
      rarity: card.rarity,
      oracle_text: card.text,
      type_line: card.type,
      mana_cost: card.mana_cost,
      cmc: card.cmc,
      power: card.power,
      toughness: card.toughness,
      colors: card.colors || [],
      color_identity: card.color_identity || [],
      image_uris: card.image_urls ? {
        small: card.image_urls.small,
        normal: card.image_urls.normal,
        large: card.image_urls.large,
        png: card.image_urls.png,
        art_crop: card.image_urls.art_crop,
        border_crop: card.image_urls.border_crop,
      } : undefined,
      prices: {
        eur: card.price_eur?.toString(),
        eur_foil: card.price_eur_foil?.toString(),
      },
      purchase_uris: {
        cardmarket: card.url,
      },
      // Include the raw data for reference
      _raw: card,
    };
  }
  
  protected normalizeSet(set: any): Set {
    if (!set) return set;
    
    return {
      id: set.id.toString(),
      code: set.code,
      name: set.name,
      released_at: set.release_date,
      set_type: set.set_type,
      card_count: set.card_count,
      digital: set.digital || false,
      foil_only: set.foil_only || false,
      nonfoil_only: set.nonfoil_only || false,
      icon_svg_uri: set.icon_svg_uri,
      search_uri: set.url,
      _raw: set,
    };
  }
  
  private normalizeError(error: any): Error {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return new ApiError(
        error.response.status,
        error.response.data?.error || 'CardTrader API error',
        error.response.data
      );
    } else if (error.request) {
      // The request was made but no response was received
      return new Error('No response received from CardTrader API');
    } else {
      // Something happened in setting up the request that triggered an Error
      return error;
    }
  }
}

// Factory function
export const createCardTraderSource = (config: Partial<CardTraderConfig> = {}): CardTraderSource => {
  return new CardTraderSource(config);
};

export default CardTraderSource;
