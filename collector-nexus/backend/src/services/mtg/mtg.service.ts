import { logger } from '../../utils/logger';
import { mtgConfig, isSourceEnabled } from '../../config/mtg.config';
import { mtgSourceManager } from '../data/sources/mtg/mtg.manager';
import { createScryfallSource } from '../data/sources/mtg/scryfall.source';
import { createMTGJSONSource } from '../data/sources/mtg/mtgjson.source';
import { createCardTraderSource } from '../data/sources/mtg/cardtrader.source';

class MTGService {
  private static instance: MTGService;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): MTGService {
    if (!MTGService.instance) {
      MTGService.instance = new MTGService();
    }
    return MTGService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('MTGService is already initialized');
      return;
    }

    logger.info('Initializing MTG service...');

    try {
      // Initialize Scryfall if enabled
      if (isSourceEnabled('scryfall')) {
        const scryfallConfig = mtgConfig.sources.scryfall;
        const scryfall = createScryfallSource({
          id: 'scryfall',
          name: 'Scryfall',
          baseUrl: scryfallConfig.baseUrl,
          bulkDataEndpoint: scryfallConfig.bulkDataEndpoint,
          rateLimit: scryfallConfig.rateLimit,
        });

        await mtgSourceManager.addSource(scryfall, mtgConfig.defaultSource === 'scryfall');
        logger.info('Scryfall source added to MTG source manager');
      }

      // Initialize MTGJSON if enabled
      if (isSourceEnabled('mtgjson')) {
        const mtgjsonConfig = mtgConfig.sources.mtgjson;
        const mtgjson = createMTGJSONSource({
          id: 'mtgjson',
          name: 'MTGJSON',
          baseUrl: mtgjsonConfig.baseUrl,
          apiKey: mtgjsonConfig.apiKey,
          downloadEndpoint: mtgjsonConfig.downloadEndpoint,
          setListEndpoint: mtgjsonConfig.setListEndpoint,
          rateLimit: mtgjsonConfig.rateLimit,
        });

        await mtgSourceManager.addSource(mtgjson, mtgConfig.defaultSource === 'mtgjson');
        logger.info('MTGJSON source added to MTG source manager');
      }

      // Initialize CardTrader if enabled
      if (isSourceEnabled('cardtrader')) {
        const cardtraderConfig = mtgConfig.sources.cardtrader;
        const cardtrader = createCardTraderSource({
          id: 'cardtrader',
          name: 'CardTrader',
          baseUrl: cardtraderConfig.baseUrl,
          authEndpoint: cardtraderConfig.authEndpoint,
          clientId: cardtraderConfig.clientId,
          clientSecret: cardtraderConfig.clientSecret,
          marketplaceId: cardtraderConfig.marketplaceId,
          rateLimit: cardtraderConfig.rateLimit,
        });

        await mtgSourceManager.addSource(cardtrader, mtgConfig.defaultSource === 'cardtrader');
        logger.info('CardTrader source added to MTG source manager');
      }

      // Set up sync intervals
      if (mtgConfig.syncIntervals.fullSync > 0) {
        mtgSourceManager.startSync(mtgConfig.syncIntervals.fullSync);
        logger.info(`MTG data sync started with interval: ${mtgConfig.syncIntervals.fullSync}ms`);
      }

      this.isInitialized = true;
      logger.info('MTG service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MTG service:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (!this.isInitialized) return;

    logger.info('Closing MTG service...');
    await mtgSourceManager.close();
    this.isInitialized = false;
    logger.info('MTG service closed');
  }

  // Proxy methods to the source manager for convenience
  public async getCardById(id: string, sourceId?: string): Promise<any> {
    this.ensureInitialized();
    return mtgSourceManager.getCardById(id, sourceId);
  }

  public async searchCards(query: string, options: any = {}, sourceId?: string): Promise<any> {
    this.ensureInitialized();
    return mtgSourceManager.searchCards(query, options, sourceId);
  }

  public async getSets(sourceId?: string): Promise<any[]> {
    this.ensureInitialized();
    return mtgSourceManager.getSets(sourceId);
  }

  public async getCardPrice(cardId: string, sourceId?: string): Promise<any> {
    this.ensureInitialized();
    return mtgSourceManager.getCardPrice(cardId, sourceId);
  }

  public async syncAllData(): Promise<Record<string, any>> {
    this.ensureInitialized();
    return mtgSourceManager.syncAllData();
  }

  public async syncPrices(): Promise<Record<string, any>> {
    this.ensureInitialized();
    return mtgSourceManager.syncPrices();
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('MTGService has not been initialized. Call initialize() first.');
    }
  }
}

// Create and export a singleton instance
export const mtgService = MTGService.getInstance();

export default mtgService;
