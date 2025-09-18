#!/bin/bash

# NodeNomad Complete Demo Script
# Demonstrates the full distributed system with monitoring

echo "🚀 NodeNomad Complete Demo"
echo "=========================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

print_header() {
    echo -e "${PURPLE}🎯 $1${NC}"
    echo "=================================="
}

# Function to start a node
start_node() {
    local node_id=$1
    local port=$2
    local cluster_nodes=$3
    
    print_info "Starting Node: $node_id on port $port"
    
    NODE_ID=$node_id \
    NODE_PORT=$port \
    CLUSTER_NODES=$cluster_nodes \
    npx tsx src/raft-server.ts > "logs/node-${node_id}.log" 2>&1 &
    
    local pid=$!
    echo $pid > "node-${node_id}.pid"
    print_status "Node $node_id started (PID: $pid)"
}

# Function to stop a node
stop_node() {
    local node_id=$1
    local pid_file="node-${node_id}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        print_info "Stopping Node: $node_id (PID: $pid)"
        kill $pid 2>/dev/null
        rm "$pid_file"
        print_status "Node $node_id stopped"
    fi
}

# Function to start monitoring dashboard
start_dashboard() {
    print_info "Starting Monitoring Dashboard..."
    
    DASHBOARD_PORT=8080 \
    CLUSTER_NODES="node-1:3001,node-2:3002,node-3:3003" \
    npx tsx src/monitoring/dashboard.ts > "logs/dashboard.log" 2>&1 &
    
    local pid=$!
    echo $pid > "dashboard.pid"
    print_status "Dashboard started (PID: $pid) - http://localhost:8080"
}

