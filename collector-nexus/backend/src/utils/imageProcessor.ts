import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import { ApiError } from '../middleware/errorHandler';

// Supported image formats
const SUPPORTED_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'tiff', 'gif'] as const;
type ImageFormat = typeof SUPPORTED_FORMATS[number];

// Image processing options
interface ProcessImageOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  format?: ImageFormat;
  quality?: number;
  outputPath?: string;
  filename?: string;
  maxFileSizeMB?: number;
  stripMetadata?: boolean;
  grayscale?: boolean;
  rotate?: number;
  flip?: boolean;
  flop?: boolean;
  blur?: number;
  sharpen?: number;
  normalize?: boolean;
  tint?: string;
  background?: string;
}

// Default options
const DEFAULT_OPTIONS: ProcessImageOptions = {
  width: 1200,
  height: 800,
  fit: 'inside',
  format: 'webp',
  quality: 80,
  maxFileSizeMB: 5,
  stripMetadata: true,
  grayscale: false,
  rotate: 0,
  flip: false,
  flop: false,
  blur: 0,
  sharpen: 0,
  normalize: false,
};

/**
 * Process an image with the given options
 */
const processImage = async (
  input: Buffer | string,
  options: ProcessImageOptions = {}
): Promise<{
  buffer: Buffer;
  metadata: sharp.Metadata;
  filePath?: string;
}> => {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const {
    width,
    height,
    fit,
    format,
    quality,
    outputPath,
    filename,
    maxFileSizeMB,
    stripMetadata,
    grayscale,
    rotate,
    flip,
    flop,
    blur,
    sharpen,
    normalize,
    tint,
    background,
  } = mergedOptions;

  try {
    // Validate input
    if (!input) {
      throw new ApiError(400, 'No input provided');
    }

    // Create Sharp instance
    let image = sharp(input);

    // Apply image processing operations
    image = image.resize(width, height, {
      fit,
      background: background ? parseColor(background) : { r: 0, g: 0, b: 0, alpha: 0 },
    });

    if (grayscale) image = image.grayscale();
    if (rotate) image = image.rotate(rotate);
    if (flip) image = image.flip();
    if (flop) image = image.flop();
    if (blur && blur > 0) image = image.blur(blur);
    if (sharpen && sharpen > 0) image = image.sharpen(sharpen);
    if (normalize) image = image.normalize();
    if (tint) image = image.tint(parseColor(tint));

    // Set format and quality
    const formatOptions: sharp.OutputOptions = { quality };
    
    // Convert to the target format
    let processedImage: sharp.Sharp;
    switch (format) {
      case 'jpeg':
      case 'jpg':
        processedImage = image.jpeg({
          ...formatOptions,
          mozjpeg: true,
        });
        break;
      case 'png':
        processedImage = image.png({
          ...formatOptions,
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: true,
          quality: quality ? Math.ceil(quality / 10) : 8,
        });
        break;
      case 'webp':
        processedImage = image.webp({
          ...formatOptions,
          lossless: false,
          alphaQuality: 80,
          effort: 6,
        });
        break;
      case 'avif':
        processedImage = image.avif({
          ...formatOptions,
          lossless: false,
          effort: 5,
        });
        break;
      case 'tiff':
        processedImage = image.tiff({
          ...formatOptions,
          compression: 'lzw',
          predictor: 'horizontal',
        });
        break;
      case 'gif':
        processedImage = image.gif({
          ...formatOptions,
        });
        break;
      default:
        throw new ApiError(400, `Unsupported format: ${format}`);
    }

    // Strip metadata if requested
    if (stripMetadata) {
      processedImage = processedImage.withMetadata({
        icc: undefined,
        exif: undefined,
      });
    }

    // Get metadata
    const metadata = await processedImage.metadata();
    
    // Convert to buffer
    const buffer = await processedImage.toBuffer();

    // Check file size
    if (maxFileSizeMB && buffer.length > maxFileSizeMB * 1024 * 1024) {
      throw new ApiError(400, `Image size exceeds maximum allowed size of ${maxFileSizeMB}MB`);
    }

    // Save to file if output path is provided
    let filePath: string | undefined;
    if (outputPath) {
      await fs.promises.mkdir(outputPath, { recursive: true });
      const ext = format || 'webp';
      const uniqueFilename = `${filename || uuidv4()}.${ext}`;
      filePath = path.join(outputPath, uniqueFilename);
      await fs.promises.writeFile(filePath, buffer);
    }

    return {
      buffer,
      metadata,
      filePath,
    };
  } catch (error) {
    logger.error('Error processing image:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, 'Error processing image');
  }
};

/**
 * Generate multiple image sizes and formats
 */
const generateImageVariants = async (
  input: Buffer | string,
  variants: Array<{
    suffix: string;
    options: ProcessImageOptions;
  }>,
  outputDir: string
): Promise<Array<{
  buffer: Buffer;
  metadata: sharp.Metadata;
  filePath: string;
  variant: string;
}>> => {
  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    const results = await Promise.all(
      variants.map(async (variant) => {
        const { buffer, metadata } = await processImage(input, {
          ...variant.options,
          outputPath: outputDir,
          filename: `${variant.suffix}`,
        });
        
        return {
          buffer,
          metadata,
          filePath: path.join(outputDir, `${variant.suffix}.${variant.options.format || 'webp'}`),
          variant: variant.suffix,
        };
      })
    );
    
    return results;
  } catch (error) {
    logger.error('Error generating image variants:', error);
    throw new ApiError(500, 'Error generating image variants');
  }
};

