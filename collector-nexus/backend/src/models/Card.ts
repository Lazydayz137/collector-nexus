import mongoose, { Document, Schema } from 'mongoose';

export type TCGType = 'mtg' | 'ptcg';

export interface ICard extends Document {
  tcg: TCGType;
  name: string;
  set: string;
  setCode: string;
  number: string;
  rarity: string;
  imageUrl?: string;
  imageUrlHiRes?: string;
  types?: string[];
  supertypes?: string[];
  subtypes?: string[];
  text?: string;
  flavor?: string;
  artist?: string;
  numberInSet?: number;
  nationalPokedexNumber?: number;
  hp?: number;
  convertedRetreatCost?: number;
  evolvesFrom?: string;
  // MTG specific
  manaCost?: string;
  cmc?: number;
  colors?: string[];
  colorIdentity?: string[];
  type?: string;
  typesMtg?: string[];
  subtypesMtg?: string[];
  rarityMtg?: string;
  setMtg?: string;
  setNameMtg?: string;
  textMtg?: string;
  flavorMtg?: string;
  artistMtg?: string;
  numberMtg?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  // PTCG specific
  ptcgAbility?: {
    name: string;
    text: string;
    type: string;
  };
  attacks?: Array<{
    name: string;
    cost: string[];
    convertedEnergyCost: number;
    damage: string;
    text: string;
  }>;
  weaknesses?: Array<{
    type: string;
    value: string;
  }>;
  resistances?: Array<{
    type: string;
    value: string;
  }>;
  retreatCost?: string[];
  convertedRetreatCostPtc?: number;
  // Common metadata
  lastUpdated: Date;
  externalIds: {
    tcgplayerId?: string;
    cardmarketId?: string;
    mtgjsonId?: string;
    scryfallId?: string;
    ptcgoCode?: string;
  };
}

const cardSchema = new Schema<ICard>(
  {
    tcg: { type: String, required: true, enum: ['mtg', 'ptcg'] },
    name: { type: String, required: true, index: true },
    set: { type: String, required: true },
    setCode: { type: String, required: true, index: true },
    number: { type: String, required: true },
    rarity: { type: String, required: true },
    imageUrl: { type: String },
    imageUrlHiRes: { type: String },
    // Common fields
    types: [{ type: String }],
    supertypes: [{ type: String }],
    subtypes: [{ type: String }],
    text: { type: String },
    flavor: { type: String },
    artist: { type: String },
    // MTG specific fields
    manaCost: { type: String },
    cmc: { type: Number },
    colors: [{ type: String }],
    colorIdentity: [{ type: String }],
    type: { type: String },
    typesMtg: [{ type: String }],
    subtypesMtg: [{ type: String }],
    rarityMtg: { type: String },
    setMtg: { type: String },
    setNameMtg: { type: String },
    textMtg: { type: String },
    flavorMtg: { type: String },
    artistMtg: { type: String },
    numberMtg: { type: String },
    power: { type: String },
    toughness: { type: String },
    loyalty: { type: String },
    // PTCG specific fields
    ptcgAbility: {
      name: { type: String },
      text: { type: String },
      type: { type: String },
    },
    attacks: [
      {
        name: { type: String },
        cost: [{ type: String }],
        convertedEnergyCost: { type: Number },
        damage: { type: String },
        text: { type: String },
      },
    ],
    weaknesses: [
      {
        type: { type: String },
        value: { type: String },
      },
    ],
    resistances: [
      {
        type: { type: String },
        value: { type: String },
      },
    ],
    retreatCost: [{ type: String }],
    convertedRetreatCostPtc: { type: Number },
    // Metadata
    lastUpdated: { type: Date, default: Date.now },
    externalIds: {
      tcgplayerId: { type: String },
      cardmarketId: { type: String },
      mtgjsonId: { type: String },
      scryfallId: { type: String },
      ptcgoCode: { type: String },
    },
  },
  { timestamps: true }
);

// Compound index for unique card identification
cardSchema.index({ tcg: 1, setCode: 1, number: 1 }, { unique: true });

// Text index for search
cardSchema.index({ name: 'text', text: 'text', flavor: 'text' });

export const Card = mongoose.model<ICard>('Card', cardSchema);
