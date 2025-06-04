import mongoose, { Document, Schema, Types } from 'mongoose';

// Supported price sources
export type PriceSource = 'TCGPLAYER' | 'CARDMARKET' | 'EBAY' | 'MARKET_AVERAGE';

// Supported price types
export type PriceType = 'MARKET' | 'LOW' | 'MID' | 'HIGH' | 'AVERAGE' | 'BUYLIST';

export interface IPricePoint {
  date: Date;
  price: number;
  source: PriceSource;
  type: PriceType;
  quantity?: number;
  condition?: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
  isFoil?: boolean;
  isSigned?: boolean;
  isAltered?: boolean;
  isGraded?: boolean;
  grade?: string;
  language?: string;
  url?: string;
}

export interface IPriceHistory extends Document {
  card: Types.ObjectId;
  tcg: 'mtg' | 'ptcg';
  prices: IPricePoint[];
  lastUpdated: Date;
  priceChange7d?: number;
  priceChange30d?: number;
  priceChange90d?: number;
  priceChange1y?: number;
  allTimeHigh?: {
    price: number;
    date: Date;
    source: PriceSource;
  };
  allTimeLow?: {
    price: number;
    date: Date;
    source: PriceSource;
  };
}

const pricePointSchema = new Schema<IPricePoint>({
  date: { type: Date, required: true, index: true },
  price: { type: Number, required: true, min: 0 },
  source: {
    type: String,
    required: true,
    enum: ['TCGPLAYER', 'CARDMARKET', 'EBAY', 'MARKET_AVERAGE'],
  },
  type: {
    type: String,
    required: true,
    enum: ['MARKET', 'LOW', 'MID', 'HIGH', 'AVERAGE', 'BUYLIST'],
  },
  quantity: { type: Number, min: 1 },
  condition: {
    type: String,
    enum: ['M', 'NM', 'LP', 'MP', 'HP', 'DMG'],
  },
  isFoil: { type: Boolean },
  isSigned: { type: Boolean },
  isAltered: { type: Boolean },
  isGraded: { type: Boolean },
  grade: { type: String },
  language: { type: String },
  url: { type: String },
});

const priceHistorySchema = new Schema<IPriceHistory>(
  {
    card: { type: Schema.Types.ObjectId, ref: 'Card', required: true, index: true },
    tcg: { type: String, required: true, enum: ['mtg', 'ptcg'], index: true },
    prices: [pricePointSchema],
    lastUpdated: { type: Date, default: Date.now, index: true },
    priceChange7d: { type: Number },
    priceChange30d: { type: Number },
    priceChange90d: { type: Number },
    priceChange1y: { type: Number },
    allTimeHigh: {
      price: { type: Number },
      date: { type: Date },
      source: {
        type: String,
        enum: ['TCGPLAYER', 'CARDMARKET', 'EBAY', 'MARKET_AVERAGE'],
      },
    },
    allTimeLow: {
      price: { type: Number },
      date: { type: Date },
      source: {
        type: String,
        enum: ['TCGPLAYER', 'CARDMARKET', 'EBAY', 'MARKET_AVERAGE'],
      },
    },
  },
  { timestamps: true }
);

// Compound index for efficient querying
priceHistorySchema.index({ card: 1, 'prices.date': -1 });
priceHistorySchema.index({ tcg: 1, 'prices.date': -1 });
priceHistorySchema.index({ 'prices.source': 1, 'prices.type': 1 });

// Pre-save hook to update price change metrics
priceHistorySchema.pre<IPriceHistory>('save', function (next) {
  if (this.isModified('prices') && this.prices.length > 0) {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(now.getDate() - 90);
    
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    // Sort prices by date in descending order
    const sortedPrices = [...this.prices].sort((a, b) => b.date.getTime() - a.date.getTime());
    
    // Get current price (most recent)
    const currentPrice = sortedPrices[0]?.price;
    
    // Helper function to find price by date
    const findPriceByDate = (targetDate: Date) => {
      return sortedPrices.find(p => p.date <= targetDate)?.price;
    };
    
    // Calculate price changes
    const sevenDaysPrice = findPriceByDate(sevenDaysAgo);
    const thirtyDaysPrice = findPriceByDate(thirtyDaysAgo);
    const ninetyDaysPrice = findPriceByDate(ninetyDaysAgo);
    const oneYearPrice = findPriceByDate(oneYearAgo);
    
    // Update price change metrics
    if (currentPrice && sevenDaysPrice) {
      this.priceChange7d = ((currentPrice - sevenDaysPrice) / sevenDaysPrice) * 100;
    }
    
    if (currentPrice && thirtyDaysPrice) {
      this.priceChange30d = ((currentPrice - thirtyDaysPrice) / thirtyDaysPrice) * 100;
    }
    
    if (currentPrice && ninetyDaysPrice) {
      this.priceChange90d = ((currentPrice - ninetyDaysPrice) / ninetyDaysPrice) * 100;
    }
    
    if (currentPrice && oneYearPrice) {
      this.priceChange1y = ((currentPrice - oneYearPrice) / oneYearPrice) * 100;
    }
    
    // Update all-time high/low
    if (sortedPrices.length > 0) {
      const pricesWithSource = sortedPrices.map(p => ({
        price: p.price,
        date: p.date,
        source: p.source,
      }));
      
      const sortedByPrice = [...pricesWithSource].sort((a, b) => b.price - a.price);
      const highest = sortedByPrice[0];
      const lowest = sortedByPrice[sortedByPrice.length - 1];
      
      this.allTimeHigh = {
        price: highest.price,
        date: highest.date,
        source: highest.source as PriceSource,
      };
      
      this.allTimeLow = {
        price: lowest.price,
        date: lowest.date,
        source: lowest.source as PriceSource,
      };
    }
  }
  
  next();
});

export const PriceHistory = mongoose.model<IPriceHistory>('PriceHistory', priceHistorySchema);
