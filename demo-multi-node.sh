#!/bin/bash

# NodeNomad Multi-Node Demo Script
# Demonstrates Raft consensus across multiple nodes

echo "🚀 Starting NodeNomad Multi-Node Demo"
echo "======================================"

# Function to start a node
start_node() {
    local node_id=$1
    local port=$2
    local cluster_nodes=$3
    
    echo "📍 Starting Node: $node_id on port $port"
    
    NODE_ID=$node_id \
    NODE_PORT=$port \
    CLUSTER_NODES=$cluster_nodes \
    npx tsx src/raft-server.ts &
    
    local pid=$!
    echo $pid > "node-${node_id}.pid"
    echo "✅ Node $node_id started (PID: $pid)"
}

# Function to stop a node
stop_node() {
    local node_id=$1
    local pid_file="node-${node_id}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        echo "🛑 Stopping Node: $node_id (PID: $pid)"
        kill $pid 2>/dev/null
        rm "$pid_file"
        echo "✅ Node $node_id stopped"
    fi
}

# Function to test cluster operations
test_cluster() {
    echo ""
    echo "🧪 Testing Cluster Operations"
    echo "============================="
    
    # Test health checks
    echo "📊 Health Checks:"
    curl -s http://localhost:3001/health | jq '.raft.status, .nodeId' 2>/dev/null || echo "Node 1: Not responding"
    curl -s http://localhost:3002/health | jq '.raft.status, .nodeId' 2>/dev/null || echo "Node 2: Not responding"
    curl -s http://localhost:3003/health | jq '.raft.status, .nodeId' 2>/dev/null || echo "Node 3: Not responding"
    
    echo ""
    echo "🏛️ Raft Status:"
    curl -s http://localhost:3001/raft/status | jq '.data' 2>/dev/null || echo "Node 1: Not responding"
    curl -s http://localhost:3002/raft/status | jq '.data' 2>/dev/null || echo "Node 2: Not responding"
    curl -s http://localhost:3003/raft/status | jq '.data' 2>/dev/null || echo "Node 3: Not responding"
    
    echo ""
    echo "🔑 Key-Value Operations:"
    
    # Find the leader
    local leader_port=""
    for port in 3001 3002 3003; do
        local status=$(curl -s http://localhost:$port/raft/status | jq -r '.data.status' 2>/dev/null)
        if [ "$status" = "leader" ]; then
            leader_port=$port
            break
        fi
    done
    
    if [ -n "$leader_port" ]; then
        echo "🎯 Leader found on port $leader_port"
        
        # Set a key-value pair
        echo "📝 Setting key-value pair..."
        curl -s -X POST http://localhost:$leader_port/api/v1/set \
            -H "Content-Type: application/json" \
            -d '{"key": "demo-key", "value": "distributed-consensus"}' | jq '.success, .data'
        
        # Get the value
        echo "📖 Getting value..."
        curl -s http://localhost:$leader_port/api/v1/get/demo-key | jq '.success, .data'
        
        # Test from follower
        local follower_port=""
        for port in 3001 3002 3003; do
            if [ "$port" != "$leader_port" ]; then
                local status=$(curl -s http://localhost:$port/raft/status | jq -r '.data.status' 2>/dev/null)
                if [ "$status" = "follower" ]; then
                    follower_port=$port
                    break
                fi
            fi
        done
        
        if [ -n "$follower_port" ]; then
            echo "📖 Reading from follower on port $follower_port..."
            curl -s http://localhost:$follower_port/api/v1/get/demo-key | jq '.success, .data'
        fi
        
    else
        echo "❌ No leader found!"
    fi
}

# Function to simulate node failure
simulate_failure() {
    echo ""
    echo "💥 Simulating Node Failure"
    echo "=========================="
    
    # Stop a random node
    local nodes=("node-1" "node-2" "node-3")
    local random_node=${nodes[$RANDOM % ${#nodes[@]}]}
    
    echo "🛑 Stopping $random_node..."
    stop_node $random_node
    
    sleep 2
    
    echo "📊 Cluster status after failure:"
    test_cluster
}

# Function to restart failed node
restart_node() {
    local node_id=$1
    local port=$2
    local cluster_nodes=$3
    
    echo "🔄 Restarting $node_id..."
    start_node $node_id $port $cluster_nodes
    sleep 3
}

# Main demo
main() {
    # Clean up any existing processes
    echo "🧹 Cleaning up existing processes..."
    pkill -f "tsx src/raft-server.ts" 2>/dev/null || true
    sleep 2
    
    # Start 3 nodes
    echo ""
    echo "🚀 Starting 3-Node Cluster"
    echo "=========================="
    
    local cluster_nodes="node-1:3001,node-2:3002,node-3:3003"
    
    start_node "node-1" 3001 "$cluster_nodes"
    sleep 2
    
    start_node "node-2" 3002 "$cluster_nodes"
    sleep 2
    
    start_node "node-3" 3003 "$cluster_nodes"
    sleep 3
    
    # Test cluster
    test_cluster
    
    # Simulate failure
    simulate_failure
    
    # Restart failed node
    echo ""
    echo "🔄 Restarting Failed Node"
    echo "========================="
    restart_node "node-1" 3001 "$cluster_nodes"
    
    # Test again
    test_cluster
    
    echo ""
    echo "✅ Demo completed!"
    echo "Press Ctrl+C to stop all nodes"
    
    # Keep running until interrupted
    while true; do
        sleep 10
        echo "⏰ Cluster still running... (Press Ctrl+C to stop)"
    done
}

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    stop_node "node-1"
    stop_node "node-2" 
    stop_node "node-3"
    pkill -f "tsx src/raft-server.ts" 2>/dev/null || true
    echo "✅ Cleanup completed"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed. Please install jq first."
    echo "   On macOS: brew install jq"
    echo "   On Ubuntu: sudo apt-get install jq"
    exit 1
fi

# Run the demo
main
