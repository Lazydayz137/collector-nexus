import { logger } from '../../utils/logger';
import { ApiError } from '../../middleware/errorHandler';
import { DataRecord } from './acquisition.service';

// Define interfaces for data processing
export interface DataTransformation {
  name: string;
  description?: string;
  apply: (data: any, context?: any) => Promise<any>;
}

export interface DataValidationRule {
  name: string;
  description?: string;
  validate: (data: any) => Promise<{
    isValid: boolean;
    errors: string[];
  }>;
}

export interface DataProcessingOptions {
  validate?: boolean;
  transform?: boolean;
  enrich?: boolean;
  normalize?: boolean;
}

class DataProcessingService {
  private transformations: Map<string, DataTransformation> = new Map();
  private validationRules: Map<string, DataValidationRule> = new Map();
  private defaultOptions: DataProcessingOptions = {
    validate: true,
    transform: true,
    enrich: true,
    normalize: true,
  };

  constructor() {
    this.initializeDefaultTransformations();
    this.initializeDefaultValidationRules();
  }

  /**
   * Initialize default data transformations
   */
  private initializeDefaultTransformations(): void {
    // Add default transformations
    this.addTransformation({
      name: 'trim-strings',
      description: 'Trim whitespace from string values',
      apply: async (data: any) => {
        const transform = (obj: any): any => {
          if (typeof obj === 'string') return obj.trim();
          if (Array.isArray(obj)) return obj.map(transform);
          if (typeof obj === 'object' && obj !== null) {
            return Object.fromEntries(
              Object.entries(obj).map(([key, value]) => [key, transform(value)])
            );
          }
          return obj;
        };
        return transform(data);
      },
    });

    this.addTransformation({
      name: 'convert-numbers',
      description: 'Convert string numbers to actual numbers',
      apply: async (data: any) => {
        const transform = (obj: any): any => {
          if (typeof obj === 'string' && /^\d+(\.\d+)?$/.test(obj)) {
            return parseFloat(obj);
          }
          if (Array.isArray(obj)) return obj.map(transform);
          if (typeof obj === 'object' && obj !== null) {
            return Object.fromEntries(
              Object.entries(obj).map(([key, value]) => [key, transform(value)])
            );
          }
          return obj;
        };
        return transform(data);
      },
    });

    // Add more default transformations as needed
  }

  /**
   * Initialize default validation rules
   */
  private initializeDefaultValidationRules(): void {
    // Add default validation rules
    this.addValidationRule({
      name: 'required-fields',
      description: 'Check for required fields',
      validate: async (data: any) => {
        const errors: string[] = [];
        const requiredFields = ['id', 'name', 'price', 'source'];
        
        for (const field of requiredFields) {
          if (data[field] === undefined || data[field] === null || data[field] === '') {
            errors.push(`Missing required field: ${field}`);
          }
        }
        
        return {
          isValid: errors.length === 0,
          errors,
        };
      },
    });

    this.addValidationRule({
      name: 'valid-price',
      description: 'Ensure price is a valid number',
      validate: async (data: any) => {
        if (data.price === undefined || data.price === null) {
          return { isValid: false, errors: ['Price is required'] };
        }
        
        const price = parseFloat(data.price);
        if (isNaN(price) || price < 0) {
          return { isValid: false, errors: ['Price must be a valid positive number'] };
        }
        
        return { isValid: true, errors: [] };
      },
    });

    // Add more default validation rules as needed
  }

  /**
   * Add a new data transformation
   */
  addTransformation(transformation: DataTransformation): void {
    if (this.transformations.has(transformation.name)) {
      throw new ApiError(409, `Transformation '${transformation.name}' already exists`);
    }
    this.transformations.set(transformation.name, transformation);
    logger.debug(`Added transformation: ${transformation.name}`);
  }

  /**
   * Remove a data transformation
   */
  removeTransformation(name: string): boolean {
    return this.transformations.delete(name);
  }

  /**
   * Add a new validation rule
   */
  addValidationRule(rule: DataValidationRule): void {
    if (this.validationRules.has(rule.name)) {
      throw new ApiError(409, `Validation rule '${rule.name}' already exists`);
    }
    this.validationRules.set(rule.name, rule);
    logger.debug(`Added validation rule: ${rule.name}`);
  }

  /**
   * Remove a validation rule
   */
  removeValidationRule(name: string): boolean {
    return this.validationRules.delete(name);
  }

  /**
   * Process a data record through the pipeline
   */
  async processRecord(
    record: DataRecord,
    options: DataProcessingOptions = {}
  ): Promise<DataRecord> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const { validate, transform, enrich, normalize } = mergedOptions;
    
