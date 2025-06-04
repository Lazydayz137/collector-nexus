import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import { generateToken } from '../utils/generateToken';
import { ApiError } from '../middleware/errorHandler';

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
export const authUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.comparePassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id.toString()),
      });
    } else {
      throw new ApiError(401, 'Invalid email or password');
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
export const registerUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      throw new ApiError(400, 'User already exists');
    }

    const user = await User.create({
      username,
      email,
      password,
      profile: {
        displayName: username,
      },
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id.toString()),
      });
    } else {
      throw new ApiError(400, 'Invalid user data');
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        tcgPreferences: user.tcgPreferences,
        profile: user.profile,
        preferences: user.preferences,
      });
    } else {
      throw new ApiError(404, 'User not found');
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateUserProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.username = req.body.username || user.username;
      user.email = req.body.email || user.email;
      
      if (req.body.password) {
        user.password = req.body.password;
      }

      if (req.body.profile) {
        user.profile = {
          ...user.profile.toObject(),
          ...req.body.profile,
        };
      }

      if (req.body.preferences) {
        user.preferences = {
          ...user.preferences.toObject(),
          ...req.body.preferences,
        };
      }

      if (req.body.tcgPreferences) {
        user.tcgPreferences = {
          ...user.tcgPreferences.toObject(),
          ...req.body.tcgPreferences,
        };
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        tcgPreferences: updatedUser.tcgPreferences,
        profile: updatedUser.profile,
        preferences: updatedUser.preferences,
        token: generateToken(updatedUser._id.toString()),
      });
    } else {
      throw new ApiError(404, 'User not found');
    }
  } catch (error) {
    next(error);
  }
};
