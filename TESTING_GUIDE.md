# NodeNomad Testing Guide

## 🚀 Quick Start Testing

### 1. Start the Server
```bash
# Start the Raft server
npx tsx src/raft-server.ts

# In another terminal, start monitoring dashboard
npx tsx src/monitoring/dashboard.ts
```

### 2. Test Basic Functionality

#### Health Check
```bash
curl http://localhost:3000/health
```

#### Raft Status
```bash
curl http://localhost:3000/raft/status
```

#### Key-Value Operations
```bash
# Set a key
curl -X POST http://localhost:3000/api/v1/set \
  -H "Content-Type: application/json" \
  -d '{"key": "test-key", "value": "test-value"}'

# Get a key
curl http://localhost:3000/api/v1/get/test-key

# Delete a key
curl -X DELETE http://localhost:3000/api/v1/delete/test-key
```

### 3. Test Sharding Features

#### Shard Statistics
```bash
curl http://localhost:3000/api/v1/shard/stats
```

#### Shard Operations
```bash
curl http://localhost:3000/api/v1/shard/operations
```

#### Check Rebalancing
```bash
curl http://localhost:3000/api/v1/shard/rebalance/check
```

### 4. Test Cluster Management

#### Cluster Info
```bash
curl http://localhost:3000/api/v1/cluster/info
```

#### Cluster Metrics
```bash
curl http://localhost:3000/api/v1/cluster/metrics
```

## 🧪 Automated Testing

### Run Complete Test Suite
```bash
./test-complete.sh
```

### Run Sharding Demo
```bash
node demo-sharding.js
```

### Run Basic Tests
```bash
node tests/simple.test.js
```

## 📊 Monitoring

### Web Dashboard
- **URL**: http://localhost:3001
- **Features**: Real-time cluster health, metrics, and shard distribution

### API Endpoints
- **Health**: http://localhost:3000/health
- **Raft Status**: http://localhost:3000/raft/status
- **API Docs**: http://localhost:3000/

## 🔧 Manual Testing Scenarios

### Scenario 1: Basic Key-Value Store
1. Start server: `npx tsx src/raft-server.ts`
2. Set multiple keys with different values
3. Retrieve keys and verify values
4. Delete some keys and verify they're gone
5. Check cluster metrics

### Scenario 2: Raft Consensus
1. Start server and wait for leader election
2. Check raft status - should show "leader"
3. Set some keys (only leader can accept writes)
4. Check log entries in raft status

### Scenario 3: Sharding
1. Run sharding demo: `node demo-sharding.js`
2. Check shard statistics via API
3. Test key distribution across shards
4. Simulate node addition/removal

### Scenario 4: Load Testing
1. Use the performance test in `test-complete.sh`
2. Monitor server logs for performance
3. Check memory usage and response times

## 🐛 Troubleshooting

### Server Won't Start
- Check if port 3000 is already in use: `lsof -i :3000`
- Kill existing processes: `pkill -f tsx`
- Check logs in `/tmp/nodenomad-*.log`

### API Errors
- Verify server is running: `curl http://localhost:3000/health`
- Check request format (JSON content-type)
- Look at server logs for detailed error messages

### Sharding Issues
- Ensure shard manager is initialized
- Check node configuration
- Verify consistent hashing is working

## 📈 Performance Testing

### Load Test Script
```bash
# Test 100 operations
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/v1/set \
    -H "Content-Type: application/json" \
    -d "{\"key\": \"load-$i\", \"value\": \"value-$i\"}" &
done
wait
```

### Memory Usage
```bash
# Monitor memory usage
ps aux | grep tsx
```

### Response Time Testing
```bash
# Test response times
time curl http://localhost:3000/health
```

## 🎯 Expected Results

### Successful Tests Should Show:
- ✅ Server starts and becomes Raft leader
- ✅ Key-value operations work correctly
- ✅ Sharding distributes keys across nodes
- ✅ Monitoring dashboard shows cluster health
- ✅ API returns proper JSON responses
- ✅ Error handling works for invalid requests

### Performance Benchmarks:
- **Startup Time**: < 2 seconds
- **Key-Value Ops**: > 100 ops/sec
- **Memory Usage**: < 100MB
- **Response Time**: < 100ms average

## 🚀 Production Readiness

NodeNomad is ready for production when:
- ✅ All tests pass
- ✅ Performance meets requirements
- ✅ Error handling is robust
- ✅ Monitoring is comprehensive
- ✅ Documentation is complete

## 📝 Test Results

After running tests, you should see:
- **Health Check**: 200 OK
- **Raft Status**: Leader elected
- **Key-Value Ops**: All successful
- **Sharding**: Keys distributed correctly
- **Monitoring**: Dashboard accessible
- **Performance**: Meets benchmarks

---

**Happy Testing! 🎉**
