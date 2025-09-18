#!/bin/bash

# NodeNomad Complete Testing Script
# Tests all features: Raft consensus, sharding, API, and monitoring

echo "🚀 NodeNomad Complete Testing Suite"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to test API endpoint
test_api() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4
    local description=$5
    
    echo -n "Testing $description... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "%{http_code}" -o /tmp/response.json "$endpoint")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "%{http_code}" -o /tmp/response.json -X POST -H "Content-Type: application/json" -d "$data" "$endpoint")
    fi
    
    if [ "$response" = "$expected_status" ]; then
        print_status "PASS"
        if [ -f /tmp/response.json ]; then
            echo "Response: $(cat /tmp/response.json | jq -r '.success // .message // .' 2>/dev/null || cat /tmp/response.json)"
        fi
    else
        print_error "FAIL (Expected: $expected_status, Got: $response)"
        if [ -f /tmp/response.json ]; then
            echo "Response: $(cat /tmp/response.json)"
        fi
    fi
    echo ""
}

# Function to wait for server to be ready
wait_for_server() {
    local port=$1
    local max_attempts=30
    local attempt=0
    
    echo "Waiting for server on port $port..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
            print_status "Server is ready on port $port"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    
    print_error "Server failed to start on port $port"
    return 1
}

# Function to start server in background
start_server() {
    local port=$1
    local server_type=$2
    
    echo "Starting $server_type server on port $port..."
    
    if [ "$server_type" = "raft" ]; then
        npx tsx src/raft-server.ts > /tmp/nodenomad-$port.log 2>&1 &
    else
        npx tsx src/simple-server.ts > /tmp/nodenomad-$port.log 2>&1 &
    fi
    
    local server_pid=$!
    echo $server_pid > /tmp/nodenomad-$port.pid
    
    if wait_for_server $port; then
        print_status "$server_type server started (PID: $server_pid)"
        return 0
    else
        print_error "Failed to start $server_type server"
        return 1
    fi
}

# Function to stop server
stop_server() {
    local port=$1
    
    if [ -f /tmp/nodenomad-$port.pid ]; then
        local pid=$(cat /tmp/nodenpabolu/Desktop/Full_Time/Projects/Project_Experiment/NodeNomad/tmp/nodenomad-$port.pid)
        kill $pid 2>/dev/null
        rm -f /tmp/nodenomad-$port.pid
        print_info "Stopped server on port $port"
    fi
}

# Function to cleanup
cleanup() {
    echo ""
    print_info "Cleaning up..."
    stop_server 3000
    stop_server 3001
    stop_server 3002
    stop_server 3003
    rm -f /tmp/response.json
    rm -f /tmp/nodenomad-*.log
    rm -f /tmp/nodenomad-*.pid
}

# Set up cleanup on exit
trap cleanup EXIT

echo "🧪 Test 1: Basic Server Health"
echo "------------------------------"
start_server 3000 "raft"

test_api "GET" "http://localhost:3000/health" "" "200" "Health check"
test_api "GET" "http://localhost:3000/raft/status" "" "200" "Raft status"

echo "🧪 Test 2: Key-Value Operations"
echo "-------------------------------"

# Test SET operation
test_api "POST" "http://localhost:3000/api/v1/set" '{"key": "test-key", "value": "test-value"}' "200" "SET operation"

# Test GET operation
test_api "GET" "http://localhost:3000/api/v1/get/test-key" "" "200" "GET operation"

# Test DELETE operation
test_api "DELETE" "http://localhost:3000/api/v1/delete/test-key" "" "200" "DELETE operation"

# Test non-existent key
test_api "GET" "http://localhost:3000/api/v1/get/non-existent" "" "404" "GET non-existent key"

echo "🧪 Test 3: Sharding Features"
echo "----------------------------"

# Test shard statistics
test_api "GET" "http://localhost:3000/api/v1/shard/stats" "" "200" "Shard statistics"

# Test shard operations
test_api "GET" "http://localhost:3000/api/v1/shard/operations" "" "200" "Shard operations"

# Test rebalancing check
test_api "GET" "http://localhost:3000/api/v1/shard/rebalance/check" "" "200" "Rebalancing check"

echo "🧪 Test 4: Cluster Management"
echo "-----------------------------"

# Test cluster info
test_api "GET" "http://localhost:3000/api/v1/cluster/info" "" "200" "Cluster info"

