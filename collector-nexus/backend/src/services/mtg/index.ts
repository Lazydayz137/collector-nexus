// Export the MTG service and related types
export { default as mtgService, MTGService } from './mtg.service';
export * from '../data/sources/mtg';
export * from '../../config/mtg.config';

// Re-export types for convenience
export * from '../data/sources/mtg/base.source';
export * from '../data/sources/mtg/scryfall.source';
export * from '../data/sources/mtg/mtgjson.source';
export * from '../data/sources/mtg/cardtrader.source';
// Export the MTG source manager
export { mtgSourceManager } from '../data/sources/mtg/mtg.manager';

// Export the configuration
export { default as mtgConfig, isSourceEnabled } from '../../config/mtg.config';
