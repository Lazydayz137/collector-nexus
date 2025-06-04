import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from './logger';
import { ApiError } from '../middleware/errorHandler';
import config from '../config';

// Supported storage providers
type StorageProvider = 'local' | 's3' | 'gcs' | 'azure';

// File metadata interface
interface FileMetadata {
  filename: string;
  mimetype: string;
  size: number;
  encoding?: string;
  [key: string]: any;
}

// File storage options
interface StorageOptions {
  provider: StorageProvider;
  basePath?: string;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  sslEnabled?: boolean;
  forcePathStyle?: boolean;
  acl?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  metadata?: Record<string, string>;
}

// Default storage options
const DEFAULT_OPTIONS: StorageOptions = {
  provider: 'local',
  basePath: 'uploads',
  acl: 'public-read',
  cacheControl: 'public, max-age=31536000',
};

/**
 * File storage service
 */
class StorageService {
  private options: StorageOptions;
  private s3Client: S3Client | null = null;

  constructor(options: Partial<StorageOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.initialize();
  }

  /**
   * Initialize the storage service
   */
  private initialize() {
    const { provider, region, accessKeyId, secretAccessKey, endpoint, sslEnabled, forcePathStyle } = this.options;
    
    if (provider === 's3' || provider === 'gcs') {
      this.s3Client = new S3Client({
        region: region || 'us-east-1',
        credentials: accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
        endpoint,
        forcePathStyle,
        tls: sslEnabled,
      });
    }
  }

  /**
   * Generate a unique filename
   */
  private generateUniqueFilename(originalName: string): string {
    const ext = path.extname(originalName);
    return `${uuidv4()}${ext}`;
  }

  /**
   * Get the full path for a file
   */
  private getFullPath(filename: string): string {
    const { provider, basePath } = this.options;
    
    if (provider === 'local') {
      return path.join(process.cwd(), basePath || '', filename);
    }
    
    return filename; // For cloud storage, just use the filename as the key
  }

  /**
   * Upload a file
   */
  async upload(
    file: Buffer | Readable | string,
    metadata: Partial<FileMetadata>,
    options: Partial<StorageOptions> = {}
  ): Promise<{ 
    key: string; 
    url: string; 
    metadata: FileMetadata;
  }> {
    const mergedOptions = { ...this.options, ...options };
    const { provider, bucket, acl, cacheControl, contentDisposition, contentEncoding } = mergedOptions;
    
    try {
      // Generate a unique filename if not provided
      const filename = metadata.filename || this.generateUniqueFilename(metadata.originalname || 'file');
      const key = path.join(mergedOptions.basePath || '', filename);
      
      // Prepare file metadata
      const fileMetadata: FileMetadata = {
        filename,
        mimetype: metadata.mimetype || 'application/octet-stream',
        size: metadata.size || 0,
        encoding: metadata.encoding,
        ...metadata,
      };

      if (provider === 'local') {
        // Local file system storage
        const filePath = this.getFullPath(filename);
        const dir = path.dirname(filePath);
        
        // Create directory if it doesn't exist
        await fs.promises.mkdir(dir, { recursive: true });
        
        // Write file to disk
        if (Buffer.isBuffer(file)) {
          await fs.promises.writeFile(filePath, file);
        } else if (typeof file === 'string') {
          await fs.promises.writeFile(filePath, file, 'utf8');
        } else {
          // Stream to file
          const writeStream = fs.createWriteStream(filePath);
          await new Promise((resolve, reject) => {
            file.pipe(writeStream)
              .on('error', reject)
              .on('finish', resolve);
          });
        }
        
        const url = `/uploads/${filename}`;
        
        return { key, url, metadata: fileMetadata };
      } 
      
      else if ((provider === 's3' || provider === 'gcs') && this.s3Client) {
        // AWS S3 or compatible storage (like MinIO, Google Cloud Storage)
        const params = {
          Bucket: bucket || config.aws.s3.bucket,
          Key: key,
          Body: file,
          ContentType: fileMetadata.mimetype,
          ContentLength: fileMetadata.size,
          ACL: acl,
          CacheControl: cacheControl,
          ContentDisposition: contentDisposition,
          ContentEncoding: contentEncoding,
          Metadata: mergedOptions.metadata,
        };
        
        // Use Upload for streaming large files
        const upload = new Upload({
          client: this.s3Client,
          params,
        });
        
        await upload.done();
        
        // Generate a public URL
        const url = await this.getSignedUrl(key, { expiresIn: 60 * 60 * 24 * 7 }); // 7 days
        
        return { key, url, metadata: fileMetadata };
      }
      
      throw new Error(`Unsupported storage provider: ${provider}`);
      
    } catch (error) {
      logger.error('Error uploading file:', error);
      throw new ApiError(500, 'Failed to upload file');
    }
  }

