import { Request, Response, NextFunction } from 'express';
import { Card, PriceHistory } from '../models';
import { ApiError } from '../middleware/errorHandler';

// @desc    Get all cards with filtering and pagination
// @route   GET /api/cards
// @access  Public
export const getCards = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};
    
    // Filter by TCG if provided
    if (req.query.tcg) {
      query.tcg = req.query.tcg;
    }
    
    // Filter by set if provided
    if (req.query.set) {
      query.setCode = req.query.set;
    }
    
    // Text search if query parameter is provided
    if (req.query.q) {
      query.$text = { $search: req.query.q as string };
    }
    
    // Execute query with pagination
    const [cards, total] = await Promise.all([
      Card.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ name: 1 }),
      Card.countDocuments(query),
    ]);

    res.json({
      success: true,
      count: cards.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: cards,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single card by ID
// @route   GET /api/cards/:id
// @access  Public
export const getCardById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = await Card.findById(req.params.id);
    
    if (!card) {
      throw new ApiError(404, 'Card not found');
    }
    
    // Get price history for the card
    const priceHistory = await PriceHistory.findOne({ card: card._id });
    
    res.json({
      success: true,
      data: {
        ...card.toObject(),
        priceHistory,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new card (Admin only)
// @route   POST /api/cards
// @access  Private/Admin
export const createCard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = await Card.create(req.body);
    
    res.status(201).json({
      success: true,
      data: card,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a card (Admin only)
// @route   PUT /api/cards/:id
// @access  Private/Admin
export const updateCard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = await Card.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );
    
    if (!card) {
      throw new ApiError(404, 'Card not found');
    }
    
    res.json({
      success: true,
      data: card,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a card (Admin only)
// @route   DELETE /api/cards/:id
// @access  Private/Admin
export const deleteCard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = await Card.findByIdAndDelete(req.params.id);
    
    if (!card) {
      throw new ApiError(404, 'Card not found');
    }
    
    // Also delete associated price history
    await PriceHistory.deleteMany({ card: card._id });
    
    res.json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get price history for a card
// @route   GET /api/cards/:id/prices
// @access  Public
export const getCardPriceHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { source, type, days } = req.query;
    
    const query: any = { card: id };
    
    // Filter by source if provided
    if (source) {
      query['prices.source'] = source;
    }
    
    // Filter by price type if provided
    if (type) {
      query['prices.type'] = type;
    }
    
    // Filter by days if provided
    if (days) {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(days as string));
      query['prices.date'] = { $gte: date };
    }
    
    const priceHistory = await PriceHistory.findOne(query);
    
    if (!priceHistory) {
      throw new ApiError(404, 'Price history not found for this card');
    }
    
    // Filter prices based on query parameters
    let filteredPrices = priceHistory.prices;
    
    if (source) {
      filteredPrices = filteredPrices.filter(p => p.source === source);
    }
    
    if (type) {
      filteredPrices = filteredPrices.filter(p => p.type === type);
    }
    
    if (days) {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(days as string));
      filteredPrices = filteredPrices.filter(p => p.date >= date);
    }
    
    res.json({
      success: true,
      data: {
        ...priceHistory.toObject(),
        prices: filteredPrices,
      },
    });
  } catch (error) {
    next(error);
  }
};
