# OpenvApps Hub

![OpenvApps Logo](https://openvapps.org/images/logo.png)
**A neutral infrastructure layer for publishing, verifying and exploring verifiable applications with zero-knowledge proofs**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![API Documentation](https://img.shields.io/badge/API-Documentation-green.svg)](docs/API.md)
[Website](https://openvapps.org) • [Documentation](https://docs.openvapps.org) • [API Reference](https://api.openvapps.org/docs)

## 🌟 Overview
OpenvApps is a chain-agnostic hub where developers publish, verify and launch verifiable applications (vApps) that include zero-knowledge proofs of execution. Every vApp ships with source links, verifier metadata and reproducible zk-SNARK/STARK artifacts—publicly auditable, chain-agnostic and API-accessible.
### Key Features
- **🔐 Zero-Knowledge Verification** - Every application includes cryptographic proofs of execution
- **🌐 Chain-Agnostic** - Support for Ethereum, Arbitrum, Starknet and more
- **🚀 One-Click Submission** - `vapp submit` uploads code, proof and metadata in a single command
- **🔄 Continuous Verification** - Proofs re-check on every code revision with webhook notifications
- **📡 Public API** - Fetch vApp details, proof hashes and verifier keys programmatically
- **🛡️ Flag & Slash** - Community auditors flag invalid proofs; staked deposits are slashed automatically
- **📦 Modular Exports** - Download proof bundles for on-chain or off-chain consumption
## 🏗️ Architecture
```mermaid
flowchart LR
    subgraph Developer Side
        A[AI Starter] --> B[Local Scaffold + Circuit Stub]
        B --> C[CLI: vapp submit]
    end
    
    C -->|Bundle / Tracker| D((OpenvApps Hub))
    D --> E{Verifier Cluster}
    E -->|Valid| F[Status: Verified]
    E -->|Invalid| G[Status: Flagged]
    F --> H[Launchpad - Token & Liquidity]
    H --> I[EVM Chains]
```
### Core Components
| Layer | Role | Description |
|-------|------|-------------|
| **Starters** | Agent | Generates boilerplate code, test circuits and CI templates |
| **Hub** | Index | Canonical registry of all vApps and their verification state |
| **Verifier Cluster** | Stateless nodes | Run Groth16, PLONK and STARK checks |
| **Launchpad** | Deployer | Deploys ERC-20/721, seeds liquidity, links proof hashes on-chain |
## 🚀 Quick Start
### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+
- Git
### Installation
```bash
# Clone the repository
git clone https://github.com/openvapps/openvapps-hub.git
cd openvapps-hub
# Install dependencies
npm install
# Copy environment configuration
cp .env.example .env
# Configure your environment variables
nano .env
```
### Environment Configuration
```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/openvapps"
# Redis
REDIS_URL="redis://localhost:6379"
# JWT Secret
JWT_SECRET="your-super-secret-jwt-key"
# Blockchain RPC URLs
ETHEREUM_RPC_URL="https://mainnet.infura.io/v3/your-key"
ARBITRUM_RPC_URL="https://arb1.arbitrum.io/rpc"
STARKNET_RPC_URL="https://starknet-mainnet.public.blastapi.io"
# API Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
# External Services
IPFS_GATEWAY_URL="https://gateway.pinata.cloud"
WEBHOOK_SECRET="your-webhook-secret"
```
### Database Setup
```bash
# Run database migrations
npx prisma migrate dev
# Generate Prisma client
npx prisma generate
# (Optional) Seed database with sample data
npm run seed
```
### Development
```bash
# Start development server with hot reload
npm run dev
# Run in production mode
npm run build
npm start
# Run tests
npm test
# Run tests with coverage
npm run test:coverage
# Lint code
npm run lint
# Format code
npm run format
```
## 📚 API Documentation
### Base URL
- **Production**: `https://api.openvapps.org`
- **Local**: `http://localhost:3000`
### Authentication
OpenvApps Hub uses JWT-based authentication. Include your token in the Authorization header:
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://api.openvapps.org/api/v1/vapps
```
### Core Endpoints
#### vApps Management
```bash
# Submit a new vApp
POST /api/v1/vapps
Content-Type: application/json
{
  "name": "my-zk-app",
  "description": "A zero-knowledge application",
  "sourceUrl": "https://github.com/user/my-zk-app",
  "proofType": "groth16",
  "metadata": {
    "version": "1.0.0",
    "circuit": "main.circom"
  }
}
# List vApps with filtering
GET /api/v1/vapps?status=verified&proofType=groth16&page=1&limit=20
# Get vApp details
GET /api/v1/vapps/{vappId}
# Update vApp metadata
PUT /api/v1/vapps/{vappId}
# Delete vApp
DELETE /api/v1/vapps/{vappId}
```
#### Verification System
```bash
# Trigger verification
POST /api/v1/verification/verify
{
  "vappId": "vapp_123",
  "proofData": "0x...",
  "publicInputs": ["0x1", "0x2"]
}
# Check verification status
GET /api/v1/verification/status/{verificationId}
# Get verification history
GET /api/v1/verification/history/{vappId}
# List verifier nodes
GET /api/v1/verification/nodes
```
#### Blockchain Integration
```bash
# Anchor proof to blockchain
POST /api/v1/blockchain/anchor
{
  "proofHash": "0x...",
  "chain": "ethereum",
  "vappId": "vapp_123"
}
# Verify blockchain anchor
GET /api/v1/blockchain/verify/{proofHash}?chain=ethereum
# Get anchor status
GET /api/v1/blockchain/status/{anchorId}
```
#### Webhook Management
```bash
# Register webhook
POST /api/v1/webhooks
{
  "url": "https://your-app.com/webhook",
  "events": ["verification.completed", "proof.anchored"],
  "secret": "webhook-secret"
}
# List webhooks
GET /api/v1/webhooks
# Test webhook
POST /api/v1/webhooks/{webhookId}/test
# Update webhook
PUT /api/v1/webhooks/{webhookId}
# Delete webhook
DELETE /api/v1/webhooks/{webhookId}
```
### Response Format
All API responses follow this structure:
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123"
  }
}
```
Error responses:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {
      "field": "name",
      "issue": "Required field missing"
    }
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123"
  }
}
```
## 🔧 CLI Usage
### Installation
```bash
npm install -g @openvapps/cli
```
### Commands
```bash
# Initialize new vApp project
vapp init my-zk-app --template groth16
# Submit vApp to hub
vapp submit --proof ./proof.json --metadata ./vapp.yaml
# Check verification status
vapp status vapp_123
# Download proof bundle
vapp export vapp_123 --format bundle
# List your vApps
vapp list --status verified
# Update vApp metadata
vapp update vapp_123 --metadata ./updated-vapp.yaml
```
### Configuration
Create `~/.vapp/config.yaml`:
```yaml
hub:
  url: https://api.openvapps.org
  apiKey: your-api-key
defaults:
  proofType: groth16
  visibility: public
  
chains:
  ethereum:
    rpcUrl: https://mainnet.infura.io/v3/your-key
  arbitrum:
    rpcUrl: https://arb1.arbitrum.io/rpc
```
## 🛠️ Development Guide
### Project Structure
```
openvapps-hub/
├── src/
│   ├── api/
│   │   ├── routes/          # API route handlers
│   │   └── middleware/      # Custom middleware
│   ├── services/            # Business logic
│   │   ├── blockchain.ts    # Blockchain integration
│   │   ├── verification.ts  # Proof verification
│   │   ├── webhook.ts       # Webhook management
│   │   └── redis.ts         # Caching layer
│   ├── database/            # Database connection
│   ├── types/               # TypeScript definitions
│   ├── utils/               # Utility functions
│   └── config/              # Configuration
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Database migrations
├── tests/                   # Test files
├── docs/                    # Documentation
└── scripts/                 # Utility scripts
```
### Database Schema
The OpenvApps Hub uses PostgreSQL with the following core entities:
- **VApps** - Application metadata and verification status
- **Proofs** - Zero-knowledge proof artifacts
- **Users** - Authentication and authorization
- **Verifications** - Verification attempts and results
- **Webhooks** - Event notification endpoints
- **Flags** - Community moderation flags
- **Stakes** - Economic security deposits
- **Anchors** - Blockchain proof anchors

### Testing
```bash
# Run all tests
npm test
# Run specific test file
npm test -- newFeature.test.ts
# Run tests in watch mode
npm run test:watch
# Generate coverage report
npm run test:coverage
```
### Code Quality
```bash
# Lint code
npm run lint
# Fix linting issues
npm run lint:fix
# Format code
npm run format
# Type check
npm run type-check
```
## 🚀 Deployment
### Docker Deployment
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/openvapps
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
  db:
    image: postgres:14
    environment:
      POSTGRES_DB: openvapps
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data
volumes:
  postgres_data:
  redis_data:
```
### Production Deployment
1. **Environment Setup**
```bash
# Set production environment variables
export NODE_ENV=production
export DATABASE_URL="postgresql://..."
export REDIS_URL="redis://..."
export JWT_SECRET="..."
```
2. **Database Migration**
```bash
npx prisma migrate deploy
```
3. **Build and Start**
```bash
npm run build
npm start
```
### Health Checks
```bash
# Health check endpoint
GET /health
# Detailed system status
GET /health/detailed
```
## 🤝 Contributing
We welcome contributions to OpenvApps Hub! Please see our [Contributing Guide](CONTRIBUTING.md) for details.
### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for your changes
5. Ensure all tests pass: `npm test`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request
### Code Style
- Use TypeScript for all new code
- Follow the existing code style
- Add JSDoc comments for public APIs
- Write tests for new features
- Update documentation as needed
## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
## 🔗 Links
- **Website**: [openvapps.org](https://openvapps.org)
- **Documentation**: [docs.openvapps.org](https://docs.openvapps.org)
- **API Reference**: [api.openvapps.org](https://api.openvapps.org/docs)
- **X / Twitter**: [@openvapps](https://x.com/openvapps)
- **GitHub**: [github.com/openvapps](https://github.com/openvapps)
## 🙏 Acknowledgments
- The zero-knowledge proof community for advancing cryptographic verification
- All contributors who help make OpenvApps better
- The open-source projects that make this possible
