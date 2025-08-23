# Valyr Documentation

Welcome to the Valyr documentation! This guide will help you understand and use the Valyr platform for verifiable applications with zero-knowledge proofs.

## 📚 Table of Contents

- [API Reference](./API.md)
- [Architecture Reference](./ARCHITECTURE.md)
- [Database Schema](./DATABASE.md)
- [CLI Documentation](./CLI.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Contributing](../CONTRIBUTING.md)

## 🚀 Quick Start

1. **Installation**
   ```bash
   git clone https://github.com/valyr/valyr-hub.git
   cd valyr-hub
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Services**
   ```bash
   docker-compose up -d
   npm run db:migrate
   npm run dev
   ```

4. **Access the API**
   - API: http://localhost:3000
   - Documentation: http://localhost:3000/docs
   - Health Check: http://localhost:3000/health

## 🏗️ Architecture Overview

Valyr consists of four main components:

### 1. AI Starters
- Generates boilerplate code and test circuits
- Provides CI templates for automated verification
- Scaffolds new projects with zk-proof stubs

### 2. Hub Index
- Canonical registry of all vApps
- Manages verification state and metadata
- Provides public API for querying vApps

### 3. Verifier Cluster
- Stateless nodes for proof verification
- Supports Groth16, PLONK, and STARK proofs
- Distributed verification for scalability

### 4. Launchpad
- Deploys ERC-20/721 tokens for verified vApps
- Seeds liquidity pools
- Links proof hashes on-chain

## 🔗 Blockchain Integration

Valyr supports multiple blockchain networks:

- **Ethereum** — Verification logs and proof anchoring
- **Arbitrum** — L2 scaling for high-throughput verification
- **Starknet** — Native STARK proof support

## 📖 Core Concepts

### vApps (Verifiable Applications)
Applications that include zero-knowledge proofs of execution. Each vApp contains:
- Source code with verifiable execution
- Zero-knowledge proofs (zk-SNARKs/STARKs)
- Metadata and verification keys
- Continuous verification status

### Submission Paths
1. **Hosted Package** — Upload code + proofs → Hub stores on IPFS → Cluster verifies
2. **External Tracker** — Register repo/contract → Hub polls releases → Verifier checks new proofs

### Proof Types
- **Groth16** — Efficient zk-SNARKs with small proof size
- **PLONK** — Universal zk-SNARKs with trusted setup
- **STARK** — Transparent proofs without trusted setup

## 🛠️ Development Workflow

1. **Create vApp**
   ```bash
   vapp init my-zk-app
   cd my-zk-app
   ```

2. **Develop Circuit**
   ```bash
   # Edit your circuit files
   npm run build-circuit
   npm run generate-proof
   ```

3. **Submit to Hub**
   ```bash
   vapp submit --proof ./proof.json --metadata ./vapp.yaml
   ```

4. **Monitor Verification**
   ```bash
   vapp status <submission-id>
   vapp logs <submission-id>
   ```

## 🔐 Security & Trust

### Community Governance
- **Flagging System** — Community can flag invalid proofs or malicious code
- **Staking & Slashing** — Economic incentives for honest behavior
- **Reputation System** — Track contributor reliability

### Verification Pipeline
1. **Source Code Analysis** — Static analysis and dependency checking
2. **Proof Verification** — Mathematical verification of zk-proofs
3. **Blockchain Anchoring** — Immutable verification logs
4. **Continuous Monitoring** — Ongoing verification on code changes

## 📊 Monitoring & Analytics

### Verification Metrics
- Proof verification success rates
- Average verification times
- Verifier cluster health
- Blockchain anchoring status

### vApp Analytics
- Submission trends
- Popular proof types
- Community engagement
- Export download statistics

## 🤝 Community & Support

- **GitHub Issues** — Bug reports and feature requests
- **Discord** — Community discussions and support
- **Documentation** — Comprehensive guides and tutorials
- **Examples** — Sample vApps and integrations

## 📄 License

Valyr is released under the MIT License. See [LICENSE](../LICENSE) for details.

---

**Ready to build verifiable applications?** Start with our [API Reference](./API.md).

