import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB, disconnectDB } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import { mtgService } from './services/mtg';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// API routes
app.use('/', routes);

// Error handling middleware (should be the last middleware)
app.use(errorHandler);

// Connect to database and start server
const startServer = async () => {
  try {
    await connectDB();
    await mtgService.initialize(); // Initialize MTG Service
    
    const server = app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err: unknown) => {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      // Close server & exit process
      server.close(() => process.exit(1));
    });
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// Handle SIGTERM
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully');
  await mtgService.close(); // Close MTG Service
  await disconnectDB();
  process.exit(0);
});

// Start the server
startServer();
