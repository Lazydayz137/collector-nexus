import { logger } from '../../utils/logger';
import { ApiError } from '../../middleware/errorHandler';
import { DataRecord } from './acquisition.service';
import { Db, MongoClient, MongoClientOptions, Collection, Document, Filter, UpdateFilter, FindOptions, UpdateResult, DeleteResult } from 'mongodb';
import config from '../../config';

// Define interfaces for data storage
export interface StorageQuery {
  filter: Filter<Document>;
  options?: FindOptions;
}

export interface StorageUpdate {
  filter: Filter<Document>;
  update: UpdateFilter<Document> | Partial<Document>;
  options?: {
    upsert?: boolean;
    returnDocument?: 'before' | 'after';
  };
}

export interface StorageDelete {
  filter: Filter<Document>;
  options?: {
    limit?: number;
  };
}

class DataStorageService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private collections: Record<string, Collection<Document>> = {};

  constructor() {
    // Initialize the connection
    this.initialize();
  }

  /**
   * Initialize the storage service
   */
  private async initialize(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connect();
    return this.connectionPromise;
  }

  /**
   * Connect to the database
   */
  private async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      const mongoUri = config.mongodb.uri;
      const dbName = config.mongodb.database;

      if (!mongoUri || !dbName) {
        throw new Error('MongoDB connection details are not configured');
      }

      const options: MongoClientOptions = {
        // Connection options
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 10000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
        connectTimeoutMS: 10000,
        // TLS/SSL options if needed
        // tls: true,
        // tlsCAFile: '/path/to/ca.pem',
        // tlsCertificateKeyFile: '/path/to/client.pem',
        // Authentication
        auth: config.mongodb.username && config.mongodb.password ? {
          username: config.mongodb.username,
          password: config.mongodb.password,
        } : undefined,
      };

      logger.info('Connecting to MongoDB...');
      
      this.client = new MongoClient(mongoUri, options);
      await this.client.connect();
      
      // Test the connection
      await this.client.db().command({ ping: 1 });
      
      this.db = this.client.db(dbName);
      this.isConnected = true;
      
      logger.info('Successfully connected to MongoDB');
      
      // Set up indexes
      await this.setupIndexes();
      
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw new ApiError(500, 'Failed to connect to the database');
    }
  }

  /**
   * Set up database indexes
   */
  private async setupIndexes(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Create indexes for the items collection
      const itemsCollection = this.getCollection('items');
      await itemsCollection.createIndex({ id: 1 }, { unique: true });
      await itemsCollection.createIndex({ name: 'text', description: 'text' });
      await itemsCollection.createIndex({ price: 1 });
      await itemsCollection.createIndex({ 'metadata.source': 1 });
      await itemsCollection.createIndex({ 'metadata.status': 1 });
      await itemsCollection.createIndex({ 'metadata.processedAt': 1 });
      
      // Create indexes for the data_records collection
      const recordsCollection = this.getCollection('data_records');
      await recordsCollection.createIndex({ id: 1 }, { unique: true });
      await recordsCollection.createIndex({ source: 1 });
      await recordsCollection.createIndex({ 'metadata.status': 1 });
      await recordsCollection.createIndex({ 'metadata.processedAt': 1 });
      
      logger.info('Database indexes created');
    } catch (error) {
      logger.error('Failed to create database indexes:', error);
      throw new ApiError(500, 'Failed to set up database indexes');
    }
  }

  /**
   * Get a database collection
   */
  private getCollection(name: string): Collection<Document> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (!this.collections[name]) {
      this.collections[name] = this.db.collection(name);
    }

    return this.collections[name];
  }

  /**
   * Save a data record
   */
  async saveRecord(record: DataRecord): Promise<void> {
    try {
      const collection = this.getCollection('data_records');
      
      // Ensure the record has the required fields
      const recordToSave = {
        ...record,
        metadata: {
          ...record.metadata,
          updatedAt: new Date(),
        },
      };
      
      // Upsert the record
      await collection.updateOne(
        { id: record.id },
        { $set: recordToSave },
        { upsert: true }
      );
      
      logger.debug(`Saved record ${record.id} from ${record.source}`);
    } catch (error) {
      logger.error('Failed to save record:', error);
      throw new ApiError(500, 'Failed to save record to database');
    }
  }

  /**
   * Save an item to the database
   */
  async saveItem(item: any): Promise<void> {
    try {
      const collection = this.getCollection('items');
      
      // Ensure the item has the required fields
      const itemToSave = {
        ...item,
        updatedAt: new Date(),
        metadata: {
          ...(item.metadata || {}),
          lastUpdated: new Date(),
        },
      };
      
      // Upsert the item
      await collection.updateOne(
        { id: item.id },
        { $set: itemToSave },
        { upsert: true }
      );
      
      logger.debug(`Saved item ${item.id}`);
    } catch (error) {
      logger.error('Failed to save item:', error);
      throw new ApiError(500, 'Failed to save item to database');
    }
  }

  /**
   * Find items matching a query
   */
  async findItems(query: StorageQuery): Promise<any[]> {
    try {
      const collection = this.getCollection('items');
      const cursor = collection.find(query.filter, query.options);
      return cursor.toArray();
    } catch (error) {
      logger.error('Failed to find items:', error);
      throw new ApiError(500, 'Failed to query items');
    }
  }

  /**
   * Find a single item by ID
   */
  async findItemById(id: string): Promise<any | null> {
    try {
      const collection = this.getCollection('items');
      return collection.findOne({ id });
    } catch (error) {
      logger.error(`Failed to find item ${id}:`, error);
      throw new ApiError(500, `Failed to find item ${id}`);
    }
  }

  /**
   * Update items matching a query
   */
  async updateItems(update: StorageUpdate): Promise<UpdateResult> {
    try {
      const collection = this.getCollection('items');
      const { filter, update: updateData, options } = update;
      
      // Ensure the updatedAt field is always set
      const updateWithTimestamps = {
        ...updateData,
        $set: {
          ...(updateData as any).$set,
          updatedAt: new Date(),
          'metadata.lastUpdated': new Date(),
        },
      };
      
      return collection.updateMany(filter, updateWithTimestamps, options);
    } catch (error) {
      logger.error('Failed to update items:', error);
      throw new ApiError(500, 'Failed to update items');
    }
  }

  /**
   * Delete items matching a query
   */
  async deleteItems(query: StorageDelete): Promise<DeleteResult> {
    try {
      const collection = this.getCollection('items');
      return collection.deleteMany(query.filter, query.options);
    } catch (error) {
      logger.error('Failed to delete items:', error);
      throw new ApiError(500, 'Failed to delete items');
    }
  }

  /**
   * Get collection statistics
   */
  async getStats(collectionName: string): Promise<Record<string, any>> {
    try {
      const collection = this.getCollection(collectionName);
      
      const [count, size, indexes] = await Promise.all([
        collection.countDocuments(),
        collection.estimatedDocumentCount(),
        collection.indexes(),
      ]);
      
      return {
        collection: collectionName,
        count,
        size,
        indexes: indexes.map(index => index.name),
      };
    } catch (error) {
      logger.error(`Failed to get stats for collection ${collectionName}:`, error);
      throw new ApiError(500, `Failed to get stats for collection ${collectionName}`);
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.isConnected = false;
        this.db = null;
        this.client = null;
        logger.info('MongoDB connection closed');
      } catch (error) {
        logger.error('Error closing MongoDB connection:', error);
      }
    }
  }

  /**
   * Check if the database is connected
   */
  isDatabaseConnected(): boolean {
    return this.isConnected;
  }
}

// Export a singleton instance
export const dataStorageService = new DataStorageService();

// Handle application termination
process.on('SIGINT', async () => {
  await dataStorageService.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await dataStorageService.close();
  process.exit(0);
});

export default dataStorageService;
