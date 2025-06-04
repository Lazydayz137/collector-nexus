import express from 'express';
import { login, register, getCurrentUser, updateProfile } from '../controllers/authController';
import { protect } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.use(protect);
router.get('/me', getCurrentUser);
router.put('/profile', updateProfile);

export default router;
