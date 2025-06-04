import { Request, Response, NextFunction } from 'express';
import { Collection, Card, PriceHistory } from '../models';
import { ApiError } from '../middleware/errorHandler';

// @desc    Get user's collections
// @route   GET /api/collections
// @access  Private
export const getCollections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collections = await Collection.find({ user: req.user._id });
    
    res.json({
      success: true,
      count: collections.length,
      data: collections,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single collection by ID
// @route   GET /api/collections/:id
// @access  Private
export const getCollectionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collection = await Collection.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate('items.card', 'name set setCode imageUrl');
    
    if (!collection) {
      throw new ApiError(404, 'Collection not found');
    }
    
    // Calculate total value of the collection
    const cardIds = collection.items.map(item => item.card);
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
    
    // Calculate total value
    let totalValue = 0;
    const itemsWithValue = collection.items.map(item => {
      const itemValue = (priceMap.get(item.card._id.toString()) || 0) * item.quantity;
      totalValue += itemValue;
      
      return {
        ...item.toObject(),
        currentValue: itemValue,
      };
    });
    
    res.json({
      success: true,
      data: {
        ...collection.toObject(),
        items: itemsWithValue,
        totalValue,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new collection
// @route   POST /api/collections
// @access  Private
export const createCollection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, isPublic, tcg, tags } = req.body;
    
    const collection = await Collection.create({
      user: req.user._id,
      name,
      description,
      isPublic: isPublic || false,
      tcg: tcg || 'mtg', // Default to MTG
      tags: tags || [],
      items: [],
    });
    
    res.status(201).json({
      success: true,
      data: collection,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a collection
// @route   PUT /api/collections/:id
// @access  Private
export const updateCollection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, isPublic, tags } = req.body;
    
    const collection = await Collection.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        name,
        description,
        isPublic,
        tags,
      },
      { new: true, runValidators: true }
    );
    
    if (!collection) {
      throw new ApiError(404, 'Collection not found');
    }
    
    res.json({
      success: true,
      data: collection,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a collection
// @route   DELETE /api/collections/:id
// @access  Private
export const deleteCollection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collection = await Collection.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!collection) {
      throw new ApiError(404, 'Collection not found');
    }
    
    res.json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add item to collection
// @route   POST /api/collections/:id/items
// @access  Private
export const addCollectionItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId, quantity, condition, isFoil, notes } = req.body;
    
    // Check if card exists
    const card = await Card.findById(cardId);
    if (!card) {
      throw new ApiError(404, 'Card not found');
    }
    
    const collection = await Collection.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!collection) {
      throw new ApiError(404, 'Collection not found');
    }
    
    // Check if item already exists in collection
    const existingItemIndex = collection.items.findIndex(
      item => item.card.toString() === cardId && item.condition === condition && item.isFoil === isFoil
    );
    
    if (existingItemIndex >= 0) {
      // Update quantity if item exists
      collection.items[existingItemIndex].quantity += quantity || 1;
    } else {
      // Add new item
      collection.items.push({
        card: cardId,
        quantity: quantity || 1,
        condition: condition || 'NM', // Default to Near Mint
        isFoil: isFoil || false,
        isAltered: false,
        isSigned: false,
        isGraded: false,
        language: 'English',
        notes: notes || '',
      });
    }
    
    await collection.save();
    
    res.status(201).json({
      success: true,
      data: collection,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update collection item
// @route   PUT /api/collections/:id/items/:itemId
// @access  Private
export const updateCollectionItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quantity, condition, isFoil, isAltered, isSigned, isGraded, grade, language, notes } = req.body;
    
    const collection = await Collection.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!collection) {
      throw new ApiError(404, 'Collection not found');
    }
    
    const itemIndex = collection.items.findIndex(
      item => item._id.toString() === req.params.itemId
    );
    
    if (itemIndex === -1) {
      throw new ApiError(404, 'Item not found in collection');
    }
    
    // Update item fields if they are provided
    if (quantity !== undefined) collection.items[itemIndex].quantity = quantity;
    if (condition) collection.items[itemIndex].condition = condition;
    if (isFoil !== undefined) collection.items[itemIndex].isFoil = isFoil;
    if (isAltered !== undefined) collection.items[itemIndex].isAltered = isAltered;
    if (isSigned !== undefined) collection.items[itemIndex].isSigned = isSigned;
    if (isGraded !== undefined) collection.items[itemIndex].isGraded = isGraded;
    if (grade) collection.items[itemIndex].grade = grade;
    if (language) collection.items[itemIndex].language = language;
    if (notes !== undefined) collection.items[itemIndex].notes = notes;
    
    await collection.save();
    
    res.json({
      success: true,
      data: collection,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove item from collection
// @route   DELETE /api/collections/:id/items/:itemId
// @access  Private
export const removeCollectionItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collection = await Collection.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!collection) {
      throw new ApiError(404, 'Collection not found');
    }
    
    const itemIndex = collection.items.findIndex(
      item => item._id.toString() === req.params.itemId
    );
    
    if (itemIndex === -1) {
      throw new ApiError(404, 'Item not found in collection');
    }
    
    collection.items.splice(itemIndex, 1);
    await collection.save();
    
    res.json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
