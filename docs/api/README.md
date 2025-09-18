# 📚 NodeNomad API Documentation

## Base URL

```
http://localhost:3000/api/v1
```

## Authentication

Currently, NodeNomad does not require authentication. In production deployments, consider implementing proper authentication and authorization.

## Response Format

All API responses follow this format:

```json
{
  "success": true|false,
  "data": <response_data>,
  "error": "<error_message>",
  "timestamp": <unix_timestamp>
}
```

## Key-Value Operations

### Store Data

**POST** `/api/v1/set`

Store a key-value pair with optional TTL.

**Request Body:**
```json
{
  "key": "string",
  "value": "any",
  "ttl": "number (optional, seconds)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "user:123",
    "value": "John Doe",
    "ttl": 3600
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/set \
  -H "Content-Type: application/json" \
  -d '{"key": "user:123", "value": "John Doe", "ttl": 3600}'
```

### Retrieve Data

**GET** `/api/v1/get/:key`

Retrieve a value by key.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "user:123",
    "value": "John Doe",
    "ttl": 3600,
    "expiresAt": 1640998800000
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/get/user:123
```

### Delete Data

**DELETE** `/api/v1/delete/:key`

Delete a key-value pair.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "user:123",
    "deleted": true
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/v1/delete/user:123
```

## Migration Operations

### Start Migration

**POST** `/api/v1/migration/start`

Start a migration of a shard to another node.

**Request Body:**
```json
{
  "shardId": "string",
  "targetNodeId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "migrationId": "migration-1640995200000",
    "operationIds": ["op-1640995200000-abc123"],
    "shardId": "shard-0",
    "targetNodeId": "node-2",
    "status": "started"
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/migration/start \
  -H "Content-Type: application/json" \
  -d '{"shardId": "shard-0", "targetNodeId": "node-2"}'
```

### Get Migration Status

**GET** `/api/v1/migration/status`

