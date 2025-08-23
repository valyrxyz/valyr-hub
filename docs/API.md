# Valyr Hub API Documentation
## Overview
The Valyr Hub API provides a comprehensive interface for managing verifiable applications (vApps) with zero-knowledge proofs. This RESTful API supports all core functionality including vApp submission, verification, blockchain anchoring, and community moderation.
## Base URLs
- **Production**: `https://api.valyr.xyz`
- **Local Development**: `http://localhost:3000`
## Authentication
### JWT Authentication
Most endpoints require authentication using JWT tokens. Include your token in the Authorization header:
```http
Authorization: Bearer YOUR_JWT_TOKEN
```
### API Keys
For programmatic access, you can use API keys:
```http
X-API-Key: YOUR_API_KEY
```
### Obtaining Tokens
```http
POST /api/v1/auth/login
Content-Type: application/json
{
  "email": "user@example.com",
  "password": "your-password"
}
```
Response:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_here",
    "expiresIn": 3600,
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "role": "USER"
    }
  }
}
```
## Rate Limiting
API requests are rate limited:
- **Authenticated users**: 1000 requests per hour
- **Unauthenticated users**: 100 requests per hour
Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```
## Response Format
All API responses follow this structure:
### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123456",
    "version": "1.0.0"
  }
}
```
### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      // Additional error details
    }
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123456"
  }
}
```
### Pagination
Paginated responses include pagination metadata:
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```
## Core Endpoints
### vApps Management
#### Create vApp
```http
POST /api/v1/vapps
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "name": "my-zk-calculator",
  "description": "A zero-knowledge calculator application",
  "sourceUrl": "https://github.com/user/zk-calculator",
  "proofType": "groth16",
  "visibility": "public",
  "metadata": {
    "version": "1.0.0",
    "circuit": "calculator.circom",
    "inputs": ["a", "b"],
    "outputs": ["sum"]
  },
  "tags": ["calculator", "arithmetic", "zk"]
}
```
Response:
```json
{
  "success": true,
  "data": {
    "id": "vapp_123456",
    "name": "my-zk-calculator",
    "description": "A zero-knowledge calculator application",
    "sourceUrl": "https://github.com/user/zk-calculator",
    "proofType": "groth16",
    "status": "pending",
    "visibility": "public",
    "metadata": {
      "version": "1.0.0",
      "circuit": "calculator.circom",
      "inputs": ["a", "b"],
      "outputs": ["sum"]
    },
    "tags": ["calculator", "arithmetic", "zk"],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "owner": {
      "id": "user_123",
      "username": "developer"
    }
  }
}
```
#### List vApps
```http
GET /api/v1/vapps?page=1&limit=20&status=verified&proofType=groth16&search=calculator
```
Query Parameters:
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `status` (string): Filter by status (`pending`, `verified`, `flagged`, `rejected`)
- `proofType` (string): Filter by proof type (`groth16`, `plonk`, `stark`)
- `visibility` (string): Filter by visibility (`public`, `private`)
- `search` (string): Search in name and description
- `tags` (string): Comma-separated tags
- `owner` (string): Filter by owner ID
- `sortBy` (string): Sort field (`createdAt`, `updatedAt`, `name`)
- `sortOrder` (string): Sort order (`asc`, `desc`)
#### Get vApp Details
```http
GET /api/v1/vapps/{vappId}
```
Response includes full vApp details plus verification history:
```json
{
  "success": true,
  "data": {
    "id": "vapp_123456",
    "name": "my-zk-calculator",
    // ... other vApp fields
    "verifications": [
      {
        "id": "verification_789",
        "status": "verified",
        "verifiedAt": "2024-01-01T00:00:00Z",
        "verifierNode": "node_001"
      }
    ],
    "anchors": [
      {
        "id": "anchor_456",
        "chain": "ethereum",
        "transactionHash": "0x...",
        "blockNumber": 18500000
      }
    ],
    "stats": {
      "verificationCount": 5,
      "flagCount": 0,
      "exportCount": 25
    }
  }
}
```
#### Update vApp
```http
PUT /api/v1/vapps/{vappId}
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "description": "Updated description",
  "metadata": {
    "version": "1.1.0"
  },
  "tags": ["calculator", "arithmetic", "zk", "updated"]
}
```
#### Delete vApp
```http
DELETE /api/v1/vapps/{vappId}
Authorization: Bearer YOUR_TOKEN
```
### Verification System
#### Submit Proof for Verification
```http
POST /api/v1/verification/verify
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "vappId": "vapp_123456",
  "proofData": {
    "proof": "0x1234...",
    "publicInputs": ["0x01", "0x02"],
    "verifyingKey": "0x5678..."
  },
  "metadata": {
    "prover": "snarkjs",
    "version": "0.6.11"
  }
}
```
Response:
```json
{
  "success": true,
  "data": {
    "verificationId": "verification_789",
    "status": "pending",
    "submittedAt": "2024-01-01T00:00:00Z",
    "estimatedCompletionTime": "2024-01-01T00:05:00Z"
  }
}
```
#### Check Verification Status
```http
GET /api/v1/verification/status/{verificationId}
```
Response:
```json
{
  "success": true,
  "data": {
    "id": "verification_789",
    "vappId": "vapp_123456",
    "status": "verified",
    "result": {
      "valid": true,
      "verifiedAt": "2024-01-01T00:03:00Z",
      "verifierNode": "node_001",
      "executionTime": 3.2,
      "gasUsed": 150000
    },
    "logs": [
      {
        "timestamp": "2024-01-01T00:00:00Z",
        "level": "info",
        "message": "Verification started"
      },
      {
        "timestamp": "2024-01-01T00:03:00Z",
        "level": "info",
        "message": "Verification completed successfully"
      }
    ]
  }
}
```
#### Get Verification History
```http
GET /api/v1/verification/history/{vappId}?page=1&limit=10
```
#### List Verifier Nodes
```http
GET /api/v1/verification/nodes
```
Response:
```json
{
  "success": true,
  "data": {
    "nodes": [
      {
        "id": "node_001",
        "name": "Verifier Node 1",
        "status": "active",
        "supportedProofTypes": ["groth16", "plonk"],
        "location": "us-east-1",
        "performance": {
          "averageVerificationTime": 2.5,
          "successRate": 99.8,
          "totalVerifications": 10000
        }
      }
    ],
    "totalNodes": 5,
    "activeNodes": 4
  }
}
```
### Blockchain Integration
#### Anchor Proof to Blockchain
```http
POST /api/v1/blockchain/anchor
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "proofHash": "0x1234567890abcdef...",
  "chain": "ethereum",
  "vappId": "vapp_123456",
  "metadata": {
    "version": "1.0.0",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```
Response:
```json
{
  "success": true,
  "data": {
    "anchorId": "anchor_456",
    "transactionHash": "0xabcdef...",
    "status": "pending",
    "estimatedConfirmationTime": "2024-01-01T00:15:00Z"
  }
}
```
#### Verify Blockchain Anchor
```http
GET /api/v1/blockchain/verify/{proofHash}?chain=ethereum
```
Response:
```json
{
  "success": true,
  "data": {
    "anchored": true,
    "chain": "ethereum",
    "transactionHash": "0xabcdef...",
    "blockNumber": 18500000,
    "confirmations": 12,
    "anchoredAt": "2024-01-01T00:10:00Z"
  }
}
```
#### Get Anchor Status
```http
GET /api/v1/blockchain/status/{anchorId}
```
### Webhook Management
#### Register Webhook
```http
POST /api/v1/webhooks
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "url": "https://your-app.com/webhook/valyr",
  "events": [
    "verification.completed",
    "verification.failed",
    "proof.anchored",
    "vapp.flagged"
  ],
  "secret": "your-webhook-secret",
  "description": "Production webhook for CI/CD",
  "isActive": true
}
```
Response:
```json
{
  "success": true,
  "data": {
    "id": "webhook_123",
    "url": "https://your-app.com/webhook/valyr",
    "events": [
      "verification.completed",
      "verification.failed",
      "proof.anchored",
      "vapp.flagged"
    ],
    "secret": "your-webhook-secret",
    "description": "Production webhook for CI/CD",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```
#### List Webhooks
```http
GET /api/v1/webhooks?page=1&limit=10&isActive=true
```
#### Test Webhook
```http
POST /api/v1/webhooks/{webhookId}/test
Authorization: Bearer YOUR_TOKEN
{
  "eventType": "verification.completed",
  "testData": {
    "vappId": "vapp_123456",
    "verificationId": "verification_789"
  }
}
```
#### Update Webhook
```http
PUT /api/v1/webhooks/{webhookId}
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "events": ["verification.completed", "proof.anchored"],
  "isActive": false
}
```
#### Delete Webhook
```http
DELETE /api/v1/webhooks/{webhookId}
Authorization: Bearer YOUR_TOKEN
```
### Flag & Slash System
#### Flag vApp
```http
POST /api/v1/flags
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "vappId": "vapp_123456",
  "reason": "invalid_proof",
  "description": "The proof verification fails with the provided inputs",
  "evidence": {
    "proofData": "0x...",
    "expectedResult": false,
    "actualResult": true
  }
}
```
#### List Flags
```http
GET /api/v1/flags?vappId=vapp_123456&status=pending&page=1&limit=10
```
#### Resolve Flag
```http
PUT /api/v1/flags/{flagId}/resolve
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "resolution": "valid",
  "comment": "Flag was incorrect, proof is valid"
}
```
### Export System
#### Export vApp Bundle
```http
GET /api/v1/exports/{vappId}/bundle?format=zip&includeProofs=true
Authorization: Bearer YOUR_TOKEN
```
Query Parameters:
- `format` (string): Export format (`zip`, `tar`, `json`)
- `includeProofs` (boolean): Include proof artifacts
- `includeSource` (boolean): Include source code
- `includeMetadata` (boolean): Include metadata
#### Get Export History
```http
GET /api/v1/exports/history?vappId=vapp_123456&page=1&limit=10
```
### User Management
#### Get User Profile
```http
GET /api/v1/users/profile
Authorization: Bearer YOUR_TOKEN
```
#### Update User Profile
```http
PUT /api/v1/users/profile
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
{
  "displayName": "John Doe",
  "bio": "ZK developer and researcher",
  "website": "https://johndoe.dev",
  "twitter": "johndoe"
}
```
#### Get User's vApps
```http
GET /api/v1/users/{userId}/vapps?page=1&limit=20
```
### Statistics and Analytics
#### Get Platform Statistics
```http
GET /api/v1/stats/platform
```
Response:
```json
{
  "success": true,
  "data": {
    "totalVApps": 1250,
    "totalVerifications": 15000,
    "totalUsers": 500,
    "totalAnchors": 8000,
    "proofTypeDistribution": {
      "groth16": 60,
      "plonk": 30,
      "stark": 10
    },
    "chainDistribution": {
      "ethereum": 50,
      "arbitrum": 30,
      "starknet": 20
    }
  }
}
```
#### Get vApp Statistics
```http
GET /api/v1/stats/vapps/{vappId}
```
## Webhook Events
### Event Types
- `verification.started` - Verification process started
- `verification.completed` - Verification completed successfully
- `verification.failed` - Verification failed
- `proof.anchored` - Proof anchored to blockchain
- `vapp.created` - New vApp created
- `vapp.updated` - vApp metadata updated
- `vapp.flagged` - vApp flagged by community
- `flag.resolved` - Flag resolved by moderator
### Webhook Payload
```json
{
  "id": "event_123456",
  "type": "verification.completed",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "vappId": "vapp_123456",
    "verificationId": "verification_789",
    "status": "verified",
    "result": {
      "valid": true,
      "verifierNode": "node_001"
    }
  },
  "signature": "sha256=..."
}
```
### Webhook Verification
Verify webhook signatures using HMAC-SHA256:
```javascript
const crypto = require('crypto');
function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```
## Error Codes
### Authentication Errors
- `AUTH_REQUIRED` - Authentication required
- `INVALID_TOKEN` - Invalid or expired token
- `INSUFFICIENT_PERMISSIONS` - Insufficient permissions
### Validation Errors
- `VALIDATION_ERROR` - Input validation failed
- `INVALID_PROOF_TYPE` - Unsupported proof type
- `INVALID_CHAIN` - Unsupported blockchain
### Resource Errors
- `VAPP_NOT_FOUND` - vApp not found
- `VERIFICATION_NOT_FOUND` - Verification not found
- `WEBHOOK_NOT_FOUND` - Webhook not found
### Rate Limiting
- `RATE_LIMIT_EXCEEDED` - Rate limit exceeded
### Server Errors
- `INTERNAL_ERROR` - Internal server error
- `SERVICE_UNAVAILABLE` - Service temporarily unavailable
## SDKs and Libraries
### JavaScript/TypeScript
```bash
npm install @valyr/sdk
```
```javascript
import { ValyrClient } from '@valyr/sdk';
const client = new ValyrClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.valyr.xyz'
});
// Submit vApp
const vapp = await client.vapps.create({
  name: 'my-zk-app',
  proofType: 'groth16',
  sourceUrl: 'https://github.com/user/my-zk-app'
});
// Verify proof
const verification = await client.verification.verify({
  vappId: vapp.id,
  proofData: { /* proof data */ }
});
```

## OpenAPI Specification
The complete OpenAPI 3.0 specification is available at:
- **JSON**: `https://api.valyr.xyz/openapi.json`
- **YAML**: `https://api.valyr.xyz/openapi.yaml`
- **Interactive Docs**: `https://api.valyr.xyz/docs`
## Support
For API support:
- **Documentation**: [docs.valyr.xyz](https://docs.valyr.xyz)
- **Email**: team@valyr.xyz
- **GitHub Issues**: [github.com/valyr/valyr-hub/issues](https://github.com/valyrxyz/valyr-hub/issues)
