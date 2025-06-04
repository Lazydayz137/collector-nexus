# Data Source System

This module provides a flexible and extensible system for integrating with various data sources, with built-in support for the eBay API. The system is designed to be easily extended to support additional data sources in the future.

## Features

- **Unified Interface**: All data sources implement a common interface, making it easy to switch between them.
- **Authentication Handling**: Built-in support for OAuth and API key authentication.
- **Rate Limiting**: Automatic rate limit handling with retry logic.
- **Error Handling**: Consistent error handling and reporting.
- **Batched Operations**: Support for fetching multiple items in a single request when possible.
- **Status Monitoring**: Built-in status and health monitoring.

## Available Data Sources

### eBay API

The eBay data source provides access to eBay's Buy APIs, allowing you to search for items, get item details, and more.

#### Configuration

```typescript
import { createEbaySource } from './sources/ebay.source';

const ebaySource = createEbaySource({
  id: 'ebay-us',
  name: 'eBay US',
  apiKey: process.env.EBAY_API_KEY,
  apiSecret: process.env.EBAY_API_SECRET,
  marketplaceId: 'EBAY-US',
  compatibilityLevel: 1234,
  siteId: 0,
});
```

#### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `EBAY_API_KEY` | eBay API key | Yes | - |
| `EBAY_API_SECRET` | eBay API secret | Yes | - |
| `EBAY_API_ENDPOINT` | eBay API endpoint | No | `https://api.ebay.com` |
| `EBAY_MARKETPLACE_ID` | eBay marketplace ID | No | `EBAY-US` |
| `EBAY_COMPATIBILITY_LEVEL` | API compatibility level | No | `1234` |
| `EBAY_SITE_ID` | eBay site ID | No | `0` (US) |

## Data Source Manager

The `DataSourceManager` is a singleton that manages all registered data sources.

### Usage

```typescript
import { dataSourceManager, createEbaySource } from './services/data';

// Register a data source
const ebaySource = createEbaySource({
  id: 'ebay-us',
  name: 'eBay US',
  // ... config
});

dataSourceManager.registerSource(ebaySource, true);

// Initialize all data sources
await dataSourceManager.initialize();

// Fetch items from a specific source
const results = await dataSourceManager.fetch('ebay-us', {
  query: 'collectible',
  limit: 10,
});

// Get an item by ID
const item = await dataSourceManager.fetchById('v1|123456789012|123456789012', 'ebay-us');

// Get the status of all data sources
const status = await dataSourceManager.getStatus();

// Close all data sources
await dataSourceManager.close();
```

## Creating a Custom Data Source

To create a custom data source, implement the `DataSource` interface:

```typescript
import { DataSource, DataSourceConfig, FetchOptions, FetchResult } from './sources/base.source';

export class MyCustomSource implements DataSource {
  public readonly id: string;
  public readonly name: string;
  public readonly type = 'custom';
  public readonly config: DataSourceConfig;

  constructor(config: Partial<DataSourceConfig> = {}) {
    this.id = config.id || 'custom';
    this.name = config.name || 'Custom Source';
    this.config = {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: true,
      priority: 1,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    // Initialize the data source
  }

  async close(): Promise<void> {
    // Clean up resources
  }

  async fetch(options: FetchOptions = {}): Promise<FetchResult> {
    // Fetch data from the data source
    return {
      data: [],
      total: 0,
      limit: options.limit || 10,
      offset: options.offset || 0,
      hasMore: false,
      source: this.id,
    };
  }

  async fetchById(id: string): Promise<any> {
    // Fetch a single item by ID
    return null;
  }

  async fetchBatch(ids: string[]): Promise<any[]> {
    // Fetch multiple items by ID
    return [];
  }

  async isAvailable(): Promise<boolean> {
    // Check if the data source is available
    return true;
  }

  async getStatus() {
    // Return the status of the data source
    return {
      status: 'ok',
      message: 'Service is operational',
    };
  }

  async getRateLimitStatus() {
    // Return rate limit information if applicable
    return null;
  }
}
```

## Error Handling

All errors are wrapped in an `ApiError` with the following structure:

```typescript
{
  statusCode: number;      // HTTP status code
  message: string;          // Error message
  details?: any;            // Additional error details
  code?: string;            // Error code
  source?: string;          // Source of the error
}
```

## Rate Limiting

The data source system includes built-in rate limiting support. Each data source can implement its own rate limiting logic by implementing the `getRateLimitStatus()` method.

## Testing

Tests are located in the `__tests__` directory. To run the tests:

```bash
npm test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
