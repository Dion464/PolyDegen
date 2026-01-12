# TimelessPredect

Prediction market platform powered by smart contracts on Incentiv Testnet.

## Project Structure

```
TimelessPredect/
├── api/                    # Vercel serverless API entry
│   └── index.js
├── contracts/              # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── ETHPredictionMarket.sol   # Main contract
│   │   └── PricingAMM.sol            # Pricing library
│   ├── scripts/
│   │   ├── deploy-eth.js             # Deploy to network
│   │   └── create-simple-markets.js  # Create test markets
│   └── deployments/                  # Deployment configs
├── frontend/               # React app (Vite)
│   └── src/
│       ├── components/     # Reusable components
│       │   ├── ui/         # Base UI (Button, Modal, Input, etc.)
│       │   ├── modern/     # App-specific (Navbar, MarketCard)
│       │   ├── charts/     # Chart components
│       │   └── trading/    # Trading interface
│       ├── pages/          # Route pages
│       │   ├── home/
│       │   ├── market/
│       │   ├── admin/
│       │   └── ...
│       ├── hooks/          # React hooks (useWeb3, useWebSocket)
│       ├── contexts/       # Context providers
│       ├── lib/            # Utilities (api.js, constants.js)
│       ├── styles/         # Global CSS
│       └── contracts/      # Contract config (eth-config.js)
├── lib/                    # Backend services
│   ├── api-handlers/       # API route handlers
│   └── *.js                # Services (prisma, orderBook, etc.)
├── prisma/                 # Database schema
├── scripts/                # Utility scripts
│   ├── clear-database.js
│   ├── setup-database.js
│   └── trade-indexer.js
└── vercel.json             # Deployment config
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Install Dependencies

```bash
# Root dependencies (backend)
npm install

# Frontend
cd frontend && npm install

# Contracts
cd ../contracts && npm install
```

### Local Development

1. **Start the API server:**
```bash
node api-server.js
```

2. **Start the frontend:**
```bash
cd frontend && npm run dev
```

3. **Deploy contracts (if needed):**
```bash
cd contracts
npx hardhat run scripts/deploy-eth.js --network incentiv
```

### Production (Vercel)

Push to main branch - Vercel auto-deploys.

## Key Files

| File | Purpose |
|------|---------|
| `contracts/contracts/ETHPredictionMarket.sol` | Main prediction market contract |
| `frontend/src/contracts/eth-config.js` | Contract address & ABI |
| `frontend/src/hooks/useWeb3.jsx` | Web3 connection hook |
| `lib/api-handlers/*.js` | API route implementations |
| `prisma/schema.prisma` | Database schema |

## Environment Variables

Create `.env` in root:
```
DATABASE_URL=your_postgres_url
```

Create `.env` in frontend:
```
VITE_API_BASE_URL=https://your-domain.vercel.app
```
