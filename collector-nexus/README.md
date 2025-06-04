# The Collector's Nexus

A cross-TCG application for managing and tracking Magic: The Gathering (MTG) and Pokémon TCG (PTCG) collections.

## Project Structure

```
collector-nexus/
├── backend/           # Backend (Node.js/Express)
├── frontend/          # Frontend (Next.js/React)
├── docs/              # Documentation
└── scripts/           # Utility scripts
```

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
