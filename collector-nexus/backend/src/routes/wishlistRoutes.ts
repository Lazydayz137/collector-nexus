import express from 'express';
import { protect } from '../middleware/auth';
import {
  getWishlists,
  getWishlistById,
  createWishlist,
  updateWishlist,
  deleteWishlist,
  addWishlistItem,
  updateWishlistItem,
  removeWishlistItem,
} from '../controllers/wishlistController';

const router = express.Router();

// Protect all routes with authentication
router.use(protect);

// Wishlist routes
router.route('/')
  .get(getWishlists)
  .post(createWishlist);

router.route('/:id')
  .get(getWishlistById)
  .put(updateWishlist)
  .delete(deleteWishlist);

// Wishlist item routes
router.route('/:id/items')
  .post(addWishlistItem);

router.route('/:wishlistId/items/:itemId')
  .put(updateWishlistItem)
  .delete(removeWishlistItem);

export default router;
