import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { promisify } from 'util';
import { logger } from './logger';
import { ApiError } from '../middleware/errorHandler';
import { Readable } from 'stream';

const stat = promisify(fs.stat);

/**
 * Stream a file as a download response
 */
const streamFileDownload = async (
  res: Response,
  filePath: string,
  customFilename?: string
): Promise<void> => {
  try {
    // Check if file exists
    const fileStats = await stat(filePath);
    
    if (!fileStats.isFile()) {
      throw new ApiError(404, 'File not found');
    }
    
    // Get file info
    const filename = customFilename || path.basename(filePath);
    const mimetype = mime.lookup(filePath) || 'application/octet-stream';
    
    // Set headers
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', fileStats.size);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    
    // Handle stream events
    fileStream.on('error', (error) => {
      logger.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).send('Error streaming file');
      }
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in streamFileDownload:', error);
    throw new ApiError(500, 'Error processing download request');
  }
};

/**
 * Stream a buffer as a download response
 */
const streamBufferDownload = (
  res: Response,
  buffer: Buffer,
  filename: string,
  mimetype: string = 'application/octet-stream'
): void => {
  try {
    // Set headers
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Create a readable stream from the buffer
    const readStream = new Readable();
    readStream.push(buffer);
    readStream.push(null); // Signals the end of the stream
    
    // Pipe the stream to the response
    readStream.pipe(res);
    
  } catch (error) {
    logger.error('Error in streamBufferDownload:', error);
    throw new ApiError(500, 'Error processing download request');
  }
};

/**
 * Generate a signed URL for file download (for S3 or similar services)
 */
const generateSignedDownloadUrl = async (
  filePath: string,
  expiresIn: number = 3600, // 1 hour default
  bucketName?: string
): Promise<string> => {
  // This is a placeholder implementation
  // In a real app, you would use AWS SDK or similar to generate a signed URL
  // For example, with AWS S3:
  // const s3 = new AWS.S3();
  // const params = {
  //   Bucket: bucketName || process.env.AWS_S3_BUCKET,
  //   Key: filePath,
  //   Expires: expiresIn,
  //   ResponseContentDisposition: `attachment; filename="${path.basename(filePath)}"`
  // };
  // return s3.getSignedUrl('getObject', params);
  
  // For now, return a relative URL
  return `/api/download?file=${encodeURIComponent(filePath)}`;
};

/**
 * Validate file path to prevent directory traversal attacks
 */
const validateFilePath = (filePath: string, baseDirectory: string): string => {
  // Resolve the full path and normalize it
  const fullPath = path.resolve(baseDirectory, filePath);
  
  // Check if the resolved path is within the base directory
  if (!fullPath.startsWith(path.resolve(baseDirectory))) {
    throw new ApiError(400, 'Invalid file path');
  }
  
  return fullPath;
};

/**
 * Get file info (size, type, etc.)
 */
const getFileInfo = async (filePath: string): Promise<{
  size: number;
  mimetype: string;
  extension: string;
  filename: string;
  lastModified: Date;
}> => {
  try {
    const stats = await stat(filePath);
    
    if (!stats.isFile()) {
      throw new ApiError(404, 'File not found');
    }
    
    return {
      size: stats.size,
      mimetype: mime.lookup(filePath) || 'application/octet-stream',
      extension: path.extname(filePath).toLowerCase(),
      filename: path.basename(filePath),
      lastModified: stats.mtime,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(404, 'File not found');
  }
};

export {
  streamFileDownload,
  streamBufferDownload,
  generateSignedDownloadUrl,
  validateFilePath,
  getFileInfo,
};
