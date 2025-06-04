import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { DataSource, DataSourceConfig, FetchOptions, FetchResult } from './base.source';
import { DataRecord } from '../acquisition.service';
import { logger } from '../../../utils/logger';
import { ApiError } from '../../../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

interface EbayAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  expiresAt: Date;
}

export class EbaySource implements DataSource {
  public readonly id: string;
  public readonly name: string;
  public readonly type: string = 'ebay';
  public readonly config: DataSourceConfig;
  
  private client: AxiosInstance;
  private authToken: EbayAuthToken | null = null;
  private rateLimitRemaining: number = 0;
  private rateLimitReset: Date = new Date();
  private isInitialized: boolean = false;
  
  constructor(config: Partial<DataSourceConfig> = {}) {
    this.id = config.id || 'ebay';
    this.name = config.name || 'eBay API';
    
    // Merge default config with provided config
    this.config = {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: true,
      priority: 1,
      rateLimit: {
        requests: 5000,
        perSeconds: 86400, // Per day
      },
      ...config,
      // Ensure required eBay-specific config
      apiKey: config.apiKey || process.env.EBAY_API_KEY,
      apiSecret: config.apiSecret || process.env.EBAY_API_SECRET,
      endpoint: config.endpoint || process.env.EBAY_API_ENDPOINT || 'https://api.ebay.com',
      marketplaceId: config.marketplaceId || 'EBAY-US',
      compatibilityLevel: config.compatibilityLevel || 967,
      siteId: config.siteId || 0, // US
    };
    
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error('eBay API key and secret are required');
    }
    
    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.config.endpoint,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-EBAY-API-COMPATIBILITY-LEVEL': String(this.config.compatibilityLevel),
        'X-EBAY-API-SITEID': String(this.config.siteId),
        'X-EBAY-API-IAF-TOKEN': `Bearer ${this.config.apiKey}`,
      },
    });
    
    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      async (config) => {
        // Add auth token to request
        if (!config.headers['X-EBAY-API-IAF-TOKEN'] && this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken.access_token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Add response interceptor for rate limiting
    this.client.interceptors.response.use(
      (response) => {
        // Update rate limit from headers if available
        const remaining = response.headers['x-ebay-api-rate-limit-remaining'];
        const reset = response.headers['x-ebay-api-rate-limit-reset'];
        
        if (remaining) {
          this.rateLimitRemaining = parseInt(remaining, 10);
        }
        
        if (reset) {
          this.rateLimitReset = new Date(parseInt(reset, 10) * 1000);
        }
        
        return response;
      },
      async (error) => {
        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          
          logger.warn(`Rate limited. Retrying after ${retryAfterMs}ms`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryAfterMs));
          
          // Retry the request
          return this.client.request(error.config);
        }
        
        // Handle authentication errors
        if (error.response?.status === 401) {
          logger.warn('Authentication token expired. Refreshing...');
          
          try {
            await this.authenticate();
            
            // Update the Authorization header
            if (error.config && this.authToken) {
              error.config.headers.Authorization = `Bearer ${this.authToken.access_token}`;
            }
            
            // Retry the request
            return this.client.request(error.config);
          } catch (authError) {
            logger.error('Failed to refresh authentication token:', authError);
            return Promise.reject(authError);
          }
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Initialize the data source
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    try {
      // Authenticate
      await this.authenticate();
      
      this.isInitialized = true;
      logger.info(`Initialized ${this.name} data source`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.name} data source:`, error);
      throw new ApiError(500, `Failed to initialize ${this.name} data source`);
    }
  }
  
  /**
   * Close the data source
   */
  async close(): Promise<void> {
    // Clean up resources if needed
    this.isInitialized = false;
    logger.info(`Closed ${this.name} data source`);
  }
  
  /**
   * Authenticate with the eBay API
   */
  private async authenticate(): Promise<void> {
    try {
      const authString = Buffer.from(
        `${this.config.apiKey}:${this.config.apiSecret}`
      ).toString('base64');
      
      const response = await axios.post(
        'https://api.ebay.com/identity/v1/oauth2/token',
        'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${authString}`,
          },
        }
      );
      
      this.authToken = {
        ...response.data,
        expiresAt: new Date(Date.now() + (response.data.expires_in * 1000)),
      };
      
      logger.debug('Successfully authenticated with eBay API');
    } catch (error) {
      logger.error('Failed to authenticate with eBay API:', error);
      throw new ApiError(401, 'Failed to authenticate with eBay API');
    }
  }
  
  /**
   * Check if the data source is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get the current status of the data source
   */
  async getStatus() {
    const isAvailable = await this.isAvailable();
    
    return {
      status: isAvailable ? 'ok' : 'unavailable',
      message: isAvailable ? 'Service is operational' : 'Service is unavailable',
      metrics: {
        rateLimitRemaining: this.rateLimitRemaining,
        rateLimitReset: this.rateLimitReset,
        lastUpdated: new Date(),
      },
    };
  }
  
  /**
   * Get the current rate limit status
   */
  async getRateLimitStatus() {
    if (!this.authToken) {
      return null;
    }
    
    return {
      remaining: this.rateLimitRemaining,
      limit: this.config.rateLimit?.requests || 5000,
      resetAt: this.rateLimitReset,
    };
  }
  
  /**
   * Fetch items from eBay
   */
  async fetch(options: FetchOptions = {}): Promise<FetchResult> {
    await this.initialize();
    
    const {
      query = '',
      filters = {},
      limit = 100,
      offset = 0,
      sort = { _score: -1 },
      ...restOptions
    } = options;
    
    try {
      // Build the request payload
      const payload = this.buildSearchPayload({
        query,
        filters,
        limit,
        offset,
        sort,
        ...restOptions,
      });
      
      // Make the API request
      const response = await this.client.post('/buy/browse/v1/item_summary/search', payload);
      
      // Transform the response
      return this.transformSearchResponse(response.data, { limit, offset });
      
    } catch (error) {
      logger.error('Failed to fetch items from eBay:', error);
      throw new ApiError(500, 'Failed to fetch items from eBay', {
        source: this.id,
        error: error.message,
      });
    }
  }
  
  /**
   * Fetch a single item by ID
   */
  async fetchById(id: string): Promise<DataRecord | null> {
    await this.initialize();
    
    try {
      const response = await this.client.get(`/buy/browse/v1/item/${id}`);
      
      // Transform the response
      const transformed = this.transformItem(response.data);
      
      return {
        id: transformed.itemId,
        source: this.id,
        type: 'item',
        data: transformed,
        metadata: {
          fetchedAt: new Date(),
          status: 'processed',
        },
      };
      
    } catch (error) {
      if (error.response?.status === 404) {
        return null; // Item not found
      }
      
      logger.error(`Failed to fetch item ${id} from eBay:`, error);
      throw new ApiError(500, `Failed to fetch item ${id} from eBay`, {
        source: this.id,
        itemId: id,
        error: error.message,
      });
    }
  }
  
  /**
   * Fetch multiple items by their IDs
   */
  async fetchBatch(ids: string[]): Promise<DataRecord[]> {
    if (!ids.length) {
      return [];
    }
    
    // Fetch items in parallel with a concurrency limit
    const BATCH_SIZE = 10;
    const batches = [];
    
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);
      const batchPromises = batchIds.map(id => this.fetchById(id).catch(error => {
        logger.error(`Failed to fetch item ${id}:`, error);
        return null;
      }));
      
      const batchResults = await Promise.all(batchPromises);
      const validItems = batchResults.filter(Boolean) as DataRecord[];
      
      batches.push(...validItems);
      
      // Add a small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < ids.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return batches;
  }
  
  /**
   * Build the search payload for the eBay API
   */
  private buildSearchPayload(options: FetchOptions): any {
    const {
      query = '',
      filters = {},
      limit = 100,
      offset = 0,
      sort = { _score: -1 },
      ...restOptions
    } = options;
    
    const payload: any = {
      q: query,
      limit: Math.min(limit, 200), // eBay max is 200
      offset,
      sort: this.mapSortFields(sort),
      filter: this.buildFilters(filters),
      ...restOptions,
    };
    
    return payload;
  }
  
  /**
   * Map sort fields to eBay API format
   */
  private mapSortFields(sort: Record<string, 1 | -1>): string | undefined {
    if (!sort || !Object.keys(sort).length) {
      return undefined;
    }
    
    const [field, order] = Object.entries(sort)[0];
    
    // Map common field names to eBay field names
    const fieldMap: Record<string, string> = {
      _score: 'relevancy',
      price: 'price',
      endTime: 'endTime',
      startTime: 'startTime',
      distance: 'distance',
    };
    
    const ebayField = fieldMap[field] || field;
    const sortOrder = order === 1 ? 'asc' : 'desc';
    
    return `${ebayField}:${sortOrder}`;
  }
  
  /**
   * Build filters for the eBay API
   */
  private buildFilters(filters: Record<string, any>): string[] {
    const filterStrings: string[] = [];
    
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) {
        continue;
      }
      
      switch (key) {
        case 'price':
          if (value.min !== undefined) {
            filterStrings.push(`price:[${value.min}..]`);
          }
          if (value.max !== undefined) {
            filterStrings.push(`price:[..${value.max}]`);
          }
          if (value.min !== undefined && value.max !== undefined) {
            filterStrings.push(`price:[${value.min}..${value.max}]`);
          }
          break;
          
        case 'condition':
          filterStrings.push(`conditionIds:{${value}}`);
          break;
          
        case 'category':
          filterStrings.push(`categoryIds:{${value}}`);
          break;
          
        case 'seller':
          filterStrings.push(`seller:{${value}}`);
          break;
          
        case 'itemLocationCountry':
          filterStrings.push(`itemLocationCountry:${value}`);
          break;
          
        case 'buyingOptions':
          filterStrings.push(`buyingOptions:{${value}}`);
          break;
          
        case 'itemLocation':
          if (value.latitude && value.longitude && value.radius) {
            filterStrings.push(`itemLocation:${value.latitude},${value.longitude},${value.radius}|${value.unit || 'mi'}`);
          }
          break;
          
        default:
          // Handle custom filters
          if (Array.isArray(value)) {
            filterStrings.push(`${key}:{${value.join('|')}}`);
          } else if (typeof value === 'object') {
            // Handle range queries
            if (value.gte !== undefined) {
              filterStrings.push(`${key}:[${value.gte}..]`);
            } else if (value.lte !== undefined) {
              filterStrings.push(`${key}:[..${value.lte}]`);
            } else if (value.gt !== undefined || value.lt !== undefined) {
              const gt = value.gt !== undefined ? value.gt : '';
              const lt = value.lt !== undefined ? value.lt : '';
              filterStrings.push(`${key}:${gt}..${lt}`);
            }
          } else {
            filterStrings.push(`${key}:${value}`);
          }
      }
    }
    
    return filterStrings;
  }
  
  /**
   * Transform eBay API search response to our format
   */
  private transformSearchResponse(response: any, options: { limit: number; offset: number }): FetchResult {
    const items = response.itemSummaries || [];
    
    return {
      data: items.map((item: any) => this.transformItem(item)),
      total: response.total || 0,
      limit: options.limit,
      offset: options.offset,
      hasMore: (options.offset + items.length) < (response.total || 0),
      source: this.id,
      metadata: {
        query: response.searchHints?.[0]?.q,
        refinements: response.refinements,
        warnings: response.warnings,
      },
    };
  }
  
  /**
   * Transform a single eBay item to our format
   */
  private transformItem(item: any): any {
    if (!item) {
      return null;
    }
    
    // Extract price information
    const price = item.price?.value || 0;
    const currency = item.price?.currency || 'USD';
    const originalPrice = item.originalPrice?.value || price;
    
    // Extract shipping information
    const shipping = item.shippingOptions?.[0];
    const shippingCost = shipping?.shippingCost?.value || 0;
    const shippingCurrency = shipping?.shippingCost?.currency || currency;
    
    // Extract seller information
    const seller = item.seller || {};
    
    // Extract image URLs
    const images = [
      item.image?.imageUrl,
      ...(item.additionalImages?.map((img: any) => img.imageUrl) || []),
    ].filter(Boolean);
    
    // Transform the item
    return {
      // Core item information
      itemId: item.itemId,
      title: item.title,
      description: item.shortDescription || item.description,
      
      // Price information
      price,
      currency,
      originalPrice,
      priceDiff: price - originalPrice,
      priceDiffPercent: originalPrice > 0 ? ((originalPrice - price) / originalPrice) * 100 : 0,
      
      // Listing information
      itemWebUrl: item.itemWebUrl,
      itemCreationDate: item.itemCreationDate,
      itemEndDate: item.itemEndDate,
      listingMarketplaceId: item.listingMarketplaceId,
      
      // Category information
      categories: item.categories || [],
      categoryPath: item.categoryPath || '',
      
      // Condition information
      condition: item.condition || 'UNKNOWN',
      conditionId: item.conditionId,
      
      // Seller information
      seller: {
        username: seller.username,
        feedbackPercentage: seller.feedbackPercentage,
        feedbackScore: seller.feedbackScore,
      },
      
      // Shipping information
      shipping: {
        cost: shippingCost,
        currency: shippingCurrency,
        type: shipping?.shippingCostType || 'FLAT_RATE',
        locations: shipping?.shipToLocations || [],
        estimatedDelivery: shipping?.estimatedDeliveryDateRange,
      },
      
      // Images
      images,
      thumbnail: item.thumbnailImages?.[0]?.imageUrl || images[0],
      
      // Additional metadata
      additionalInfo: {
        buyingOptions: item.buyingOptions || [],
        itemAffiliateWebUrl: item.itemAffiliateWebUrl,
        itemLocation: item.itemLocation,
        legacyItemId: item.legacyItemId,
        lotSize: item.lotSize,
        marketingPrice: item.marketingPrice,
        priceDisplayCondition: item.priceDisplayCondition,
        primaryItemGroup: item.primaryItemGroup,
        product: item.product,
        sellerItemRevision: item.sellerItemRevision,
        shortDescription: item.shortDescription,
        taxes: item.taxes,
        unitPricingMeasure: item.unitPricingMeasure,
        unitPrice: item.unitPrice,
      },
      
      // Original item for reference
      _original: item,
    };
  }
}

// Factory function to create an eBay data source
export const createEbaySource = (config: Partial<DataSourceConfig> = {}): EbaySource => {
  return new EbaySource(config);
};

export default EbaySource;
