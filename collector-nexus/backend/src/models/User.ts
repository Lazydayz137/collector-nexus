import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  tcgPreferences: {
    mtg: boolean;
    ptcg: boolean;
  };
  profile: {
    displayName: string;
    avatar?: string;
    bio?: string;
  };
  preferences: {
    currency: string;
    language: string;
    notifications: {
      priceAlerts: boolean;
      collectionUpdates: boolean;
    };
  };
  comparePassword(candidatePassword: string): Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    tcgPreferences: {
      mtg: { type: Boolean, default: true },
      ptcg: { type: Boolean, default: true },
    },
    profile: {
      displayName: { type: String, required: true, trim: true },
      avatar: { type: String },
      bio: { type: String, maxlength: 500 },
    },
    preferences: {
      currency: { type: String, default: 'USD' },
      language: { type: String, default: 'en' },
      notifications: {
        priceAlerts: { type: Boolean, default: true },
        collectionUpdates: { type: Boolean, true: true },
      },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

export const User = mongoose.model<IUser>('User', userSchema);
