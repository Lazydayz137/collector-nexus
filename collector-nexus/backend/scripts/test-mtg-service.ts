#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { mtgService } from '../src/services/mtg';
import { logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

async function testMTGService() {
  try {
    logger.info('Starting MTG service test...');
    
    // Initialize the MTG service
    await mtgService.initialize();
    
    // Test getting a card by ID (Scryfall ID)
    const cardId = '9ea8179a-d3c9-4cdc-a955-9d9d853d1b7d'; // Black Lotus
    const card = await mtgService.getCardById(cardId);
    logger.info(`Fetched card by ID (${cardId}):`, {
      name: card?.name,
      set: card?.set,
      type: card?.type_line,
      price: card?.prices?.usd,
    });
    
    // Test searching for cards
    const searchQuery = 'black lotus';
    const searchResults = await mtgService.searchCards(searchQuery, { page: 1, pageSize: 3 });
    logger.info(`Search results for "${searchQuery}":`, {
      total: searchResults.total,
      results: searchResults.data.map((c: any) => ({
        name: c.name,
        set: c.set,
        type: c.type_line,
        price: c.prices?.usd,
      })),
    });
    
    // Test getting sets
    const sets = await mtgService.getSets();
    logger.info(`Fetched ${sets.length} sets`);
    
    // Test getting a card price
    if (searchResults.data.length > 0) {
      const firstCard = searchResults.data[0];
      const price = await mtgService.getCardPrice(firstCard.id);
      logger.info(`Price for ${firstCard.name}:`, price);
    }
    
    // Test syncing data (commented out to avoid excessive API calls)
    // const syncResults = await mtgService.syncAllData();
    // logger.info('Sync results:', syncResults);
    
    // Test syncing prices (commented out to avoid excessive API calls)
    // const priceSyncResults = await mtgService.syncPrices();
    // logger.info('Price sync results:', priceSyncResults);
    
    logger.info('MTG service test completed successfully');
  } catch (error) {
    logger.error('Error testing MTG service:', error);
    process.exit(1);
  } finally {
    // Clean up
    await mtgService.close();
    process.exit(0);
  }
}

// Run the test
testMTGService().catch(error => {
  logger.error('Unhandled error in test:', error);
  process.exit(1);
});