  /**
   * Get a file as a stream
   */
  async getStream(key: string): Promise<{ stream: Readable; metadata: FileMetadata }> {
    const { provider, bucket } = this.options;
    
    try {
      if (provider === 'local') {
        const filePath = this.getFullPath(key);
        const stats = await fs.promises.stat(filePath);
        const stream = fs.createReadStream(filePath);
        
        return {
          stream,
          metadata: {
            filename: path.basename(key),
            mimetype: 'application/octet-stream',
            size: stats.size,
          },
        };
      } 
      
      else if ((provider === 's3' || provider === 'gcs') && this.s3Client) {
        const params = {
          Bucket: bucket || config.aws.s3.bucket,
          Key: key,
        };
        
        const { Body, ContentType, ContentLength, LastModified, Metadata } = 
          await this.s3Client.send(new GetObjectCommand(params));
        
        if (!Body) {
          throw new ApiError(404, 'File not found');
        }
        
        return {
          stream: Body as Readable,
          metadata: {
            filename: path.basename(key),
            mimetype: ContentType || 'application/octet-stream',
            size: ContentLength || 0,
            lastModified: LastModified,
            ...Metadata,
          },
        };
      }
      
      throw new Error(`Unsupported storage provider: ${provider}`);
      
    } catch (error) {
      if ((error as any).name === 'NoSuchKey' || (error as any).code === 'ENOENT') {
        throw new ApiError(404, 'File not found');
      }
      logger.error('Error getting file stream:', error);
      throw new ApiError(500, 'Failed to get file');
    }
  }

  /**
   * Get a file as a buffer
   */
  async getBuffer(key: string): Promise<{ buffer: Buffer; metadata: FileMetadata }> {
    try {
      const { stream, metadata } = await this.getStream(key);
      
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      return {
        buffer: Buffer.concat(chunks),
        metadata,
      };
    } catch (error) {
      logger.error('Error getting file buffer:', error);
      throw new ApiError(500, 'Failed to get file');
    }
  }

  /**
   * Delete a file
   */
  async delete(key: string): Promise<boolean> {
    const { provider, bucket } = this.options;
    
    try {
      if (provider === 'local') {
        const filePath = this.getFullPath(key);
        await fs.promises.unlink(filePath);
        return true;
      } 
      
      else if ((provider === 's3' || provider === 'gcs') && this.s3Client) {
        const params = {
          Bucket: bucket || config.aws.s3.bucket,
          Key: key,
        };
        
        await this.s3Client.send(new DeleteObjectCommand(params));
        return true;
      }
      
      throw new Error(`Unsupported storage provider: ${provider}`);
      
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return false; // File doesn't exist, consider it deleted
      }
      logger.error('Error deleting file:', error);
      throw new ApiError(500, 'Failed to delete file');
    }
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    const { provider, bucket } = this.options;
    
    try {
      if (provider === 'local') {
        const filePath = this.getFullPath(key);
        try {
          await fs.promises.access(filePath, fs.constants.F_OK);
          return true;
        } catch (error) {
          return false;
        }
      } 
      
      else if ((provider === 's3' || provider === 'gcs') && this.s3Client) {
        const params = {
          Bucket: bucket || config.aws.s3.bucket,
          Key: key,
        };
        
        try {
          await this.s3Client.send(new HeadObjectCommand(params));
          return true;
        } catch (error: any) {
          if (error.name === 'NotFound') {
            return false;
          }
          throw error;
        }
      }
      
      throw new Error(`Unsupported storage provider: ${provider}`);
      
    } catch (error) {
      logger.error('Error checking if file exists:', error);
      throw new ApiError(500, 'Failed to check file existence');
    }
  }

  /**
   * Get a signed URL for a file
   */
  async getSignedUrl(
    key: string, 
    options: { 
      expiresIn?: number; 
      responseContentType?: string;
      responseContentDisposition?: string;
      responseCacheControl?: string;
    } = {}
  ): Promise<string> {
    const { provider, bucket } = this.options;
    const { expiresIn = 3600, responseContentType, responseContentDisposition, responseCacheControl } = options;
    
    try {
      if (provider === 'local') {
        // For local storage, just return a relative URL
        return `/uploads/${key}`;
      } 
      
      else if ((provider === 's3' || provider === 'gcs') && this.s3Client) {
        const params = {
          Bucket: bucket || config.aws.s3.bucket,
          Key: key,
          ResponseContentType: responseContentType,
          ResponseContentDisposition: responseContentDisposition,
          ResponseCacheControl: responseCacheControl,
        };
        
        const command = new GetObjectCommand(params);
        return getSignedUrl(this.s3Client, command, { expiresIn });
      }
      
      throw new Error(`Unsupported storage provider: ${provider}`);
      
    } catch (error) {
      logger.error('Error generating signed URL:', error);
      throw new ApiError(500, 'Failed to generate signed URL');
    }
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(key: string): string {
    const { provider, bucket } = this.options;
    
    if (provider === 'local') {
      return `/uploads/${key}`;
    } 
    
    else if (provider === 's3' || provider === 'gcs') {
      // For public buckets with public-read ACL
      return `https://${bucket}.s3.${this.options.region || 'us-east-1'}.amazonaws.com/${key}`;
    }
    
    throw new Error(`Unsupported storage provider: ${provider}`);
  }
}

// Create a default storage instance
export const storage = new StorageService({
  provider: (process.env.STORAGE_PROVIDER as StorageProvider) || 'local',
  basePath: process.env.STORAGE_BASE_PATH || 'uploads',
  bucket: process.env.STORAGE_BUCKET || config.aws.s3.bucket,
  region: process.env.STORAGE_REGION || config.aws.region,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || config.aws.accessKeyId,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || config.aws.secretAccessKey,
  endpoint: process.env.STORAGE_ENDPOINT,
  sslEnabled: process.env.STORAGE_SSL_ENABLED !== 'false',
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  acl: process.env.STORAGE_ACL || 'public-read',
  cacheControl: process.env.STORAGE_CACHE_CONTROL || 'public, max-age=31536000',
});

export default storage;