    try {
      let processedData = { ...record };
      
      // Apply transformations if enabled
      if (transform) {
        processedData = await this.applyTransformations(processedData);
      }
      
      // Validate data if enabled
      if (validate) {
        const validationResult = await this.validateData(processedData);
        if (!validationResult.isValid) {
          throw new ApiError(400, 'Data validation failed', {
            errors: validationResult.errors,
          });
        }
      }
      
      // Enrich data if enabled
      if (enrich) {
        processedData = await this.enrichData(processedData);
      }
      
      // Normalize data if enabled
      if (normalize) {
        processedData = await this.normalizeData(processedData);
      }
      
      // Update record metadata
      processedData.metadata.processedAt = new Date();
      processedData.metadata.status = 'processed';
      
      return processedData;
      
    } catch (error) {
      // Update record with error
      record.metadata.status = 'failed';
      record.metadata.error = error.message;
      
      if (error.details) {
        record.metadata.details = error.details;
      }
      
      throw error;
    }
  }

  /**
   * Apply all transformations to the data
   */
  private async applyTransformations(data: any): Promise<any> {
    let result = { ...data };
    
    for (const [name, transformation] of this.transformations.entries()) {
      try {
        logger.debug(`Applying transformation: ${name}`);
        result = await transformation.apply(result);
      } catch (error) {
        logger.error(`Error applying transformation '${name}':`, error);
        throw new ApiError(500, `Error applying transformation '${name}'`);
      }
    }
    
    return result;
  }

  /**
   * Validate data against all validation rules
   */
  private async validateData(data: any): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    for (const [name, rule] of this.validationRules.entries()) {
      try {
        logger.debug(`Validating with rule: ${name}`);
        const result = await rule.validate(data);
        
        if (!result.isValid) {
          errors.push(...result.errors);
        }
      } catch (error) {
        logger.error(`Error validating with rule '${name}':`, error);
        errors.push(`Validation error in rule '${name}': ${error.message}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Enrich data with additional information
   */
  private async enrichData(data: any): Promise<any> {
    // Add timestamps if not present
    if (!data.createdAt) {
      data.createdAt = new Date().toISOString();
    }
    
    if (!data.updatedAt) {
      data.updatedAt = new Date().toISOString();
    }
    
    // Add a unique ID if not present
    if (!data.id) {
      data.id = this.generateUniqueId();
    }
    
    // Add source information if not present
    if (!data.metadata) {
      data.metadata = {};
    }
    
    if (!data.metadata.processedAt) {
      data.metadata.processedAt = new Date().toISOString();
    }
    
    // Add more enrichment logic as needed
    
    return data;
  }

  /**
   * Normalize data to a standard format
   */
  private async normalizeData(data: any): Promise<any> {
    // Ensure consistent field names
    const normalized: Record<string, any> = {};
    
    // Map common field names to a standard format
    const fieldMappings: Record<string, string> = {
      // eBay fields
      'itemId': 'id',
      'title': 'name',
      'galleryURL': 'imageUrl',
      'viewItemURL': 'url',
      'sellingStatus': 'priceInfo',
      'currentPrice': 'price',
      'convertedCurrentPrice': 'price',
      'primaryCategory': 'category',
      'categoryName': 'category',
      'condition': 'condition',
      'conditionDisplayName': 'condition',
      'location': 'location',
      'country': 'country',
      'shippingInfo': 'shipping',
      'shippingServiceCost': 'shippingCost',
      'shippingType': 'shippingType',
      'shipToLocations': 'shipsTo',
      'listingInfo': 'listingInfo',
      'startTime': 'startTime',
      'endTime': 'endTime',
      'listingType': 'listingType',
      'returnsAccepted': 'returnsAccepted',
      'sellerInfo': 'seller',
      'sellerUserName': 'sellerName',
      'feedbackScore': 'sellerRating',
      'positiveFeedbackPercent': 'sellerPositiveRating',
      'topRatedSeller': 'isTopRatedSeller',
      'topRatedListing': 'isTopRatedListing',
    };
    
    // Apply field mappings
    for (const [sourceField, targetField] of Object.entries(fieldMappings)) {
      if (data[sourceField] !== undefined) {
        normalized[targetField] = data[sourceField];
      }
    }
    
    // Copy any remaining fields that weren't mapped
    for (const [key, value] of Object.entries(data)) {
      if (!(key in fieldMappings) && !(key in normalized)) {
        normalized[key] = value;
      }
    }
    
    // Normalize price information
    if (normalized.priceInfo) {
      const priceInfo = normalized.priceInfo;
      
      if (priceInfo.currentPrice) {
        const currentPrice = priceInfo.currentPrice;
        normalized.price = currentPrice.__value__ || currentPrice.value || currentPrice;
        normalized.currency = currentPrice['@currencyId'] || currentPrice.currency || 'USD';
      }
      
      if (priceInfo.convertedCurrentPrice) {
        const convertedPrice = priceInfo.convertedCurrentPrice;
        normalized.convertedPrice = convertedPrice.__value__ || convertedPrice.value || convertedPrice;
        normalized.convertedCurrency = convertedPrice['@currencyId'] || convertedPrice.currency || 'USD';
      }
      
      // Remove the original priceInfo object
      delete normalized.priceInfo;
    }
    
    // Normalize category information
    if (normalized.category) {
      if (typeof normalized.category === 'string') {
        normalized.category = {
          id: '',
          name: normalized.category,
        };
      } else if (normalized.category.categoryId) {
        normalized.category = {
          id: normalized.category.categoryId,
          name: normalized.category.categoryName || '',
        };
      }
    }
    
    // Normalize seller information
    if (normalized.sellerInfo) {
      const sellerInfo = normalized.sellerInfo;
      normalized.seller = {
        id: sellerInfo.sellerUserId || sellerInfo.userId || '',
        name: sellerInfo.sellerUserName || sellerInfo.userName || '',
        feedbackScore: sellerInfo.feedbackScore || 0,
        positiveFeedbackPercent: sellerInfo.positiveFeedbackPercent || 0,
        topRated: !!sellerInfo.topRatedSeller,
      };
      
      // Remove the original sellerInfo object
      delete normalized.sellerInfo;
    }
    
    // Normalize shipping information
    if (normalized.shippingInfo) {
      const shippingInfo = normalized.shippingInfo;
      normalized.shipping = {
        cost: shippingInfo.shippingServiceCost?.__value__ || shippingInfo.shippingServiceCost?.value || 0,
        currency: shippingInfo.shippingServiceCost?.['@currencyId'] || shippingInfo.shippingServiceCost?.currency || 'USD',
        type: shippingInfo.shippingType || 'Flat',
        locations: shippingInfo.shipToLocations || [],
        expedited: shippingInfo.expeditedShipping === 'true',
        oneDayShippingAvailable: shippingInfo.oneDayShippingAvailable === 'true',
        handlingTime: shippingInfo.handlingTime ? parseInt(shippingInfo.handlingTime, 10) : undefined,
      };
      
      // Remove the original shippingInfo object
      delete normalized.shippingInfo;
    }
    
    // Normalize listing information
    if (normalized.listingInfo) {
      const listingInfo = normalized.listingInfo;
      normalized.listing = {
        type: listingInfo.listingType || 'Auction',
        startTime: listingInfo.startTime ? new Date(listingInfo.startTime) : undefined,
        endTime: listingInfo.endTime ? new Date(listingInfo.endTime) : undefined,
        buyItNowAvailable: listingInfo.buyItNowAvailable === 'true',
        buyItNowPrice: listingInfo.buyItNowPrice?.__value__ || listingInfo.buyItNowPrice?.value,
        buyItNowCurrency: listingInfo.buyItNowPrice?.['@currencyId'] || listingInfo.buyItNowPrice?.currency || 'USD',
        bestOfferEnabled: listingInfo.bestOfferEnabled === 'true',
        buyItNowPriceConverted: listingInfo.convertedBuyItNowPrice?.__value__ || listingInfo.convertedBuyItNowPrice?.value,
        buyItNowCurrencyConverted: listingInfo.convertedBuyItNowPrice?.['@currencyId'] || listingInfo.convertedBuyItNowPrice?.currency || 'USD',
      };
      
      // Remove the original listingInfo object
      delete normalized.listingInfo;
    }
    
    // Normalize condition information
    if (normalized.condition) {
      if (typeof normalized.condition === 'string') {
        normalized.condition = {
          id: '',
          name: normalized.condition,
          displayName: normalized.condition,
        };
      } else if (normalized.condition.conditionId) {
        normalized.condition = {
          id: normalized.condition.conditionId,
          name: normalized.condition.conditionDisplayName || '',
          displayName: normalized.condition.conditionDisplayName || '',
        };
      }
    }
    
    // Ensure required fields
    if (!normalized.id) {
      normalized.id = this.generateUniqueId();
    }
    
    if (!normalized.name) {
      normalized.name = 'Untitled Item';
    }
    
    if (normalized.price === undefined) {
      normalized.price = 0;
    }
    
    if (!normalized.currency) {
      normalized.currency = 'USD';
    }
    
    if (!normalized.source) {
      normalized.source = 'unknown';
    }
    
    // Add timestamps if not present
    if (!normalized.createdAt) {
      normalized.createdAt = new Date().toISOString();
    }
    
    if (!normalized.updatedAt) {
      normalized.updatedAt = new Date().toISOString();
    }
    
    return normalized;
  }

  /**
   * Generate a unique ID
   */
  private generateUniqueId(): string {
    return `item_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  }
}

// Export a singleton instance
export const dataProcessingService = new DataProcessingService();

export default dataProcessingService;
