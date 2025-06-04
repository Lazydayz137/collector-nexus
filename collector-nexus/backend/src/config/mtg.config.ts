import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredVars = [
  'MTG_SOURCE_DEFAULT',
  'SCRYFALL_API_BASE_URL',
  'MTGJSON_API_BASE_URL',
  'MTGJSON_API_KEY',
  'CARDTRADER_API_BASE_URL',
  'CARDTRADER_CLIENT_ID',
  'CARDTRADER_CLIENT_SECRET',
  'CARDTRADER_MARKETPLACE_ID',
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.warn(`Warning: Missing required environment variables: ${missingVars.join(', ')}`);
}

// MTG Data Source Configuration
export const mtgConfig = {
  // Default data source (scryfall, mtgjson, or cardtrader)
  defaultSource: process.env.MTG_SOURCE_DEFAULT || 'scryfall',
  
  // Sync intervals in milliseconds
  syncIntervals: {
    fullSync: parseInt(process.env.MTG_FULL_SYNC_INTERVAL || '86400000', 10), // 24 hours
    priceSync: parseInt(process.env.MTG_PRICE_SYNC_INTERVAL || '43200000', 10), // 12 hours
  },
  
  // Source-specific configurations
  sources: {
    scryfall: {
      enabled: process.env.ENABLE_SCRYFALL !== 'false', // Enabled by default
      baseUrl: process.env.SCRYFALL_API_BASE_URL || 'https://api.scryfall.com',
      bulkDataEndpoint: process.env.SCRYFALL_BULK_DATA_ENDPOINT || '/bulk-data',
      rateLimit: {
        requests: parseInt(process.env.SCRYFALL_RATE_LIMIT_REQUESTS || '10', 10),
        perSeconds: parseInt(process.env.SCRYFALL_RATE_LIMIT_SECONDS || '1', 10),
      },
    },
    
    mtgjson: {
      enabled: process.env.ENABLE_MTGJSON !== 'false', // Enabled by default
      baseUrl: process.env.MTGJSON_API_BASE_URL || 'https://mtgjson.com/api/v5',
      apiKey: process.env.MTGJSON_API_KEY,
      downloadEndpoint: process.env.MTGJSON_DOWNLOAD_ENDPOINT || '/AllPrintings.json',
      setListEndpoint: process.env.MTGJSON_SETLIST_ENDPOINT || '/SetList.json',
      rateLimit: {
        requests: parseInt(process.env.MTGJSON_RATE_LIMIT_REQUESTS || '10', 10),
        perSeconds: parseInt(process.env.MTGJSON_RATE_LIMIT_SECONDS || '60', 10), // MTGJSON has stricter limits
      },
    },
    
    cardtrader: {
      enabled: process.env.ENABLE_CARDTRADER === 'true', // Disabled by default
      baseUrl: process.env.CARDTRADER_API_BASE_URL || 'https://api.cardtrader.com/api/v2',
      authEndpoint: process.env.CARDTRADER_AUTH_ENDPOINT || 'https://api.cardtrader.com/oauth/token',
      clientId: process.env.CARDTRADER_CLIENT_ID,
      clientSecret: process.env.CARDTRADER_CLIENT_SECRET,
      marketplaceId: parseInt(process.env.CARDTRADER_MARKETPLACE_ID || '1', 10), // 1 = MTG
      rateLimit: {
        requests: parseInt(process.env.CARDTRADER_RATE_LIMIT_REQUESTS || '60', 10), // 60 per minute
        perSeconds: parseInt(process.env.CARDTRADER_RATE_LIMIT_SECONDS || '60', 10),
      },
    },
  },
  
  // Data processing options
  dataProcessing: {
    batchSize: parseInt(process.env.MTG_BATCH_SIZE || '100', 10),
    maxRetries: parseInt(process.env.MTG_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.MTG_RETRY_DELAY || '1000', 10), // 1 second
  },
  
  // Caching options
  cache: {
    enabled: process.env.MTG_CACHE_ENABLED !== 'false', // Enabled by default
    ttl: parseInt(process.env.MTG_CACHE_TTL || '3600', 10), // 1 hour
    maxSize: parseInt(process.env.MTG_CACHE_MAX_SIZE || '10000', 10), // 10,000 items
  },
  
  // Logging options
  logging: {
    level: process.env.MTG_LOG_LEVEL || 'info',
    logToFile: process.env.MTG_LOG_TO_FILE === 'true',
    logFilePath: process.env.MTG_LOG_FILE_PATH || './logs/mtg-data.log',
  },
} as const;

// Type for the configuration
export type MTGConfig = typeof mtgConfig;

// Helper function to get configuration for a specific source
export function getSourceConfig(sourceId: string) {
  return mtgConfig.sources[sourceId as keyof typeof mtgConfig.sources];
}

// Helper function to check if a source is enabled
export function isSourceEnabled(sourceId: string): boolean {
  const sourceConfig = getSourceConfig(sourceId);
  return sourceConfig?.enabled === true;
}

export default mtgConfig;
