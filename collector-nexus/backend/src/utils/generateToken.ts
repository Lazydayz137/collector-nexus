import jwt from 'jsonwebtoken';

export const generateToken = (id: string): string => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d', // Default to 30 days
  });
};

export const verifyToken = (token: string): any => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  
  return jwt.verify(token, process.env.JWT_SECRET);
};
