import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { ApiError } from '../middleware/errorHandler';

// Generate JWT Token
const generateToken = (id: string): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (userExists) {
      throw new ApiError(400, 'User already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id.toString()),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new ApiError(401, 'Invalid credentials');
    }

    res.json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id.toString()),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    user.username = username || user.username;
    user.email = email || user.email;

    const updatedUser = await user.save();

    res.json({
      success: true,
      data: {
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
      },
    });
  } catch (error) {
    next(error);
  }
};
