# MTG Data Service

This service provides access to Magic: The Gathering card data from multiple sources, including Scryfall, MTGJSON, and CardTrader. It's designed to be modular, allowing you to enable or disable specific data sources as needed.

## Features

- **Multiple Data Sources**: Fetch card data from Scryfall, MTGJSON, and CardTrader APIs
- **Unified Interface**: Consistent API for accessing card data regardless of the underlying source
- **Automatic Synchronization**: Schedule automatic data synchronization at configurable intervals
- **Rate Limiting**: Built-in rate limiting to respect API usage policies
- **Caching**: Optional caching of API responses to reduce load and improve performance
- **Error Handling**: Comprehensive error handling and logging

## Data Sources

### Scryfall
- **Description**: Comprehensive Magic: The Gathering card database with high-quality images and pricing data
- **API Docs**: https://scryfall.com/docs/api
- **Rate Limits**: 10 requests per second, 10,000 requests per day (for authenticated requests)
- **Data Types**: Cards, sets, rarities, prices, images

### MTGJSON
- **Description**: Open-source Magic: The Gathering card data in JSON format
- **API Docs**: https://mtgjson.com/api/v5/
- **Rate Limits**: 10 requests per minute (unauthenticated), higher for patrons
- **Data Types**: Complete card data, sets, prices, deck lists

### CardTrader
- **Description**: Marketplace for buying and selling Magic: The Gathering cards
- **API Docs**: https://api.cardtrader.com/api-docs
- **Rate Limits**: 60 requests per minute (OAuth2 authenticated)
- **Data Types**: Marketplace prices, inventory, orders

## Installation

1. Install the required dependencies:

```bash
npm install axios dotenv
```

2. Create a `.env` file in your project root with the required environment variables:

```env
# General
MTG_SOURCE_DEFAULT=scryfall

# Scryfall
SCRYFALL_API_BASE_URL=https://api.scryfall.com
SCRYFALL_BULK_DATA_ENDPOINT=/bulk-data

# MTGJSON
MTGJSON_API_BASE_URL=https://mtgjson.com/api/v5
MTGJSON_API_KEY=your_api_key_here
MTGJSON_DOWNLOAD_ENDPOINT=/AllPrintings.json
MTGJSON_SETLIST_ENDPOINT=/SetList.json

# CardTrader
CARDTRADER_API_BASE_URL=https://api.cardtrader.com/api/v2
CARDTRADER_AUTH_ENDPOINT=https://api.cardtrader.com/oauth/token
CARDTRADER_CLIENT_ID=your_client_id_here
CARDTRADER_CLIENT_SECRET=your_client_secret_here
CARDTRADER_MARKETPLACE_ID=1  # 1 = MTG

# Sync Intervals (in milliseconds)
MTG_FULL_SYNC_INTERVAL=86400000  # 24 hours
MTG_PRICE_SYNC_INTERVAL=43200000  # 12 hours
```

## Usage

### Basic Example

```typescript
import { mtgService } from './services/mtg';
import { logger } from './utils/logger';

async function main() {
  try {
    // Initialize the MTG service
    await mtgService.initialize();
    
    // Get a card by ID (Scryfall ID)
    const card = await mtgService.getCardById('9ea8179a-d3c9-4cdc-a955-9d9d853d1b7d');
    logger.info('Card:', card);
    
    // Search for cards
    const results = await mtgService.searchCards('black lotus', { page: 1, pageSize: 10 });
    logger.info('Search results:', results);
    
    // Get sets
    const sets = await mtgService.getSets();
    logger.info(`Found ${sets.length} sets`);
    
    // Get card price
    if (results.data.length > 0) {
      const price = await mtgService.getCardPrice(results.data[0].id);
      logger.info('Price:', price);
    }
    
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    // Clean up
    await mtgService.close();
  }
}

main();
```

### Advanced Usage

#### Using a Specific Data Source

```typescript
// Get a card from a specific source
const card = await mtgService.getCardById('9ea8179a-d3c9-4cdc-a955-9d9d853d1b7d', 'scryfall');
```

#### Syncing Data

```typescript
// Manually trigger a full data sync
const syncResults = await mtgService.syncAllData();

// Manually trigger a price sync
const priceSyncResults = await mtgService.syncPrices();
```

## API Reference

### MTGService

#### `initialize(): Promise<void>`
Initialize the MTG service and all configured data sources.

#### `close(): Promise<void>`
Close the MTG service and clean up resources.

#### `getCardById(id: string, sourceId?: string): Promise<Card | null>`
Get a card by its ID.

- `id`: The card ID (Scryfall ID, MTGJSON UUID, or CardTrader ID)
- `sourceId`: Optional. The ID of the data source to use. If not provided, the default source will be used.

#### `searchCards(query: string, options?: SearchOptions, sourceId?: string): Promise<SearchResult<Card>>`
Search for cards matching the given query.

- `query`: The search query
- `options`: Search options (page, pageSize, etc.)
- `sourceId`: Optional. The ID of the data source to use.

#### `getSets(sourceId?: string): Promise<Set[]>`
Get all MTG sets.

- `sourceId`: Optional. The ID of the data source to use.

#### `getCardPrice(cardId: string, sourceId?: string): Promise<PriceData | null>`
Get the current price of a card.

- `cardId`: The card ID
- `sourceId`: Optional. The ID of the data source to use.

#### `syncAllData(): Promise<Record<string, any>>`
Synchronize all data from all enabled data sources.

#### `syncPrices(): Promise<Record<string, any>>`
Synchronize price data from all enabled data sources.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MTG_SOURCE_DEFAULT` | Default data source to use | `scryfall` |
| `SCRYFALL_API_BASE_URL` | Scryfall API base URL | `https://api.scryfall.com` |
| `SCRYFALL_BULK_DATA_ENDPOINT` | Scryfall bulk data endpoint | `/bulk-data` |
| `MTGJSON_API_BASE_URL` | MTGJSON API base URL | `https://mtgjson.com/api/v5` |
| `MTGJSON_API_KEY` | MTGJSON API key (optional) | |
| `CARDTRADER_API_BASE_URL` | CardTrader API base URL | `https://api.cardtrader.com/api/v2` |
| `CARDTRADER_AUTH_ENDPOINT` | CardTrader OAuth2 token endpoint | `https://api.cardtrader.com/oauth/token` |
| `CARDTRADER_CLIENT_ID` | CardTrader client ID | |
| `CARDTRADER_CLIENT_SECRET` | CardTrader client secret | |
| `CARDTRADER_MARKETPLACE_ID` | CardTrader marketplace ID (1 = MTG) | `1` |
| `MTG_FULL_SYNC_INTERVAL` | Full data sync interval (ms) | `86400000` (24 hours) |
| `MTG_PRICE_SYNC_INTERVAL` | Price sync interval (ms) | `43200000` (12 hours) |

## Testing

To test the MTG service, run:

```bash
ts-node scripts/test-mtg-service.ts
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
