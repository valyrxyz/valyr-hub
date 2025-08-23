# Valyr CLI Documentation
The Valyr CLI is a command-line tool that provides developers with a seamless interface to interact with the Valyr Hub. It enables easy submission, verification, and management of verifiable applications (vApps) with zero-knowledge proofs.
## 📦 Installation
### NPM Installation
```bash
# Install globally
npm install -g @valyr/cli
# Verify installation
vapp --version
```
### Alternative Installation Methods
```bash
# Using Yarn
yarn global add @valyr/cli
# Using pnpm
pnpm add -g @valyr/cli
# Using Homebrew (macOS)
brew install valyr/tap/vapp-cli
# Download binary directly
curl -L https://github.com/valyr/cli/releases/latest/download/vapp-linux-x64 -o vapp
chmod +x vapp
sudo mv vapp /usr/local/bin/
```
## 🚀 Quick Start
### Initial Setup
```bash
# Configure CLI with your API credentials
vapp config set --hub-url https://api.valyr.org
vapp config set --api-key your-api-key
# Or use interactive setup
vapp setup
```
### Basic Workflow
```bash
# 1. Initialize a new vApp project
vapp init my-zk-calculator --template groth16
# 2. Navigate to project directory
cd my-zk-calculator
# 3. Build your circuit and generate proofs
npm run build
# 4. Submit to Valyr Hub
vapp submit
# 5. Check verification status
vapp status
# 6. Export proof bundle
vapp export --format bundle
```
## 🔧 Configuration
### Configuration File
The CLI stores configuration in `~/.vapp/config.yaml`:
```yaml
hub:
  url: https://api.valyr.org
  apiKey: your-api-key
  timeout: 30000
defaults:
  proofType: groth16
  visibility: public
  includeSource: true
chains:
  ethereum:
    rpcUrl: https://mainnet.infura.io/v3/your-key
    privateKey: 0x... # Optional, for anchoring
  arbitrum:
    rpcUrl: https://arb1.arbitrum.io/rpc
    privateKey: 0x...
  starknet:
    rpcUrl: https://starknet-mainnet.public.blastapi.io
    privateKey: 0x...
templates:
  groth16: https://github.com/valyr/templates/groth16
  plonk: https://github.com/valyr/templates/plonk
  stark: https://github.com/valyr/templates/stark
output:
  format: json
  verbose: false
  colors: true
```
### Environment Variables
```bash
# Override config with environment variables
export VAPP_HUB_URL="https://api.valyr.org"
export VAPP_API_KEY="your-api-key"
export VAPP_DEFAULT_PROOF_TYPE="groth16"
export VAPP_VERBOSE="true"
```
## 📋 Commands Reference
### Global Options
```bash
--config, -c     Path to config file (default: ~/.vapp/config.yaml)
--verbose, -v    Enable verbose output
--quiet, -q      Suppress non-error output
--format, -f     Output format (json, yaml, table)
--help, -h       Show help
--version        Show version
```
### Authentication Commands
#### `vapp auth login`
Authenticate with Valyr Hub using email/password or OAuth.
```bash
# Email/password login
vapp auth login --email user@example.com
# OAuth login (opens browser)
vapp auth login --oauth
# Login with API key
vapp auth login --api-key your-api-key
Options:
  --email, -e      Email address
  --password, -p   Password (will prompt if not provided)
  --oauth          Use OAuth authentication
  --api-key        Use API key authentication
  --save           Save credentials to config file
```
#### `vapp auth logout`
Logout and clear stored credentials.
```bash
vapp auth logout
Options:
  --all    Clear all stored credentials
```
#### `vapp auth whoami`
Display current authentication status.
```bash
vapp auth whoami
# Example output:
# Authenticated as: john.doe@example.com
# User ID: user_123456
# Role: USER
# API Key: vapp_key_***abc123
```
### Project Management Commands
#### `vapp init`
Initialize a new vApp project from a template.
```bash
vapp init <project-name> [options]
# Examples:
vapp init my-calculator --template groth16
vapp init voting-app --template plonk --description "Anonymous voting system"
vapp init zkml-model --template stark --private
Options:
  --template, -t       Template to use (groth16, plonk, stark, custom)
  --description, -d    Project description
  --private           Create private vApp
  --git-url           Custom template Git URL
  --no-install        Skip dependency installation
  --force             Overwrite existing directory
```
**Available Templates:**
- `groth16`: Groth16 proof system template
- `plonk`: PLONK proof system template  
- `stark`: STARK proof system template
- `bulletproof`: Bulletproof template
- `custom`: Custom template from Git URL
#### `vapp submit`
Submit vApp to Valyr Hub for verification.
```bash
vapp submit [options]
# Examples:
vapp submit                                    # Submit current directory
vapp submit --proof ./build/proof.json        # Specify proof file
vapp submit --metadata ./vapp.yaml --private  # Private submission
Options:
  --proof, -p          Path to proof file (default: ./build/proof.json)
  --metadata, -m       Path to metadata file (default: ./vapp.yaml)
  --source-url         Source code repository URL
  --private           Submit as private vApp
  --tags              Comma-separated tags
  --description       Override description from metadata
  --dry-run           Validate without submitting
  --watch             Watch for changes and auto-resubmit
```
**vapp.yaml Format:**
```yaml
name: my-zk-calculator
description: A zero-knowledge calculator application
version: 1.0.0
proofType: groth16
visibility: public
circuit:
  main: calculator.circom
  inputs:
    - name: a
      type: field
      description: First number
    - name: b  
      type: field
      description: Second number
  outputs:
    - name: sum
      type: field
      description: Sum of inputs
build:
  command: npm run build
  outputDir: ./build
  
verification:
  timeout: 300
  retries: 3
tags:
  - calculator
  - arithmetic
  - demo
metadata:
  author: John Doe
  license: MIT
  repository: https://github.com/user/zk-calculator
```
### vApp Management Commands
#### `vapp list`
List your vApps or search public vApps.
```bash
vapp list [options]
# Examples:
vapp list                              # List your vApps
vapp list --all                        # List all public vApps
vapp list --status verified           # Filter by status
vapp list --proof-type groth16         # Filter by proof type
vapp list --search calculator          # Search by name/description
Options:
  --all               List all public vApps (not just yours)
  --status            Filter by status (pending, verified, flagged, rejected)
  --proof-type        Filter by proof type (groth16, plonk, stark)
  --visibility        Filter by visibility (public, private, unlisted)
  --search, -s        Search term for name/description
  --tags              Filter by tags (comma-separated)
  --limit, -l         Number of results to show (default: 20)
  --page              Page number for pagination
  --sort              Sort by (created, updated, name, status)
  --order             Sort order (asc, desc)
```
#### `vapp get`
Get detailed information about a specific vApp.
```bash
vapp get <vapp-id> [options]
# Examples:
vapp get vapp_123456                   # Basic info
vapp get vapp_123456 --full           # Full details including proofs
vapp get vapp_123456 --verifications  # Include verification history
Options:
  --full              Include full details (proofs, verifications, etc.)
  --verifications     Include verification history
  --anchors          Include blockchain anchors
  --exports          Include export history
  --flags            Include flag information
  --json             Output as JSON
```
#### `vapp update`
Update vApp metadata.
```bash
vapp update <vapp-id> [options]
# Examples:
vapp update vapp_123456 --description "Updated description"
vapp update vapp_123456 --metadata ./updated-vapp.yaml
vapp update vapp_123456 --tags "calculator,math,updated"
Options:
  --description, -d   Update description
  --metadata, -m      Path to updated metadata file
  --tags             Update tags (comma-separated)
  --visibility       Change visibility (public, private, unlisted)
  --source-url       Update source URL
```
#### `vapp delete`
Delete a vApp (irreversible).
```bash
vapp delete <vapp-id> [options]
Options:
  --force, -f    Skip confirmation prompt
  --reason       Reason for deletion
```
### Verification Commands
#### `vapp verify`
Trigger verification for a vApp.
```bash
vapp verify <vapp-id> [options]
# Examples:
vapp verify vapp_123456                # Trigger verification
vapp verify vapp_123456 --watch       # Watch verification progress
vapp verify vapp_123456 --node node_1 # Use specific verifier node
Options:
  --watch, -w        Watch verification progress
  --node             Prefer specific verifier node
  --timeout          Verification timeout in seconds
  --priority         Verification priority (low, normal, high)
```
#### `vapp status`
Check verification status.
```bash
vapp status [vapp-id] [options]
# Examples:
vapp status                           # Status of current project
vapp status vapp_123456              # Status of specific vApp
vapp status --all                    # Status of all your vApps
Options:
  --all              Show status of all your vApps
  --watch, -w        Watch for status changes
  --logs             Include verification logs
  --detailed         Show detailed verification information
```
### Blockchain Commands
#### `vapp anchor`
Anchor proof to blockchain.
```bash
vapp anchor <vapp-id> [options]
# Examples:
vapp anchor vapp_123456 --chain ethereum
vapp anchor vapp_123456 --chain arbitrum --gas-price 20
Options:
  --chain, -c        Blockchain to anchor to (ethereum, arbitrum, starknet)
  --gas-price        Gas price in gwei (for EVM chains)
  --gas-limit        Gas limit
  --priority         Transaction priority (low, normal, high)
  --wait             Wait for confirmation
```
#### `vapp verify-anchor`
Verify blockchain anchor.
```bash
vapp verify-anchor <proof-hash> --chain <chain>
# Examples:
vapp verify-anchor 0x1234... --chain ethereum
vapp verify-anchor 0x5678... --chain arbitrum
```
### Export Commands
#### `vapp export`
Export vApp bundle or proof artifacts.
```bash
vapp export <vapp-id> [options]
# Examples:
vapp export vapp_123456                        # Export as ZIP
vapp export vapp_123456 --format tar          # Export as TAR
vapp export vapp_123456 --format json         # Export metadata only
vapp export vapp_123456 --include-source      # Include source code
Options:
  --format, -f       Export format (zip, tar, json)
  --output, -o       Output file path
  --include-source   Include source code
  --include-proofs   Include proof artifacts
  --include-metadata Include metadata files
  --compress         Compress output
```
#### `vapp download`
Download exported bundle.
```bash
vapp download <export-id> [options]
Options:
  --output, -o    Output file path
  --extract       Extract after download
```
### Webhook Commands
#### `vapp webhook add`
Register a webhook endpoint.
```bash
vapp webhook add <url> [options]
# Examples:
vapp webhook add https://myapp.com/webhook
vapp webhook add https://myapp.com/webhook --events verification.completed,proof.anchored
vapp webhook add https://myapp.com/webhook --secret my-secret
Options:
  --events, -e       Comma-separated event types
  --secret, -s       Webhook secret for signature verification
  --description, -d  Webhook description
  --timeout          Request timeout in milliseconds
  --retries          Number of retry attempts
```
#### `vapp webhook list`
List registered webhooks.
```bash
vapp webhook list [options]
Options:
  --active           Show only active webhooks
  --url              Filter by URL pattern
```
#### `vapp webhook test`
Test webhook endpoint.
```bash
vapp webhook test <webhook-id> [options]
Options:
  --event            Event type to test
  --payload          Custom test payload (JSON)
```
#### `vapp webhook remove`
Remove webhook.
```bash
vapp webhook remove <webhook-id>
```
### Configuration Commands
#### `vapp config`
Manage CLI configuration.
```bash
# Set configuration value
vapp config set <key> <value>
# Get configuration value  
vapp config get <key>
# List all configuration
vapp config list
# Reset to defaults
vapp config reset
# Examples:
vapp config set hub.url https://api.valyr.org
vapp config set defaults.proofType plonk
vapp config get hub.url
```
#### `vapp setup`
Interactive setup wizard.
```bash
vapp setup [options]
Options:
  --reset    Reset existing configuration
  --minimal  Minimal setup (only required fields)
```
### Utility Commands
#### `vapp validate`
Validate vApp configuration and proofs.
```bash
vapp validate [path] [options]
# Examples:
vapp validate                    # Validate current directory
vapp validate ./my-vapp         # Validate specific directory
vapp validate --proof-only      # Validate only proof files
Options:
  --proof-only       Validate only proof files
  --metadata-only    Validate only metadata
  --strict          Use strict validation rules
  --schema          Custom validation schema
```
#### `vapp template`
Manage project templates.
```bash
# List available templates
vapp template list
# Add custom template
vapp template add <name> <git-url>
# Remove template
vapp template remove <name>
# Update templates
vapp template update
```
#### `vapp logs`
View CLI operation logs.
```bash
vapp logs [options]
Options:
  --level, -l    Log level filter (debug, info, warn, error)
  --since        Show logs since timestamp
  --tail, -t     Number of recent log entries
  --follow, -f   Follow log output
```
## 🔧 Advanced Usage
### Scripting and Automation
#### Batch Operations
```bash
#!/bin/bash
# Submit multiple vApps
for dir in ./projects/*/; do
  if [ -f "$dir/vapp.yaml" ]; then
    echo "Submitting $dir"
    cd "$dir"
    vapp submit --quiet
    cd ..
  fi
done
```
#### CI/CD Integration
```yaml
# .github/workflows/vapp-deploy.yml
name: Deploy vApp
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install Valyr CLI
        run: npm install -g @valyr/cli
        
      - name: Configure CLI
        run: |
          vapp config set hub.url ${{ secrets.VAPP_HUB_URL }}
          vapp config set hub.apiKey ${{ secrets.VAPP_API_KEY }}
          
      - name: Build and submit vApp
        run: |
          npm install
          npm run build
          vapp submit --watch
```
#### Monitoring Script
```bash
#!/bin/bash
# Monitor vApp verification status
VAPP_ID="vapp_123456"
while true; do
  STATUS=$(vapp status $VAPP_ID --format json | jq -r '.status')
  
  case $STATUS in
    "verified")
      echo "✅ Verification completed successfully"
      break
      ;;
    "failed")
      echo "❌ Verification failed"
      vapp status $VAPP_ID --logs
      exit 1
      ;;
    "pending"|"in_progress")
      echo "⏳ Verification in progress..."
      sleep 30
      ;;
    *)
      echo "❓ Unknown status: $STATUS"
      exit 1
      ;;
  esac
done
```
### Custom Templates
#### Creating a Template
```bash
# Template structure
my-template/
├── template.yaml           # Template configuration
├── {{name}}/              # Project template
│   ├── package.json
│   ├── vapp.yaml
│   ├── circuits/
│   │   └── main.circom
│   └── scripts/
│       └── build.js
└── hooks/                 # Template hooks
    ├── pre-init.js
    └── post-init.js
```
**template.yaml:**
```yaml
name: my-custom-template
description: Custom template for my use case
version: 1.0.0
proofType: groth16
variables:
  - name: projectName
    description: Project name
    required: true
  - name: author
    description: Author name
    default: Anonymous
dependencies:
  - circomlib
  - snarkjs
hooks:
  preInit: hooks/pre-init.js
  postInit: hooks/post-init.js
```
#### Using Custom Templates
```bash
# Add template from Git repository
vapp template add my-template https://github.com/user/my-template
# Use custom template
vapp init my-project --template my-template
```
## 🐛 Troubleshooting
### Common Issues
#### Authentication Problems
```bash
# Check authentication status
vapp auth whoami
# Re-authenticate
vapp auth logout
vapp auth login
# Verify API key
vapp config get hub.apiKey
```
#### Submission Failures
```bash
# Validate before submitting
vapp validate
# Check proof file format
vapp validate --proof-only
# Submit with verbose output
vapp submit --verbose
# Dry run to check for issues
vapp submit --dry-run
```
#### Network Issues
```bash
# Test connectivity
curl -I https://api.valyr.org/health
# Check configuration
vapp config get hub.url
# Use different endpoint
vapp config set hub.url https://staging-api.valyr.org
```
### Debug Mode
```bash
# Enable debug logging
export VAPP_DEBUG=true
vapp submit
# Or use verbose flag
vapp submit --verbose
# Check logs
vapp logs --level debug --tail 50
```
### Getting Help
```bash
# Command help
vapp --help
vapp submit --help
# Version information
vapp --version
# Configuration check
vapp config list
```
## 📚 Examples
### Complete Workflow Example
```bash
# 1. Setup
vapp setup
# 2. Create new project
vapp init zk-voting --template groth16 --description "Anonymous voting system"
cd zk-voting
# 3. Develop your circuit
# Edit circuits/voting.circom
# Edit vapp.yaml
# 4. Build
npm run build
# 5. Validate
vapp validate
# 6. Submit
vapp submit --tags "voting,privacy,governance"
# 7. Monitor verification
vapp status --watch
# 8. Anchor to blockchain
vapp anchor $(vapp get --json | jq -r '.id') --chain ethereum
# 9. Export bundle
vapp export $(vapp get --json | jq -r '.id') --format zip --output voting-bundle.zip
```
### Integration with Build Tools
#### Package.json Scripts
```json
{
  "scripts": {
    "build": "circom circuits/main.circom --r1cs --wasm --sym",
    "prove": "node scripts/generate-proof.js",
    "vapp:submit": "vapp submit",
    "vapp:status": "vapp status --watch",
    "vapp:export": "vapp export $(vapp get --json | jq -r '.id')"
  }
}
```
#### Makefile Integration
```makefile
.PHONY: build submit status export
build:
	npm run build
submit: build
	vapp validate
	vapp submit
status:
	vapp status --watch
export:
	vapp export $(shell vapp get --json | jq -r '.id') --format zip
```
## 🔗 Related Resources
- [Valyr Hub API Documentation](API.md)
For CLI support:
- **GitHub Issues**: [github.com/valyr-hub/issues](https://github.com/valyr-hub/issues)
- **Email**: team@valyr.org
