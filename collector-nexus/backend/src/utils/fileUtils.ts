import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

// Promisify fs methods
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const copyFile = promisify(fs.copyFile);

// Ensure directory exists
const ensureDirExists = async (dirPath: string): Promise<void> => {
  try {
    await access(dirPath);
  } catch (error) {
    await mkdir(dirPath, { recursive: true });
    logger.info(`Created directory: ${dirPath}`);
  }
};

// Generate a unique filename with extension
const generateUniqueFilename = (originalName: string): string => {
  const ext = path.extname(originalName);
  return `${uuidv4()}${ext}`;
};

// Save file to disk
const saveFile = async (
  fileData: Buffer | string,
  filePath: string,
  options: { encoding?: BufferEncoding | null; mode?: number | string; flag?: string } = {}
): Promise<void> => {
  const dir = path.dirname(filePath);
  await ensureDirExists(dir);
  await writeFile(filePath, fileData, options);
};

// Delete file if it exists
const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    await unlink(filePath);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return false; // File doesn't exist, which is fine
    }
    logger.error(`Error deleting file ${filePath}:`, error);
    throw error;
  }
};

// Read JSON file
const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  try {
    const data = await readFile(filePath, 'utf8');
    return JSON.parse(data) as T;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    logger.error(`Error reading JSON file ${filePath}:`, error);
    throw error;
  }
};

// Write JSON file
const writeJsonFile = async (
  filePath: string,
  data: any,
  options: { pretty?: boolean } = { pretty: true }
): Promise<void> => {
  const dir = path.dirname(filePath);
  await ensureDirExists(dir);
  
  const jsonString = options.pretty 
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
    
  await writeFile(filePath, jsonString, 'utf8');
};

// Get file size in MB
const getFileSizeInMB = (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) return reject(err);
      const fileSizeInMB = stats.size / (1024 * 1024);
      resolve(fileSizeInMB);
    });
  });
};

// Check if file exists
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
};

// Get all files in a directory
const getFilesInDirectory = async (
  dirPath: string,
  options: { recursive?: boolean; extensions?: string[] } = {}
): Promise<string[]> => {
  const { recursive = false, extensions } = options;
  const files: string[] = [];

  try {
    const items = await readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory() && recursive) {
        const subDirFiles = await getFilesInDirectory(fullPath, options);
        files.push(...subDirFiles);
      } else if (item.isFile()) {
        if (!extensions || extensions.length === 0 || extensions.includes(path.extname(item.name).toLowerCase())) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  } catch (error) {
    logger.error(`Error reading directory ${dirPath}:`, error);
    throw error;
  }
};

// Get file extension from filename or path
const getFileExtension = (filename: string): string => {
  return path.extname(filename).toLowerCase().replace('.', '');
};

// Get filename without extension
const getFilenameWithoutExtension = (filename: string): string => {
  return path.basename(filename, path.extname(filename));
};

// Copy file from source to destination
const copyFileWithDir = async (source: string, destination: string): Promise<void> => {
  const dir = path.dirname(destination);
  await ensureDirExists(dir);
  await copyFile(source, destination);
};

// Move file from source to destination
const moveFile = async (source: string, destination: string): Promise<void> => {
  const dir = path.dirname(destination);
  await ensureDirExists(dir);
  
  try {
    // Try to rename the file (atomic operation if on the same filesystem)
    await fs.promises.rename(source, destination);
  } catch (error: any) {
    if (error.code === 'EXDEV') {
      // If on different filesystems, copy then delete
      await copyFile(source, destination);
      await unlink(source);
    } else {
      throw error;
    }
  }
};

export {
  ensureDirExists,
  generateUniqueFilename,
  saveFile,
  deleteFile,
  readFile,
  writeFile,
  readJsonFile,
  writeJsonFile,
  getFileSizeInMB,
  fileExists,
  getFilesInDirectory,
  getFileExtension,
  getFilenameWithoutExtension,
  copyFileWithDir,
  moveFile,
  unlink as deleteFileAsync,
  access as fileAccess,
  mkdir as createDirectory,
  stat as getFileStats,
};
