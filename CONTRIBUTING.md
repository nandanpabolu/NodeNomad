# 🤝 Contributing to NodeNomad

Thank you for your interest in contributing to NodeNomad! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Development Workflow](#development-workflow)

## 📜 Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) Code of Conduct. By participating, you are expected to uphold this code.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Git
- TypeScript knowledge
- Understanding of distributed systems concepts

### Development Setup

1. **Fork the repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/your-username/NodeNomad.git
   cd NodeNomad
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## 🛠️ Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow ESLint and Prettier configurations
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Write unit tests for new features

### Project Structure

```
src/
├── core/                 # Core engine implementations
│   ├── consensus/        # Raft consensus engine
│   ├── storage/          # Storage engine with WAL
│   ├── sharding/         # Consistent hashing
│   └── migration/        # Migration engine
├── cluster/              # Cluster management
├── api/                  # REST API endpoints
├── monitoring/           # Monitoring dashboard
└── utils/                # Utilities and logging
```

### Testing

- Write unit tests for all new features
- Ensure integration tests pass
- Test migration scenarios thoroughly
- Test error conditions and edge cases

### Performance

- Consider performance implications of changes
- Add benchmarks for performance-critical code
- Monitor memory usage and garbage collection
- Test with large datasets

## 📝 Contributing Guidelines

### Types of Contributions

1. **Bug Fixes**: Fix existing issues
2. **Features**: Add new functionality
3. **Documentation**: Improve documentation
4. **Tests**: Add or improve tests
5. **Performance**: Optimize existing code
6. **Refactoring**: Improve code quality

### Before You Start

1. Check existing issues and pull requests
2. Discuss major changes in an issue first
3. Ensure your changes align with project goals
4. Consider backward compatibility

### Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build process or auxiliary tool changes

Examples:
```
feat(migration): add progress tracking for live migrations
fix(consensus): resolve split-brain issue in edge cases
docs(api): update migration endpoint documentation
```

## 🔄 Pull Request Process

### Before Submitting

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, well-documented code
   - Add tests for new functionality
   - Update documentation if needed

3. **Run tests and linting**
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

### Pull Request Template

When creating a pull request, include:

- **Description**: What changes were made and why
- **Type**: Bug fix, feature, documentation, etc.
- **Testing**: How the changes were tested
- **Breaking Changes**: Any breaking changes
- **Related Issues**: Link to related issues

### Review Process

1. **Automated Checks**: CI/CD pipeline runs tests and linting
2. **Code Review**: Maintainers review the code
3. **Testing**: Changes are tested in different environments
4. **Approval**: At least one maintainer approval required
5. **Merge**: Changes are merged into main branch

## 🐛 Issue Reporting

### Before Creating an Issue

1. Search existing issues
2. Check if it's already reported
3. Verify it's not a duplicate

### Issue Template

When creating an issue, include:

- **Bug Report**:
  - Clear description of the bug
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details
  - Logs and error messages

- **Feature Request**:
  - Clear description of the feature
  - Use case and motivation
  - Proposed solution
  - Alternatives considered

### Issue Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Improvements to documentation
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `priority: high`: High priority
- `priority: low`: Low priority
- `type: question`: Further information is requested

## 🔄 Development Workflow

### Branch Strategy

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: Feature development
- `bugfix/*`: Bug fixes
- `hotfix/*`: Critical fixes

### Release Process

1. **Version Bumping**: Update version in package.json
2. **Changelog**: Update CHANGELOG.md
3. **Tagging**: Create git tag for release
4. **Documentation**: Update documentation
5. **Testing**: Comprehensive testing
6. **Deployment**: Deploy to production

### Continuous Integration

- **Automated Testing**: All tests run on every PR
- **Code Quality**: ESLint and Prettier checks
- **Type Checking**: TypeScript compilation
- **Security**: Dependency vulnerability scanning
- **Performance**: Performance regression testing

## 🧪 Testing Guidelines

### Unit Tests

- Test individual functions and methods
- Mock external dependencies
- Test edge cases and error conditions
- Aim for high code coverage

### Integration Tests

- Test component interactions
- Test API endpoints
- Test database operations
- Test migration scenarios

### End-to-End Tests

- Test complete user workflows
- Test multi-node scenarios
- Test failure scenarios
- Test performance under load

### Test Commands

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📚 Documentation

### Code Documentation

- Use JSDoc for all public APIs
- Include examples in documentation
- Document complex algorithms
- Keep documentation up to date

### API Documentation

- Document all endpoints
- Include request/response examples
- Document error codes and messages
- Keep API documentation current

### Architecture Documentation

- Document system architecture
- Explain design decisions
- Include diagrams where helpful
- Document deployment procedures

## 🔧 Development Tools

### Recommended IDE

- **VS Code** with TypeScript extension
- **WebStorm** for advanced TypeScript support

### Useful Extensions

- TypeScript and JavaScript Language Features
- ESLint
- Prettier
- GitLens
- REST Client

### Debugging

- Use Node.js debugger
- Add logging for debugging
- Use monitoring dashboard
- Test with small datasets

## 🚀 Getting Help

### Community

- **GitHub Discussions**: For questions and discussions
- **GitHub Issues**: For bug reports and feature requests
- **Discord**: For real-time chat (if available)

### Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [Raft Consensus Algorithm](https://raft.github.io/)
- [Distributed Systems Concepts](https://en.wikipedia.org/wiki/Distributed_computing)

## 📄 License

By contributing to NodeNomad, you agree that your contributions will be licensed under the MIT License.

## 🙏 Recognition

Contributors will be recognized in:

- CONTRIBUTORS.md file
- Release notes
- Project documentation
- GitHub contributors page

Thank you for contributing to NodeNomad! 🚀
