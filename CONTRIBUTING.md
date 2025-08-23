# Contributing to Valyr

Thank you for your interest in contributing to Valyr! This document provides guidelines and information for contributors.

## 🤝 Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 14+
- Redis 6+
- Git

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/valyrxyz/valyr-hub.git
   cd valyr-hub
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Services**
   ```bash
   docker-compose up -d postgres redis ipfs
   npm run db:migrate
   npm run db:seed
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **Run Tests**
   ```bash
   npm test
   npm run test:coverage
   ```

## 📋 How to Contribute

### Reporting Bugs

1. **Check Existing Issues** - Search for existing bug reports
2. **Create Detailed Report** - Include:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node.js version, etc.)
   - Screenshots or logs if applicable

### Suggesting Features

1. **Check Roadmap** - Review our [roadmap](ROADMAP.md) and existing feature requests
2. **Create Feature Request** - Include:
   - Clear description of the feature
   - Use cases and benefits
   - Proposed implementation approach
   - Any relevant examples or mockups

### Code Contributions

1. **Choose an Issue**
   - Look for issues labeled `good first issue` for beginners
   - Comment on the issue to indicate you're working on it

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

3. **Make Changes**
   - Follow our coding standards (see below)
   - Write tests for new functionality
   - Update documentation as needed

4. **Test Your Changes**
   ```bash
   npm run lint
   npm test
   npm run test:coverage
   ```

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new verification algorithm"
   ```

6. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a Pull Request on GitHub.

## 📝 Coding Standards

### TypeScript Guidelines

- Use TypeScript for all new code
- Enable strict mode in tsconfig.json
- Provide proper type annotations
- Use interfaces for object shapes
- Prefer `const` over `let` when possible

### Code Style

- Use Prettier for code formatting
- Follow ESLint rules
- Use meaningful variable and function names
- Write self-documenting code with clear comments
- Keep functions small and focused

### API Design

- Follow RESTful conventions
- Use consistent naming patterns
- Provide comprehensive OpenAPI documentation
- Include proper error handling
- Implement rate limiting and security measures

### Database

- Use Prisma for database operations
- Write migrations for schema changes
- Include proper indexes for performance
- Use transactions for data consistency
- Follow naming conventions for tables and columns

### Testing

- Write unit tests for all business logic
- Include integration tests for API endpoints
- Use meaningful test descriptions
- Aim for high test coverage (>80%)
- Mock external dependencies

## 🏗️ Project Structure

```
src/
├── api/           # API routes and controllers
├── config/        # Configuration files
├── database/      # Database connection and utilities
├── services/      # Business logic services
├── types/         # TypeScript type definitions
├── utils/         # Utility functions
└── index.ts       # Application entry point

docs/              # Documentation
├── api/           # API documentation
├── database/      # Database schema docs
└── examples/      # Code examples

prisma/            # Database schema and migrations
tests/             # Test files
docker/            # Docker configuration
```

## 🔍 Pull Request Process

1. **PR Description**
   - Clearly describe what the PR does
   - Reference related issues
   - Include screenshots for UI changes
   - List any breaking changes

2. **Review Process**
   - All PRs require at least one review
   - Address reviewer feedback promptly
   - Keep PRs focused and reasonably sized
   - Ensure CI checks pass

3. **Merge Requirements**
   - All tests must pass
   - Code coverage must not decrease
   - Documentation must be updated
   - No merge conflicts

## 🧪 Testing Guidelines

### Unit Tests
```typescript
describe('VerificationService', () => {
  it('should verify valid Groth16 proof', async () => {
    const service = new VerificationService();
    const result = await service.verifyGroth16Proof(validProof);
    expect(result.isValid).toBe(true);
  });
});
```

### Integration Tests
```typescript
describe('POST /api/v1/vapps', () => {
  it('should create a new vApp', async () => {
    const response = await request(app)
      .post('/api/v1/vapps')
      .set('Authorization', `Bearer ${token}`)
      .send(vappData)
      .expect(201);
    
    expect(response.body.name).toBe(vappData.name);
  });
});
```

## 📚 Documentation

- Update README.md for significant changes
- Add JSDoc comments for public APIs
- Update OpenAPI specifications
- Include examples in documentation
- Keep documentation in sync with code

## 🔒 Security

- Never commit secrets or API keys
- Use environment variables for configuration
- Validate all user inputs
- Implement proper authentication and authorization
- Follow OWASP security guidelines

## 🚀 Release Process

1. **Version Bump**
   ```bash
   npm version patch|minor|major
   ```

2. **Update Changelog**
   - Document all changes
   - Follow [Keep a Changelog](https://keepachangelog.com/) format

3. **Create Release**
   - Tag the release in Git
   - Create GitHub release with notes
   - Deploy to staging for testing

## 💬 Communication

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - General questions and ideas
- **Discord** - Real-time chat and community support
- **Email** - Security issues: team@valyr.xyz

## 🏷️ Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

### Examples
```
feat(api): add webhook support for verification events
fix(db): resolve connection pool exhaustion issue
docs(readme): update installation instructions
test(verification): add unit tests for STARK proof validation
```

## 🎯 Areas for Contribution

### High Priority
- Zero-knowledge proof verification algorithms
- Blockchain integration improvements
- Performance optimizations
- Security enhancements

### Medium Priority
- CLI tool enhancements
- Additional export formats
- Monitoring and alerting
- Developer experience improvements

### Good First Issues
- Documentation improvements
- Test coverage increases
- Bug fixes
- Code cleanup and refactoring

## 📄 License

By contributing to Valyr, you agree that your contributions will be licensed under the MIT License.

## 🙏 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Annual contributor highlights
- Special Discord roles

Thank you for contributing to Valyr! 🚀

