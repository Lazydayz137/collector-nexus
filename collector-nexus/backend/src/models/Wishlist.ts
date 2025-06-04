import mongoose, { Document, Schema, Types } from 'mongoose';
import { TCGType } from './Card';

export interface IWishlistItem {
  card: Types.ObjectId;
  quantity: number;
  maxPrice?: number;
  condition: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'DMG' | 'ANY';
  isFoil?: boolean;
  isAltered?: boolean;
  isSigned?: boolean;
  language: string;
  notes?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  addedAt: Date;
  lastNotified?: Date;
}

export interface IWishlist extends Document {
  user: Types.ObjectId;
  tcg: TCGType;
  name: string;
  description?: string;
  isActive: boolean;
  items: IWishlistItem[];
  notificationPreferences: {
    email: boolean;
    push: boolean;
    priceDropPercentage: number;
    frequency: 'IMMEDIATE' | 'DAILY' | 'WEEKLY';
  };
  createdAt: Date;
  updatedAt: Date;
}

const wishlistItemSchema = new Schema<IWishlistItem>({
  card: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  maxPrice: { type: Number, min: 0 },
  condition: {
    type: String,
    required: true,
    enum: ['M', 'NM', 'LP', 'MP', 'HP', 'DMG', 'ANY'],
    default: 'NM',
  },
  isFoil: { type: Boolean },
  isAltered: { type: Boolean },
  isSigned: { type: Boolean },
  language: { type: String, default: 'English' },
  notes: { type: String },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM',
  },
  addedAt: { type: Date, default: Date.now },
  lastNotified: { type: Date },
});

const wishlistSchema = new Schema<IWishlist>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tcg: { type: String, required: true, enum: ['mtg', 'ptcg'] },
    name: { type: String, required: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    items: [wishlistItemSchema],
    notificationPreferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      priceDropPercentage: { type: Number, default: 10, min: 1, max: 100 },
      frequency: {
        type: String,
        enum: ['IMMEDIATE', 'DAILY', 'WEEKLY'],
        default: 'DAILY',
      },
    },
  },
  { timestamps: true }
);

// Indexes for efficient querying
wishlistSchema.index({ user: 1, isActive: 1 });
wishlistSchema.index({ 'items.card': 1 });
wishlistSchema.index({ 'items.lastNotified': 1 });
wishlistSchema.index({ 'notificationPreferences.frequency': 1 });

export const Wishlist = mongoose.model<IWishlist>('Wishlist', wishlistSchema);
