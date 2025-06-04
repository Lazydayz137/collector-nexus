import { Request, Response, NextFunction } from 'express';
import { PriceHistory, Card } from '../models';
import { ApiError } from '../middleware/errorHandler';
import axios from 'axios';

// @desc    Get price history for a card
// @route   GET /api/prices/cards/:cardId
// @access  Private
export const getCardPriceHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.params;
    const { days = 30, currency = 'USD' } = req.query;
    
    // Check if card exists
    const card = await Card.findById(cardId);
    if (!card) {
      throw new ApiError(404, 'Card not found');
    }
    
    // Find or create price history for the card
    let priceHistory = await PriceHistory.findOne({ card: cardId });
    
    if (!priceHistory) {
      // If no price history exists, create a new one
      priceHistory = await PriceHistory.create({
        card: cardId,
        tcg: card.tcg,
        cardName: card.name,
        setCode: card.setCode,
        prices: [],
      });
    }
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - Number(days));
    
    // Filter prices by date range
    const filteredPrices = priceHistory.prices
      .filter(price => {
        const priceDate = new Date(price.date);
        return priceDate >= startDate && priceDate <= endDate;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Calculate price statistics
    const prices = filteredPrices.map(p => p.price);
    const priceStats = {
      current: prices.length > 0 ? prices[prices.length - 1] : 0,
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
      average: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      change30d: prices.length > 1 ? 
        ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(2) : 0,
    };
    
    res.json({
      success: true,
      data: {
        card: {
          _id: card._id,
          name: card.name,
          set: card.set,
          setCode: card.setCode,
          number: card.number,
          imageUrl: card.imageUrl,
        },
        prices: filteredPrices,
        stats: priceStats,
        currency,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update price history for a card (admin only)
// @route   POST /api/prices/cards/:cardId/update
// @access  Private/Admin
export const updateCardPrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.params;
    const { price, date = new Date(), source = 'manual' } = req.body;
    
    if (!price) {
      throw new ApiError(400, 'Price is required');
    }
    
    // Check if card exists
    const card = await Card.findById(cardId);
    if (!card) {
      throw new ApiError(404, 'Card not found');
    }
    
    // Find or create price history
    let priceHistory = await PriceHistory.findOne({ card: cardId });
    
    if (!priceHistory) {
      priceHistory = await PriceHistory.create({
        card: cardId,
        tcg: card.tcg,
        cardName: card.name,
        setCode: card.setCode,
        prices: [],
      });
    }
    
    // Add new price point
    priceHistory.prices.push({
      date: new Date(date),
      price: Number(price),
      source,
    });
    
    // Sort prices by date
    priceHistory.prices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Update all-time high/low
    const prices = priceHistory.prices.map(p => p.price);
    priceHistory.allTimeHigh = Math.max(...prices);
    priceHistory.allTimeLow = Math.min(...prices);
    
    // Calculate 30-day change if we have enough data
    if (priceHistory.prices.length > 1) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const price30DaysAgo = priceHistory.prices.find(p => new Date(p.date) <= thirtyDaysAgo);
      
      if (price30DaysAgo) {
        const currentPrice = priceHistory.prices[priceHistory.prices.length - 1].price;
        priceHistory.change30d = ((currentPrice - price30DaysAgo.price) / price30DaysAgo.price) * 100;
      }
    }
    
    await priceHistory.save();
    
    res.status(201).json({
      success: true,
      data: priceHistory,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get price alerts for user's wishlist items
// @route   GET /api/prices/alerts
// @access  Private
export const getPriceAlerts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get user's wishlists
    const wishlists = await Wishlist.find({
      user: req.user._id,
      isActive: true,
      'items.0': { $exists: true }, // Only wishlists with items
    }).populate('items.card', 'name set setCode imageUrl');
    
    if (wishlists.length === 0) {
      return res.json({
        success: true,
        data: {
          alerts: [],
          totalAlerts: 0,
        },
      });
    }
    
    // Get all card IDs from wishlist items
    const cardIds = [];
    const wishlistItems = [];
    
    wishlists.forEach(wishlist => {
      wishlist.items.forEach(item => {
        cardIds.push(item.card._id);
        wishlistItems.push({
          wishlistId: wishlist._id,
          wishlistName: wishlist.name,
          itemId: item._id,
          cardId: item.card._id,
          cardName: item.card.name,
          set: item.card.set,
          setCode: item.card.setCode,
          imageUrl: item.card.imageUrl,
          maxPrice: item.maxPrice,
          condition: item.condition,
          isFoil: item.isFoil,
          priority: item.priority,
        });
      });
    });
    
    // Get price histories for all cards
    const priceHistories = await PriceHistory.find({
      card: { $in: cardIds },
    });
    
    // Create a map of cardId to current price
    const priceMap = new Map();
    priceHistories.forEach(ph => {
      if (ph.prices && ph.prices.length > 0) {
        const latestPrice = ph.prices[ph.prices.length - 1];
        priceMap.set(ph.card.toString(), latestPrice.price);
      }
    });
    
    // Check for price alerts
    const alerts = [];
    
    wishlistItems.forEach(item => {
      const currentPrice = priceMap.get(item.cardId.toString());
      
      if (currentPrice && item.maxPrice && currentPrice <= item.maxPrice) {
        alerts.push({
          ...item,
          currentPrice,
          discount: item.maxPrice ? ((item.maxPrice - currentPrice) / item.maxPrice * 100).toFixed(2) : 0,
          alertType: 'price_drop',
          timestamp: new Date(),
        });
      }
    });
    
    // Sort alerts by priority (HIGH, MEDIUM, LOW) and then by discount percentage
    alerts.sort((a, b) => {
      const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.discount - a.discount;
    });
    
    res.json({
      success: true,
      data: {
        alerts,
        totalAlerts: alerts.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get price trends for a set of cards
// @route   POST /api/prices/trends
// @access  Private
export const getPriceTrends = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardIds, days = 30 } = req.body;
    
    if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      throw new ApiError(400, 'Card IDs array is required');
    }
    
    // Get price histories for the requested cards
    const priceHistories = await PriceHistory.find({
      card: { $in: cardIds },
    }).populate('card', 'name set setCode imageUrl');
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - Number(days));
    
    // Process each price history
    const trends = await Promise.all(priceHistories.map(async (ph) => {
      // Filter prices by date range
      const filteredPrices = ph.prices
        .filter(price => {
          const priceDate = new Date(price.date);
          return priceDate >= startDate && priceDate <= endDate;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Calculate price statistics
      const prices = filteredPrices.map(p => p.price);
      
      return {
        card: {
          _id: ph.card._id,
          name: ph.card.name,
          set: ph.card.set,
          setCode: ph.card.setCode,
          imageUrl: ph.card.imageUrl,
        },
        prices: filteredPrices,
        stats: {
          current: prices.length > 0 ? prices[prices.length - 1] : 0,
          min: prices.length > 0 ? Math.min(...prices) : 0,
          max: prices.length > 0 ? Math.max(...prices) : 0,
          average: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
          change: prices.length > 1 ? 
            ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(2) : 0,
        },
      };
    }));
    
    res.json({
      success: true,
      data: {
        trends,
        period: {
          start: startDate,
          end: endDate,
          days: Number(days),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
