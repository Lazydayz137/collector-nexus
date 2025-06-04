import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiError } from '../middleware/errorHandler';

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter for image uploads
const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const filetypes = /jpe?g|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new ApiError(400, 'Only image files are allowed (jpg, jpeg, png, webp)'));
  }
};

// Configure multer for file uploads
export const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Middleware for handling single file upload
export const uploadSingle = (fieldName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(fieldName)(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(400, 'File size too large. Max 5MB allowed.'));
        }
        return next(err);
      }
      next();
    });
  };
};

// Middleware for handling multiple file uploads
export const uploadMultiple = (fieldName: string, maxCount: number = 5) => {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.array(fieldName, maxCount)(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(400, 'One or more files exceed the 5MB limit'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new ApiError(400, `Maximum ${maxCount} files allowed`));
        }
        return next(err);
      }
      next();
    });
  };
};

// Generate a unique filename for uploaded files
export const generateUniqueFilename = (originalname: string): string => {
  const ext = path.extname(originalname);
  return `${uuidv4()}${ext}`;
};

// Validate file type
export const validateFileType = (file: Express.Multer.File, allowedTypes: string[]): boolean => {
  const filetypes = new RegExp(allowedTypes.join('|'));
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  return extname && mimetype;
};

// Remove file from the filesystem
export const removeFile = (filePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    fs.unlink(filePath, (err: NodeJS.ErrnoException | null) => {
      if (err && err.code !== 'ENOENT') {
        // Ignore file not found error
        return reject(err);
      }
      resolve();
    });
  });
};

// Process uploaded file and move to final destination
export const processUploadedFile = async (
  file: Express.Multer.File,
  destination: string
): Promise<string> => {
  const fs = require('fs');
  const path = require('path');
  
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }
  
  const newFilename = generateUniqueFilename(file.originalname);
  const newPath = path.join(destination, newFilename);
  
  // Move the file to the destination
  await fs.promises.rename(file.path, newPath);
  
  // Return the relative path
  return path.relative(process.cwd(), newPath);
};
