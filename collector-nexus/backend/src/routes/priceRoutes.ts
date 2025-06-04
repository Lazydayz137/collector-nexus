import express from 'express';
import { protect } from '../middleware/auth';
import { admin } from '../middleware/auth';
import {
  getCardPriceHistory,
  updateCardPrice,
  getPriceAlerts,
  getPriceTrends,
} from '../controllers/priceController';

const router = express.Router();

// Protected routes (require authentication)
router.use(protect);

// Public price data
router.get('/cards/:cardId', getCardPriceHistory);
router.get('/alerts', getPriceAlerts);
router.post('/trends', getPriceTrends);

// Admin-only routes
router.use(admin);
router.post('/cards/:cardId/update', updateCardPrice);

export default router;