/**
 * Generate responsive image sizes
 */
const generateResponsiveImages = async (
  input: Buffer | string,
  baseName: string,
  outputDir: string,
  sizes: number[] = [320, 480, 768, 1024, 1280, 1600],
  formats: ImageFormat[] = ['webp', 'jpg']
): Promise<Array<{
  src: string;
  width: number;
  height: number;
  format: string;
  size: number;
  filePath: string;
}>> => {
  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    const results = [];
    
    // Process each format
    for (const format of formats) {
      // Process each size
      for (const width of sizes) {
        const { buffer, metadata } = await processImage(input, {
          width,
          format,
          fit: 'inside',
        });
        
        // Generate filename
        const filename = `${baseName}-${width}w.${format}`;
        const filePath = path.join(outputDir, filename);
        
        // Save file
        await fs.promises.writeFile(filePath, buffer);
        
        results.push({
          src: filename,
          width: metadata.width || width,
          height: metadata.height || 0,
          format,
          size: buffer.length,
          filePath,
        });
      }
    }
    
    return results;
  } catch (error) {
    logger.error('Error generating responsive images:', error);
    throw new ApiError(500, 'Error generating responsive images');
  }
};

/**
 * Extract metadata from an image
 */
const extractMetadata = async (input: Buffer | string): Promise<sharp.Metadata> => {
  try {
    return await sharp(input).metadata();
  } catch (error) {
    logger.error('Error extracting image metadata:', error);
    throw new ApiError(400, 'Invalid image file');
  }
};

/**
 * Convert a color string to RGBA
 */
const parseColor = (color: string): { r: number; g: number; b: number; alpha?: number } => {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const alpha = hex.length > 6 ? parseInt(hex.slice(6, 8), 16) / 255 : undefined;
    
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      throw new ApiError(400, 'Invalid color format');
    }
    
    return { r, g, b, alpha };
  }
  
  // Handle rgb/rgba colors
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (!match) {
      throw new ApiError(400, 'Invalid color format');
    }
    
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      alpha: match[4] ? parseFloat(match[4]) : undefined,
    };
  }
  
  // Handle named colors
  const namedColors: Record<string, string> = {
    white: '#ffffff',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff00',
    blue: '#0000ff',
    yellow: '#ffff00',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    transparent: 'rgba(0,0,0,0)',
  };
  
  if (namedColors[color.toLowerCase()]) {
    return parseColor(namedColors[color.toLowerCase()]);
  }
  
  throw new ApiError(400, 'Unsupported color format');
};

export {
  processImage,
  generateImageVariants,
  generateResponsiveImages,
  extractMetadata,
  parseColor,
  SUPPORTED_FORMATS,
  ImageFormat,
  ProcessImageOptions,
};
