import express from 'express';
import { protect } from '../middleware/auth';
import {
  getCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  addCardToCollection,
  updateCardInCollection,
  removeCardFromCollection,
} from '../controllers/collectionController';

const router = express.Router();

// Protect all routes with authentication
router.use(protect);

// Collection routes
router.route('/')
  .get(getCollections)
  .post(createCollection);

router.route('/:id')
  .get(getCollectionById)
  .put(updateCollection)
  .delete(deleteCollection);

// Collection item routes
router.route('/:id/items')
  .post(addCardToCollection);

router.route('/:collectionId/items/:itemId')
  .put(updateCardInCollection)
  .delete(removeCardFromCollection);

export default router;