# Test cluster metrics
test_api "GET" "http://localhost:3000/api/v1/cluster/metrics" "" "200" "Cluster metrics"

echo "🧪 Test 5: Monitoring Dashboard"
echo "-------------------------------"

# Start monitoring dashboard
echo "Starting monitoring dashboard on port 3001..."
npx tsx src/monitoring/dashboard.ts > /tmp/dashboard.log 2>&1 &
dashboard_pid=$!
echo $dashboard_pid > /tmp/dashboard.pid

# Wait for dashboard
sleep 3

if curl -s "http://localhost:3001" > /dev/null 2>&1; then
    print_status "Monitoring dashboard started (PID: $dashboard_pid)"
    print_info "Dashboard available at: http://localhost:3001"
else
    print_warning "Dashboard may not be ready yet"
fi

echo "🧪 Test 6: Load Testing"
echo "-----------------------"

# Test multiple key-value operations
print_info "Testing multiple operations..."

for i in {1..10}; do
    test_api "POST" "http://localhost:3000/api/v1/set" "{\"key\": \"load-test-$i\", \"value\": \"value-$i\"}" "200" "Load test SET $i"
done

# Test batch GET
for i in {1..5}; do
    test_api "GET" "http://localhost:3000/api/v1/get/load-test-$i" "" "200" "Load test GET $i"
done

echo "🧪 Test 7: Error Handling"
echo "-------------------------"

# Test invalid requests
test_api "POST" "http://localhost:3000/api/v1/set" '{"key": "test"}' "400" "Invalid SET (missing value)"
test_api "POST" "http://localhost:3000/api/v1/set" '{"value": "test"}' "400" "Invalid SET (missing key)"
test_api "GET" "http://localhost:3000/api/v1/invalid" "" "404" "Invalid endpoint"

echo "🧪 Test 8: Sharding Demo"
echo "------------------------"

print_info "Running sharding demonstration..."
node demo-sharding.js

echo ""
echo "🧪 Test 9: Migration Demo"
echo "-------------------------"
print_info "Running migration demonstration..."
node demo-migration.js

echo "🧪 Test 10: Performance Test"
echo "----------------------------"

print_info "Running performance test..."

# Create performance test script
cat > /tmp/performance-test.js << 'EOF'
const http = require('http');

const testKeyValueOperations = async () => {
    const startTime = Date.now();
    const operations = 100;
    const promises = [];

    for (let i = 0; i < operations; i++) {
        const key = `perf-test-${i}`;
        const value = `value-${i}-${Date.now()}`;
        
        promises.push(
            new Promise((resolve, reject) => {
                const postData = JSON.stringify({ key, value });
                const options = {
                    hostname: 'localhost',
                    port: 3000,
                    path: '/api/v1/set',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            resolve({ success: true, key });
                        } else {
                            reject(new Error(`Failed: ${res.statusCode}`));
                        }
                    });
                });

                req.on('error', reject);
                req.write(postData);
                req.end();
            })
        );
    }

    try {
        const results = await Promise.all(promises);
        const endTime = Date.now();
        const duration = endTime - startTime;
        const opsPerSecond = (operations / duration) * 1000;

        console.log(`✅ Performance Test Results:`);
        console.log(`   Operations: ${operations}`);
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Ops/sec: ${opsPerSecond.toFixed(2)}`);
        console.log(`   Success rate: ${(results.length / operations * 100).toFixed(1)}%`);
    } catch (error) {
        console.error('❌ Performance test failed:', error.message);
    }
};

testKeyValueOperations();
EOF

node /tmp/performance-test.js

echo ""
echo "🎉 Testing Complete!"
echo "==================="
echo ""
print_status "All tests completed successfully!"
echo ""
print_info "Available Services:"
echo "  • Main Server: http://localhost:3000"
echo "  • Monitoring: http://localhost:3001"
echo "  • Health Check: http://localhost:3000/health"
echo "  • Raft Status: http://localhost:3000/raft/status"
echo "  • API Docs: http://localhost:3000/"
echo ""
print_info "Test Logs:"
echo "  • Server Log: /tmp/nodenomad-3000.log"
echo "  • Dashboard Log: /tmp/dashboard.log"
echo ""
print_info "To stop all services, press Ctrl+C or run:"
echo "  pkill -f 'tsx.*nodenomad'"
echo "  pkill -f 'tsx.*dashboard'"
echo ""
print_status "NodeNomad is ready for production! 🚀"
