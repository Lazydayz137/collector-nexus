import { Request, Response, NextFunction } from 'express';
import { mtgService } from '../services/mtg';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/ApiError';

// Helper to get sourceId from query or use default
const getSourceId = (req: Request): string | undefined => {
  return req.query.source as string | undefined;
};

export const searchCards = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      throw new ApiError(400, 'Search query (q) is required');
    }
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '20', 10);
    const sourceId = getSourceId(req);

    const result = await mtgService.searchCards(query, { page, pageSize }, sourceId);
    res.json(result);
  } catch (error) {
    logger.error('Error searching cards:', error);
    next(error);
  }
};

export const getCardById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sourceId = getSourceId(req);
    const card = await mtgService.getCardById(id, sourceId);
    if (!card) {
      throw new ApiError(404, `Card with ID ${id} not found`);
    }
    res.json(card);
  } catch (error) {
    logger.error(`Error fetching card by ID ${req.params.id}:`, error);
    next(error);
  }
};

export const getCardPrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sourceId = getSourceId(req);
    const price = await mtgService.getCardPrice(id, sourceId);
    if (!price) {
      throw new ApiError(404, `Price for card ID ${id} not found`);
    }
    res.json(price);
  } catch (error) {
    logger.error(`Error fetching price for card ID ${req.params.id}:`, error);
    next(error);
  }
};

export const getSets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sourceId = getSourceId(req);
    const sets = await mtgService.getSets(sourceId);
    res.json(sets);
  } catch (error) {
    logger.error('Error fetching sets:', error);
    next(error);
  }
};

export const syncAllData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Manual full data sync triggered via API.');
    // Note: This could be a long-running operation. 
    // For a real MVP, consider making this asynchronous or providing immediate feedback.
    const result = await mtgService.syncAllData();
    res.status(202).json({ message: 'Full data synchronization initiated.', details: result });
  } catch (error) {
    logger.error('Error triggering full data sync:', error);
    next(error);
  }
};

export const syncPrices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Manual price sync triggered via API.');
    const result = await mtgService.syncPrices();
    res.status(202).json({ message: 'Price synchronization initiated.', details: result });
  } catch (error) {
    logger.error('Error triggering price sync:', error);
    next(error);
  }
};
