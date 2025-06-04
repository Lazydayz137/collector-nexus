import { Router } from 'express';
import authRoutes from './authRoutes';
import collectionRoutes from './collectionRoutes';
import wishlistRoutes from './wishlistRoutes';
import priceRoutes from './priceRoutes';
import mtgRoutes from './mtg.routes';

const router = Router();

// API routes
router.use('/api/auth', authRoutes);
router.use('/api/collections', collectionRoutes);
router.use('/api/wishlists', wishlistRoutes);
router.use('/api/prices', priceRoutes);
router.use('/api/mtg', mtgRoutes); // MTG Data Routes

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler for API routes
router.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
  });
});

// Default route
router.get('/', (req, res) => {
  res.json({
    name: 'Collector\'s Nexus API',
    version: '1.0.0',
    documentation: '/api-docs', // Will add API documentation later
  });
});

export default router;