Get overall migration status.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ready|active",
    "activeMigrations": 0,
    "totalMigrations": 5,
    "completed": 4,
    "failed": 1,
    "successRate": 80.0
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/migration/status
```

### Get Migration Operations

**GET** `/api/v1/migration/operations`

List all migration operations with optional status filter.

**Query Parameters:**
- `status` (optional): Filter by status (`pending`, `preparing`, `transferring`, `verifying`, `updating_routing`, `cleaning_up`, `completed`, `failed`, `cancelled`)

**Response:**
```json
{
  "success": true,
  "data": {
    "operations": [
      {
        "id": "op-1640995200000-abc123",
        "shardId": "shard-0",
        "sourceNodeId": "node-1",
        "targetNodeId": "node-2",
        "status": "completed",
        "progress": 100,
        "startTime": 1640995200000,
        "endTime": 1640995205000,
        "dataTransferred": 1048576,
        "totalDataSize": 1048576
      }
    ],
    "total": 1
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/migration/operations?status=completed
```

### Get Migration Statistics

**GET** `/api/v1/migration/stats`

Get migration statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOperations": 10,
    "completed": 8,
    "failed": 1,
    "inProgress": 1,
    "totalDataTransferred": 10485760,
    "averageDuration": 5000,
    "successRate": 80.0
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/migration/stats
```

### Cancel Migration Operation

**POST** `/api/v1/migration/operations/:id/cancel`

Cancel a migration operation.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "op-1640995200000-abc123",
    "status": "cancelled"
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/migration/operations/op-1640995200000-abc123/cancel
```

## Cluster Management

### Get Cluster Information

**GET** `/api/v1/cluster/info`

Get cluster information including nodes and shards.

**Response:**
```json
{
  "success": true,
  "data": {
    "nodes": [
      {
        "id": "node-1",
        "address": "0.0.0.0",
        "port": 3000,
        "status": "leader",
        "lastSeen": 1640995200000,
        "metadata": {
          "version": "1.0.0",
          "capabilities": ["storage", "consensus", "migration"],
          "load": 0.5,
          "shards": ["shard-0", "shard-1"]
        }
      }
    ],
    "leader": "node-1",
    "shards": [
      {
        "id": "shard-0",
        "startHash": "00000000",
        "endHash": "3fffffff",
        "nodeId": "node-1",
        "keyCount": 1000,
        "size": 1048576,
        "lastUpdated": 1640995200000
      }
    ],
    "migrations": [],
    "metrics": {
      "totalNodes": 3,
      "activeNodes": 3,
      "totalShards": 100,
      "activeShards": 100,
      "totalKeys": 10000,
      "averageLoad": 0.33,
      "uptime": 3600
    }
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/cluster/info
```

### Get Cluster Metrics

**GET** `/api/v1/cluster/metrics`

Get cluster performance metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "performance": {
      "opsPerSecond": 1000,
      "averageLatency": 1.5,
      "p95Latency": 5.0,
      "p99Latency": 10.0
    },
    "storage": {
      "totalSize": 1073741824,
      "usedSize": 536870912,
      "walSize": 10485760
    },
    "network": {
      "bytesIn": 10485760,
      "bytesOut": 10485760,
      "connections": 10
    }
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/cluster/metrics
```

## Shard Management

### Get Shard Statistics

**GET** `/api/v1/shard/stats`

Get shard distribution and statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalShards": 100,
      "totalNodes": 3,
      "shardsPerNode": 33.33,
      "averageLoad": 0.33,
      "rebalancingNeeded": false
    },
    "distribution": {
      "node-1": 33,
      "node-2": 33,
      "node-3": 34
    }
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/shard/stats
```

### Get Node Shards

**GET** `/api/v1/shard/node/:nodeId`

Get shards assigned to a specific node.

**Response:**
```json
{
  "success": true,
  "data": {
    "nodeId": "node-1",
    "shards": [
      {
        "id": "shard-0",
        "startHash": "00000000",
        "endHash": "3fffffff",
        "keyCount": 1000,
        "size": 1048576,
        "lastUpdated": 1640995200000
      }
    ]
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/shard/node/node-1
```

### Get Shard for Key

**GET** `/api/v1/shard/key/:key`

Get the shard responsible for a specific key.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "user:123",
    "shard": {
      "id": "shard-0",
      "startHash": "00000000",
      "endHash": "3fffffff",
      "nodeId": "node-1",
      "keyCount": 1000,
      "size": 1048576
    }
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/api/v1/shard/key/user:123
```

## Health and Monitoring

### Health Check

**GET** `/health`

Get server health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1640995200000,
  "nodeId": "node-1",
  "uptime": 3600,
  "memory": {
    "rss": 104857600,
    "heapTotal": 33554432,
    "heapUsed": 16777216,
    "external": 1048576,
    "arrayBuffers": 65536
  },
  "raft": {
    "status": "leader",
    "term": 1,
    "leaderId": "node-1",
    "logLength": 1000
  }
}
```

**Example:**
```bash
curl http://localhost:3000/health
```

### Raft Status

**GET** `/raft/status`

Get Raft consensus status.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "leader",
    "term": 1,
    "leaderId": "node-1",
    "logLength": 1000,
    "commitIndex": 999,
    "lastApplied": 999
  },
  "timestamp": 1640995200000
}
```

**Example:**
```bash
curl http://localhost:3000/raft/status
```

## Error Handling

### Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": 1640995200000
}
```

### Common Error Codes

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| 400 | Bad Request | Invalid request parameters |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Example Error Response

```json
{
  "success": false,
  "error": "Key not found",
  "message": "The requested key 'nonexistent' was not found",
  "timestamp": 1640995200000
}
```

## Rate Limiting

Currently, NodeNomad does not implement rate limiting. In production deployments, consider implementing rate limiting to prevent abuse.

## CORS

NodeNomad supports CORS for cross-origin requests. The default configuration allows all origins.

## WebSocket Support

NodeNomad does not currently support WebSocket connections. All communication is via HTTP REST API.

## SDKs and Client Libraries

Currently, NodeNomad does not provide official SDKs. You can use any HTTP client library to interact with the API:

- **JavaScript/Node.js**: `fetch`, `axios`, `node-fetch`
- **Python**: `requests`, `httpx`
- **Go**: `net/http`
- **Java**: `OkHttp`, `Apache HttpClient`
- **C#**: `HttpClient`

## Examples

### Complete Example: Store, Retrieve, and Delete

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

### Complete Example: Migration

```bash
# Start migration
curl -X POST http://localhost:3000/api/v1/migration/start \
  -H "Content-Type: application/json" \
  -d '{"shardId": "shard-0", "targetNodeId": "node-2"}'

# Check migration status
curl http://localhost:3000/api/v1/migration/status

# Get migration operations
curl http://localhost:3000/api/v1/migration/operations

# Get migration statistics
curl http://localhost:3000/api/v1/migration/stats
```

## Changelog

### Version 1.0.0

- Initial release
- Basic key-value operations
- Raft consensus
- Consistent hashing
- Live migration
- Monitoring dashboard
