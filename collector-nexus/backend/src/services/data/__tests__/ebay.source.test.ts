import { describe, beforeAll, afterAll, it, expect, jest } from '@jest/globals';
import { dataSourceManager } from '../source.manager';
import { createEbaySource } from '../sources/ebay.source';
import { ApiError } from '../../../middleware/errorHandler';

// Mock the eBay API responses
const mockEbayResponse = {
  itemSummaries: [
    {
      itemId: 'v1|123456789012|123456789012',
      title: 'Test Item',
      price: {
        value: '19.99',
        currency: 'USD',
      },
      condition: 'NEW',
      conditionId: '1000',
      itemWebUrl: 'https://www.ebay.com/itm/123456789012',
      seller: {
        username: 'test_seller',
        feedbackPercentage: '98.5%',
        feedbackScore: 1234,
      },
      shippingOptions: [
        {
          shippingCostType: 'FIXED',
          shippingCost: {
            value: '0.00',
            currency: 'USD',
          },
          shippingServiceCode: 'USPSFirstClass',
        },
      ],
      thumbnailImages: [
        {
          imageUrl: 'https://i.ebayimg.com/test.jpg',
        },
      ],
    },
  ],
  total: 1,
  limit: 1,
  offset: 0,
};

// Mock axios
jest.mock('axios');
const axios = require('axios');

describe('eBay Data Source', () => {
  let ebaySource: any;
  
  beforeAll(async () => {
    // Mock the authentication response
    axios.post.mockResolvedValueOnce({
      data: {
        access_token: 'test_token',
        expires_in: 7200,
        token_type: 'Bearer',
      },
    });
    
    // Mock the search response
    axios.get.mockResolvedValueOnce({
      data: mockEbayResponse,
      headers: {
        'x-ebay-api-rate-limit-remaining': '4999',
        'x-ebay-api-rate-limit-reset': Math.floor(Date.now() / 1000) + 3600,
      },
    });
    
    // Create an eBay data source
    ebaySource = createEbaySource({
      id: 'ebay-test',
      name: 'eBay Test',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      marketplaceId: 'EBAY-US',
      compatibilityLevel: 1234,
      siteId: 0,
    });
    
    // Register the data source
    dataSourceManager.registerSource(ebaySource, true);
    
    // Initialize the data source manager
    await dataSourceManager.initialize();
  });
  
  afterAll(async () => {
    // Clean up
    await dataSourceManager.close();
  });
  
  it('should initialize the eBay data source', () => {
    expect(ebaySource).toBeDefined();
    expect(ebaySource.id).toBe('ebay-test');
    expect(ebaySource.name).toBe('eBay Test');
  });
  
  it('should fetch items from eBay', async () => {
    // Mock the search response
    axios.get.mockResolvedValueOnce({
      data: mockEbayResponse,
      headers: {
        'x-ebay-api-rate-limit-remaining': '4998',
        'x-ebay-api-rate-limit-reset': Math.floor(Date.now() / 1000) + 3600,
      },
    });
    
    const results = await dataSourceManager.fetch('ebay-test', {
      query: 'test',
      limit: 1,
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('ebay-test');
    expect(results[0].data).toHaveLength(1);
    expect(results[0].data[0].itemId).toBe('v1|123456789012|123456789012');
    expect(results[0].data[0].title).toBe('Test Item');
  });
  
  it('should fetch an item by ID from eBay', async () => {
    // Mock the item response
    axios.get.mockResolvedValueOnce({
      data: mockEbayResponse.itemSummaries[0],
      headers: {
        'x-ebay-api-rate-limit-remaining': '4997',
        'x-ebay-api-rate-limit-reset': Math.floor(Date.now() / 1000) + 3600,
      },
    });
    
    const result = await dataSourceManager.fetchById('v1|123456789012|123456789012', 'ebay-test');
    
    expect(result).toBeDefined();
    expect(result?.source).toBe('ebay-test');
    expect(result?.data.itemId).toBe('v1|123456789012|123456789012');
    expect(result?.data.title).toBe('Test Item');
  });
  
  it('should handle errors when fetching items', async () => {
    // Mock an error response
    axios.get.mockRejectedValueOnce({
      response: {
        status: 404,
        data: { message: 'Item not found' },
      },
    });
    
    await expect(
      dataSourceManager.fetch('ebay-test', { query: 'nonexistent' })
    ).rejects.toThrow(ApiError);
  });
  
  it('should get the status of the eBay data source', async () => {
    const status = await dataSourceManager.getStatus();
    
    expect(status).toBeDefined();
    expect(status.sources).toHaveLength(1);
    expect(status.sources[0].id).toBe('ebay-test');
    expect(status.sources[0].status).toBe('ok');
  });
});
