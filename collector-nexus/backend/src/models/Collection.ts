import mongoose, { Document, Schema, Types } from 'mongoose';
import { TCGType } from './Card';

export interface ICollectionItem {
  card: Types.ObjectId;
  quantity: number;
  condition: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
  isFoil: boolean;
  isAltered: boolean;
  isSigned: boolean;
  isGraded: boolean;
  grade?: string;
  language: string;
  purchasePrice?: number;
  purchaseCurrency: string;
  purchaseDate?: Date;
  notes?: string;
  images?: string[];
  lastUpdated: Date;
}

export interface ICollection extends Document {
  user: Types.ObjectId;
  tcg: TCGType;
  name: string;
  description?: string;
  isPublic: boolean;
  items: ICollectionItem[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const collectionItemSchema = new Schema<ICollectionItem>({
  card: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  condition: {
    type: String,
    required: true,
    enum: ['M', 'NM', 'LP', 'MP', 'HP', 'DMG'],
    default: 'NM',
  },
  isFoil: { type: Boolean, default: false },
  isAltered: { type: Boolean, default: false },
  isSigned: { type: Boolean, default: false },
  isGraded: { type: Boolean, default: false },
  grade: { type: String },
  language: { type: String, default: 'English' },
  purchasePrice: { type: Number, min: 0 },
  purchaseCurrency: { type: String, default: 'USD' },
  purchaseDate: { type: Date },
  notes: { type: String },
  images: [{ type: String }],
  lastUpdated: { type: Date, default: Date.now },
});

const collectionSchema = new Schema<ICollection>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tcg: { type: String, required: true, enum: ['mtg', 'ptcg'] },
    name: { type: String, required: true },
    description: { type: String },
    isPublic: { type: Boolean, default: false },
    items: [collectionItemSchema],
    tags: [{ type: String }],
  },
  { timestamps: true }
);

// Indexes for efficient querying
collectionSchema.index({ user: 1, tcg: 1 });
collectionSchema.index({ 'items.card': 1 });
collectionSchema.index({ tags: 1 });
collectionSchema.index({ isPublic: 1 });

export const Collection = mongoose.model<ICollection>('Collection', collectionSchema);
