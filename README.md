# 🚀 NodeNomad

> **A distributed key-value store where nodes migrate like digital nomads**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

## 🌟 Overview

NodeNomad is a **production-ready distributed key-value store** that implements advanced distributed systems concepts including Raft consensus, consistent hashing, and the unique **"nomad" feature** - live node migration without downtime.

### 🎯 Key Features

- **🏗️ Distributed Architecture**: Raft consensus protocol with leader election
- **🗄️ Persistent Storage**: Write-Ahead Log (WAL) with crash recovery
- **⚖️ Load Balancing**: Consistent hashing with virtual nodes
- **🚚 Live Migration**: Zero-downtime data movement between nodes
- **📊 Real-time Monitoring**: Comprehensive dashboard and metrics
- **🔧 Production Ready**: TypeScript, comprehensive testing, Docker support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/nandanpabolu/NodeNomad.git
cd NodeNomad

# Install dependencies
npm install

# Start the server
npm start
```

### Basic Usage

```bash
# Store data
curl -X POST http://localhost:3000/api/v1/set \
  -H "Content-Type: application/json" \
  -d '{"key": "user:123", "value": "John Doe", "ttl": 3600}'

# Retrieve data
curl http://localhost:3000/api/v1/get/user:123

# Delete data
curl -X DELETE http://localhost:3000/api/v1/delete/user:123
```

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    NodeNomad Cluster                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Node 1    │  │   Node 2    │  │   Node 3    │        │
│  │             │  │             │  │             │        │
│  │ • Raft      │  │ • Raft      │  │ • Raft      │        │
│  │ • Storage   │  │ • Storage   │  │ • Storage   │        │
│  │ • Shards    │  │ • Shards    │  │ • Shards    │        │
│  │ • Migration │  │ • Migration │  │ • Migration │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│         │               │               │                 │
│         └───────────────┼───────────────┘                 │
│                         │                                 │
│  ┌─────────────────────────────────────────────────────────┤
│  │              Migration Engine                          │
│  │  • Live data movement                                 │
│  │  • Zero-downtime migration                            │
│  │  • Progress tracking                                  │
│  └─────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────┘
```

### The "Nomad" Feature

The unique selling point of NodeNomad is **live node migration**:

1. **Prepare**: Target node prepares to receive data
2. **Transfer**: Data is transferred in chunks
3. **Verify**: Data integrity is verified
4. **Update Routing**: Traffic is redirected to new node
5. **Cleanup**: Source node cleans up migrated data

## 📚 API Documentation

### Key-Value Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/set` | Store a key-value pair |
| `GET` | `/api/v1/get/:key` | Retrieve a value by key |
| `DELETE` | `/api/v1/delete/:key` | Delete a key-value pair |

### Migration Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/migration/start` | Start a migration |
| `GET` | `/api/v1/migration/status` | Get migration status |
| `GET` | `/api/v1/migration/stats` | Get migration statistics |
| `GET` | `/api/v1/migration/operations` | List all operations |

### Cluster Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/cluster/info` | Get cluster information |
| `GET` | `/api/v1/cluster/metrics` | Get cluster metrics |
| `GET` | `/api/v1/shard/stats` | Get shard statistics |

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Complete test suite
./scripts/test-complete.sh
```

### Demos

```bash
# Migration demo
node examples/migration-demo.js

# Sharding demo
node examples/sharding-demo.js
```

## 🐳 Docker Support

### Single Node

```bash
docker build -t nodenomad .
docker run -p 3000:3000 nodenomad
```

### Multi-Node Cluster

```bash
docker-compose up -d
```

## 📊 Performance

- **Throughput**: 1,000+ operations per second
- **Latency**: < 1ms for local operations
- **Availability**: 99.9% uptime with proper configuration
- **Scalability**: Horizontal scaling with automatic load balancing

## 🔧 Development

### Project Structure

```
NodeNomad/
├── src/
│   ├── core/                 # Core engine implementations
│   │   ├── consensus/        # Raft consensus engine
│   │   ├── storage/          # Storage engine with WAL
│   │   ├── sharding/         # Consistent hashing
│   │   └── migration/        # Migration engine
│   ├── cluster/              # Cluster management
│   ├── api/                  # REST API endpoints
│   ├── monitoring/           # Monitoring dashboard
│   └── utils/                # Utilities and logging
├── tests/                    # Test suite
├── examples/                 # Example scripts
├── docs/                     # Documentation
└── scripts/                  # Utility scripts
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Raft consensus algorithm by Diego Ongaro and John Ousterhout
- Consistent hashing concepts from distributed systems research
- Node.js and TypeScript communities

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/nandanpabolu/NodeNomad/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nandanpabolu/NodeNomad/discussions)
- **Documentation**: [Wiki](https://github.com/nandanpabolu/NodeNomad/wiki)

---

**NodeNomad** - Where distributed systems meet nomadic flexibility! 🚀