// Export base interfaces and types
export * from './base.source';

// Export data source implementations
export * from './ebay.source';

// Export factory functions
export { createEbaySource } from './ebay.source';

// Export types for convenience
export type { DataSource, DataSourceConfig, FetchOptions, FetchResult } from './base.source';
