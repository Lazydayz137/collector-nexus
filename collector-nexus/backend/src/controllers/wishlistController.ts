import { Request, Response, NextFunction } from 'express';
import { Wishlist, Card, PriceHistory } from '../models';
import { ApiError } from '../middleware/errorHandler';

// @desc    Get user's wishlists
// @route   GET /api/wishlists
// @access  Private
export const getWishlists = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wishlists = await Wishlist.find({ user: req.user._id });
    
    res.json({
      success: true,
      count: wishlists.length,
      data: wishlists,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single wishlist by ID
// @route   GET /api/wishlists/:id
// @access  Private
export const getWishlistById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wishlist = await Wishlist.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate('items.card', 'name set setCode imageUrl');
    
    if (!wishlist) {
      throw new ApiError(404, 'Wishlist not found');
    }
    
    // Get current prices for wishlist items
    const cardIds = wishlist.items.map(item => item.card);
    const priceHistories = await PriceHistory.find({
      card: { $in: cardIds },
    });
    
    // Create a map of cardId to current price
    const priceMap = new Map();
    priceHistories.forEach(ph => {
      if (ph.prices && ph.prices.length > 0) {
        // Get the most recent price
        const latestPrice = ph.prices.reduce((latest, current) => 
          current.date > latest.date ? current : latest
        );
        priceMap.set(ph.card.toString(), latestPrice.price);
      }
    });
    
    // Add current price to each wishlist item
    const itemsWithPrice = wishlist.items.map(item => ({
      ...item.toObject(),
      currentPrice: priceMap.get(item.card._id.toString()) || 0,
    }));
    
    res.json({
      success: true,
      data: {
        ...wishlist.toObject(),
        items: itemsWithPrice,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new wishlist
// @route   POST /api/wishlists
// @access  Private
export const createWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, tcg, isActive, notificationPreferences } = req.body;
    
    const wishlist = await Wishlist.create({
      user: req.user._id,
      name,
      description,
      tcg: tcg || 'mtg', // Default to MTG
      isActive: isActive !== undefined ? isActive : true,
      notificationPreferences: {
        email: notificationPreferences?.email ?? true,
        push: notificationPreferences?.push ?? true,
        priceDropPercentage: notificationPreferences?.priceDropPercentage ?? 10,
        frequency: notificationPreferences?.frequency ?? 'DAILY',
      },
      items: [],
    });
    
    res.status(201).json({
      success: true,
      data: wishlist,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a wishlist
// @route   PUT /api/wishlists/:id
// @access  Private
export const updateWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, isActive, notificationPreferences } = req.body;
    
    const updateData: any = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    if (notificationPreferences) {
      updateData.notificationPreferences = {
        email: notificationPreferences.email ?? true,
        push: notificationPreferences.push ?? true,
        priceDropPercentage: notificationPreferences.priceDropPercentage ?? 10,
        frequency: notificationPreferences.frequency ?? 'DAILY',
      };
    }
    
    const wishlist = await Wishlist.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!wishlist) {
      throw new ApiError(404, 'Wishlist not found');
    }
    
    res.json({
      success: true,
      data: wishlist,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a wishlist
// @route   DELETE /api/wishlists/:id
// @access  Private
export const deleteWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wishlist = await Wishlist.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!wishlist) {
      throw new ApiError(404, 'Wishlist not found');
    }
    
    res.json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add item to wishlist
// @route   POST /api/wishlists/:id/items
// @access  Private
export const addWishlistItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId, quantity, maxPrice, condition, isFoil, priority, notes } = req.body;
    
    // Check if card exists
    const card = await Card.findById(cardId);
    if (!card) {
      throw new ApiError(404, 'Card not found');
    }
    
    const wishlist = await Wishlist.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!wishlist) {
      throw new ApiError(404, 'Wishlist not found');
    }
    
    // Check if item already exists in wishlist
    const existingItemIndex = wishlist.items.findIndex(
      item => item.card.toString() === cardId && 
             item.condition === (condition || 'NM') && 
             item.isFoil === (isFoil || false)
    );
    
    if (existingItemIndex >= 0) {
      // Update quantity if item exists
      wishlist.items[existingItemIndex].quantity += quantity || 1;
      if (maxPrice !== undefined) {
        wishlist.items[existingItemIndex].maxPrice = maxPrice;
      }
      if (priority) {
        wishlist.items[existingItemIndex].priority = priority;
      }
      if (notes !== undefined) {
        wishlist.items[existingItemIndex].notes = notes;
      }
    } else {
      // Add new item
      wishlist.items.push({
        card: cardId,
        quantity: quantity || 1,
        maxPrice: maxPrice,
        condition: condition || 'NM',
        isFoil: isFoil || false,
        priority: priority || 'MEDIUM',
        notes: notes || '',
        language: 'English',
      });
    }
    
    await wishlist.save();
    
    res.status(201).json({
      success: true,
      data: wishlist,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update wishlist item
// @route   PUT /api/wishlists/:id/items/:itemId
// @access  Private
export const updateWishlistItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quantity, maxPrice, condition, isFoil, priority, notes } = req.body;
    
    const wishlist = await Wishlist.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!wishlist) {
      throw new ApiError(404, 'Wishlist not found');
    }
    
    const itemIndex = wishlist.items.findIndex(
      item => item._id.toString() === req.params.itemId
    );
    
    if (itemIndex === -1) {
      throw new ApiError(404, 'Item not found in wishlist');
    }
    
    // Update item fields if they are provided
    if (quantity !== undefined) wishlist.items[itemIndex].quantity = quantity;
    if (maxPrice !== undefined) wishlist.items[itemIndex].maxPrice = maxPrice;
    if (condition) wishlist.items[itemIndex].condition = condition;
    if (isFoil !== undefined) wishlist.items[itemIndex].isFoil = isFoil;
    if (priority) wishlist.items[itemIndex].priority = priority;
    if (notes !== undefined) wishlist.items[itemIndex].notes = notes;
    
    await wishlist.save();
    
    res.json({
      success: true,
      data: wishlist,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove item from wishlist
// @route   DELETE /api/wishlists/:id/items/:itemId
// @access  Private
export const removeWishlistItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wishlist = await Wishlist.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!wishlist) {
      throw new ApiError(404, 'Wishlist not found');
    }
    
    const itemIndex = wishlist.items.findIndex(
      item => item._id.toString() === req.params.itemId
    );
    
    if (itemIndex === -1) {
      throw new ApiError(404, 'Item not found in wishlist');
    }
    
    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();
    
    res.json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
