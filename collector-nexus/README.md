# 🃏 The Collector's Nexus

**MTG Data Integration MVP** - A comprehensive Magic: The Gathering collection management platform with unified data source integration.

![MTG](https://img.shields.io/badge/MTG-Data%20Integration-blue) ![Node.js](https://img.shields.io/badge/Node.js-Backend-green) ![Next.js](https://img.shields.io/badge/Next.js-Frontend-black) ![TypeScript](https://img.shields.io/badge/TypeScript-Full%20Stack-blue)

## 🚀 Features

### Core Data Integration
- **Multi-Source MTG Data**: Unified access to Scryfall, MTGJSON, and CardTrader APIs
- **Real-time Price Tracking**: Live market data and pricing history
- **Automated Synchronization**: Configurable data sync intervals and manual triggers
- **Smart Caching**: Optimized data retrieval with configurable TTL

### API Endpoints
- 🔍 **Card Search**: Advanced filtering and pagination
- 💰 **Price Data**: Current market prices and historical trends  
- 📚 **Set Information**: Complete set listings and metadata
- 🔄 **Sync Management**: Manual data synchronization controls

### User Management
- 🔐 **JWT Authentication**: Secure user registration and login
- 👤 **User Profiles**: Customizable user accounts
- 📋 **Collection Management**: Track owned cards and quantities
- ⭐ **Wishlist System**: Save and organize desired cards

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express.js** - RESTful API server
- **TypeScript** - Type-safe development
- **MongoDB** - Document database (ready for integration)
- **JWT** - Secure authentication
- **Axios** - HTTP client for external APIs

### Frontend (Coming Soon)
- **Next.js 14** - React framework with App Router
- **TypeScript** - Full type safety
- **Tailwind CSS** - Modern styling

### External APIs
- **Scryfall API** - Comprehensive MTG card data
- **MTGJSON** - Bulk JSON datasets
- **CardTrader API** - Marketplace pricing data

## 🏗️ Project Structure

collector-nexus/
├── backend/           # Backend (Node.js/Express)
├── frontend/          # Frontend (Next.js/React)
├── docs/              # Documentation
└── scripts/           # Utility scripts

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB 6.0+

## Getting Started

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the backend directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/collector-nexus
   JWT_SECRET=your_jwt_secret
   TCGPLAYER_API_KEY=your_tcgplayer_api_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file in the frontend directory:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:5000
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Development Workflow

1. Create a new branch for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them:
   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```

3. Push your changes and create a pull request.

## Testing

### Backend Tests
Run the test suite:
```bash
cd backend
npm test
```

### Frontend Tests
Run the test suite:
```bash
cd frontend
npm test
```

## Deployment

### Production Build

1. Build the backend:
   ```bash
   cd backend
   npm run build
   ```

2. Build the frontend:
   ```bash
   cd ../frontend
   npm run build
   ```

3. Start the production server:
   ```bash
   cd ../backend
   npm start
   ```

## License

MIT
