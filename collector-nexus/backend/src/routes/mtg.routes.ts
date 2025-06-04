import { Router } from 'express';
import {
  searchCards,
  getCardById,
  getCardPrice,
  getSets,
  syncAllData,
  syncPrices,
} from '../controllers/mtg.controller';
// import { protect, admin } from '../middleware/auth.middleware'; // Assuming you have auth middleware

const router = Router();

// Public routes
router.get('/cards/search', searchCards);
router.get('/cards/:id', getCardById);
router.get('/cards/:id/price', getCardPrice);
router.get('/sets', getSets);

// Admin/Protected routes for sync operations
// TODO: Uncomment and use actual auth middleware (protect, admin) when implemented
router.post('/sync/data', /* protect, admin, */ syncAllData);
router.post('/sync/prices', /* protect, admin, */ syncPrices);

export default router;