# Function to test cluster operations
test_cluster() {
    print_header "Testing Cluster Operations"
    
    # Wait for nodes to be ready
    print_info "Waiting for nodes to be ready..."
    sleep 5
    
    # Test health checks
    print_info "Health Checks:"
    for port in 3001 3002 3003; do
        local health=$(curl -s http://localhost:$port/health 2>/dev/null)
        if [ $? -eq 0 ]; then
            local node_id=$(echo $health | jq -r '.nodeId' 2>/dev/null)
            local raft_status=$(echo $health | jq -r '.raft.status' 2>/dev/null)
            print_status "Port $port: $node_id ($raft_status)"
        else
            print_error "Port $port: Not responding"
        fi
    done
    
    echo ""
    print_info "Raft Status:"
    for port in 3001 3002 3003; do
        local raft_status=$(curl -s http://localhost:$port/raft/status 2>/dev/null)
        if [ $? -eq 0 ]; then
            local status=$(echo $raft_status | jq -r '.data.status' 2>/dev/null)
            local term=$(echo $raft_status | jq -r '.data.term' 2>/dev/null)
            print_status "Port $port: $status (Term: $term)"
        else
            print_error "Port $port: Not responding"
        fi
    done
    
    echo ""
    print_info "Key-Value Operations:"
    
    # Find the leader
    local leader_port=""
    for port in 3001 3002 3003; do
        local raft_status=$(curl -s http://localhost:$port/raft/status 2>/dev/null)
        if [ $? -eq 0 ]; then
            local status=$(echo $raft_status | jq -r '.data.status' 2>/dev/null)
            if [ "$status" = "leader" ]; then
                leader_port=$port
                break
            fi
        fi
    done
    
    if [ -n "$leader_port" ]; then
        print_status "Leader found on port $leader_port"
        
        # Set a key-value pair
        print_info "Setting key-value pair..."
        local set_result=$(curl -s -X POST http://localhost:$leader_port/api/v1/set \
            -H "Content-Type: application/json" \
            -d '{"key": "demo-key", "value": "distributed-consensus"}' 2>/dev/null)
        
        if echo $set_result | jq -e '.success' > /dev/null 2>&1; then
            print_status "Key-value pair set successfully"
        else
            print_error "Failed to set key-value pair"
        fi
        
        # Get the value
        print_info "Getting value..."
        local get_result=$(curl -s http://localhost:$leader_port/api/v1/get/demo-key 2>/dev/null)
        
        if echo $get_result | jq -e '.success' > /dev/null 2>&1; then
            local value=$(echo $get_result | jq -r '.data.value' 2>/dev/null)
            print_status "Value retrieved: $value"
        else
            print_error "Failed to get value"
        fi
        
        # Test from follower
        local follower_port=""
        for port in 3001 3002 3003; do
            if [ "$port" != "$leader_port" ]; then
                local raft_status=$(curl -s http://localhost:$port/raft/status 2>/dev/null)
                if [ $? -eq 0 ]; then
                    local status=$(echo $raft_status | jq -r '.data.status' 2>/dev/null)
                    if [ "$status" = "follower" ]; then
                        follower_port=$port
                        break
                    fi
                fi
            fi
        done
        
        if [ -n "$follower_port" ]; then
            print_info "Reading from follower on port $follower_port..."
            local follower_result=$(curl -s http://localhost:$follower_port/api/v1/get/demo-key 2>/dev/null)
            
            if echo $follower_result | jq -e '.success' > /dev/null 2>&1; then
                local value=$(echo $follower_result | jq -r '.data.value' 2>/dev/null)
                print_status "Follower read successful: $value"
            else
                print_warning "Follower read failed (expected in single-node mode)"
            fi
        fi
        
    else
        print_error "No leader found!"
    fi
}

# Function to simulate node failure
simulate_failure() {
    print_header "Simulating Node Failure"
    
    # Stop a random node
    local nodes=("node-1" "node-2" "node-3")
    local random_node=${nodes[$RANDOM % ${#nodes[@]}]}
    
    print_warning "Stopping $random_node..."
    stop_node $random_node
    
    sleep 3
    
    print_info "Cluster status after failure:"
    test_cluster
}

# Function to restart failed node
restart_node() {
    local node_id=$1
    local port=$2
    local cluster_nodes=$3
    
    print_info "Restarting $node_id..."
    start_node $node_id $port $cluster_nodes
    sleep 3
}

# Function to show monitoring info
show_monitoring() {
    print_header "Monitoring Information"
    
    print_info "Dashboard: http://localhost:8080"
    print_info "Cluster API endpoints:"
    print_info "  - Health: http://localhost:3001/health"
    print_info "  - Raft Status: http://localhost:3001/raft/status"
    print_info "  - Cluster Info: http://localhost:3001/cluster/info"
    
    echo ""
    print_info "Key-Value API endpoints:"
    print_info "  - Set: POST http://localhost:3001/api/v1/set"
    print_info "  - Get: GET http://localhost:3001/api/v1/get/:key"
    print_info "  - Delete: DELETE http://localhost:3001/api/v1/delete/:key"
    print_info "  - Keys: GET http://localhost:3001/api/v1/keys"
}

# Main demo function
main() {
    print_header "NodeNomad Distributed Systems Demo"
    
    # Clean up any existing processes
    print_info "Cleaning up existing processes..."
    pkill -f "tsx src/raft-server.ts" 2>/dev/null || true
    pkill -f "tsx src/monitoring/dashboard.ts" 2>/dev/null || true
    sleep 2
    
    # Create logs directory
    mkdir -p logs
    
    # Start 3 nodes
    print_header "Starting 3-Node Raft Cluster"
    
    local cluster_nodes="node-1:3001,node-2:3002,node-3:3003"
    
    start_node "node-1" 3001 "$cluster_nodes"
    sleep 2
    
    start_node "node-2" 3002 "$cluster_nodes"
    sleep 2
    
    start_node "node-3" 3003 "$cluster_nodes"
    sleep 3
    
    # Start monitoring dashboard
    start_dashboard
    sleep 2
    
    # Test cluster
    test_cluster
    
    # Show monitoring info
    show_monitoring
    
    # Simulate failure
    simulate_failure
    
    # Restart failed node
    print_header "Restarting Failed Node"
    restart_node "node-1" 3001 "$cluster_nodes"
    
    # Test again
    test_cluster
    
    echo ""
    print_status "Demo completed successfully!"
    print_info "The cluster is now running with monitoring."
    print_info "Press Ctrl+C to stop all services."
    
    # Keep running until interrupted
    while true; do
        sleep 10
        print_info "Cluster still running... (Press Ctrl+C to stop)"
    done
}

# Cleanup function
cleanup() {
    echo ""
    print_header "Cleaning up..."
    stop_node "node-1"
    stop_node "node-2" 
    stop_node "node-3"
    
    if [ -f "dashboard.pid" ]; then
        local pid=$(cat "dashboard.pid")
        print_info "Stopping dashboard (PID: $pid)"
        kill $pid 2>/dev/null
        rm "dashboard.pid"
    fi
    
    pkill -f "tsx src/raft-server.ts" 2>/dev/null || true
    pkill -f "tsx src/monitoring/dashboard.ts" 2>/dev/null || true
    
    print_status "Cleanup completed"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    print_error "jq is required but not installed. Please install jq first."
    print_info "On macOS: brew install jq"
    print_info "On Ubuntu: sudo apt-get install jq"
    exit 1
fi

# Check if tsx is available
if ! command -v npx &> /dev/null; then
    print_error "npx is required but not installed. Please install Node.js first."
    exit 1
fi

# Run the demo
main
