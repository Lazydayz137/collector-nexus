// Re-export base types and interfaces
export * from './base.source';

// Export data source implementations
export * from './scryfall.source';
export * from './mtgjson.source';
export * from './cardtrader.source';

// Export factory functions for easier creation
export { createScryfallSource } from './scryfall.source';
export { createMTGJSONSource } from './mtgjson.source';
export { createCardTraderSource } from './cardtrader.source';

// Export type for all MTG data sources
export type MTGDataSource = import('./scryfall.source').ScryfallSource | 
                           import('./mtgjson.source').MTGJSONSource | 
                           import('./cardtrader.source').CardTraderSource;
