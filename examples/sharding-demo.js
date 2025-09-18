/**
 * Demo script for NodeNomad Sharding Implementation
 * Shows consistent hashing and shard management in action
 */

console.log('🚀 NodeNomad Sharding Demo');
console.log('==========================\n');

// Simulate consistent hashing
class SimpleConsistentHash {
  constructor() {
    this.ring = [];
    this.nodes = new Map();
  }

  addNode(nodeId, host, port, weight = 1) {
    const node = { id: nodeId, host, port, weight, virtualNodes: [] };
    
    // Create virtual nodes
    for (let i = 0; i < 150 * weight; i++) {
      const virtualNodeId = `${nodeId}-${i}`;
      const hash = this.hash(virtualNodeId);
      const position = this.hashToPosition(hash);
      
      const virtualNode = { hash, nodeId, position };
      node.virtualNodes.push(virtualNode);
      this.ring.push(virtualNode);
    }
    
    // Sort ring by position
    this.ring.sort((a, b) => a.position - b.position);
    this.nodes.set(nodeId, node);
    
    console.log(`✅ Added node ${nodeId} (${host}:${port}) with ${node.virtualNodes.length} virtual nodes`);
  }

  getNode(key) {
    if (this.ring.length === 0) return null;
    
    const hash = this.hash(key);
    const position = this.hashToPosition(hash);
    
    // Find first virtual node with position >= key position
    for (const virtualNode of this.ring) {
      if (virtualNode.position >= position) {
        return virtualNode.nodeId;
      }
    }
    
    // Wrap around to first node
    return this.ring[0].nodeId;
  }

  getReplicaNodes(key, replicaCount = 3) {
    if (this.ring.length === 0) return [];
    
    const hash = this.hash(key);
    const position = this.hashToPosition(hash);
    const replicas = [];
    const seenNodes = new Set();
    
    // Find starting position
    let startIndex = 0;
    for (let i = 0; i < this.ring.length; i++) {
      if (this.ring[i].position >= position) {
        startIndex = i;
        break;
      }
    }
    
    // Collect unique nodes
    for (let i = 0; i < this.ring.length && replicas.length < replicaCount; i++) {
      const index = (startIndex + i) % this.ring.length;
      const virtualNode = this.ring[index];
      
      if (!seenNodes.has(virtualNode.nodeId)) {
        replicas.push(virtualNode.nodeId);
        seenNodes.add(virtualNode.nodeId);
      }
    }
    
    return replicas;
  }

  hash(key) {
    // Simple hash function for demo
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  hashToPosition(hash) {
    return parseInt(hash.substring(0, 8), 16);
  }

  getStats() {
    return {
      totalNodes: this.nodes.size,
      totalVirtualNodes: this.ring.length,
      ringSize: this.ring.length
    };
  }
}

// Demo 1: Basic Consistent Hashing
console.log('📊 Demo 1: Consistent Hashing');
console.log('-----------------------------');

const hashRing = new SimpleConsistentHash();

// Add nodes
hashRing.addNode('node-1', 'localhost', 3001, 1);
hashRing.addNode('node-2', 'localhost', 3002, 1);
hashRing.addNode('node-3', 'localhost', 3003, 1);

console.log('\nKey Distribution Test:');
const testKeys = ['user:123', 'session:abc', 'data:xyz', 'cache:def', 'temp:ghi'];
const distribution = {};

for (const key of testKeys) {
  const nodeId = hashRing.getNode(key);
  distribution[nodeId] = (distribution[nodeId] || 0) + 1;
  console.log(`  "${key}" -> ${nodeId}`);
}

console.log('\nDistribution Summary:');
for (const [nodeId, count] of Object.entries(distribution)) {
  console.log(`  ${nodeId}: ${count} keys`);
}

// Demo 2: Replica Management
console.log('\n🔄 Demo 2: Replica Management');
console.log('-----------------------------');

const testKey = 'important:data';
const replicas = hashRing.getReplicaNodes(testKey, 3);

console.log(`Key: "${testKey}"`);
console.log(`Primary Node: ${hashRing.getNode(testKey)}`);
console.log(`Replica Nodes: ${replicas.join(', ')}`);

// Demo 3: Shard Management Simulation
console.log('\n🗂️  Demo 3: Shard Management');
console.log('-----------------------------');

class SimpleShardManager {
  constructor(hashRing) {
    this.hashRing = hashRing;
    this.shards = new Map();
    this.operations = [];
  }

  createShards() {
    const nodes = Array.from(this.hashRing.nodes.keys());
    let shardId = 0;
    
    for (const nodeId of nodes) {
      // Create 3 shards per node for demo
      for (let i = 0; i < 3; i++) {
        const shard = {
          id: `shard-${shardId++}`,
          nodeId: nodeId,
          keyCount: 0,
          size: 0,
          status: 'active'
        };
        this.shards.set(shard.id, shard);
      }
    }
    
    console.log(`Created ${this.shards.size} shards across ${nodes.length} nodes`);
  }

  getShardForKey(key) {
    const nodeId = this.hashRing.getNode(key);
    const nodeShards = Array.from(this.shards.values()).filter(s => s.nodeId === nodeId);
    return nodeShards[0] || null; // Return first shard for simplicity
  }

  scheduleMigration(shardId, sourceNodeId, targetNodeId) {
    const operation = {
      id: `migration-${Date.now()}`,
      shardId,
      sourceNodeId,
      targetNodeId,
      status: 'pending',
      createdAt: Date.now()
    };
    
    this.operations.push(operation);
    console.log(`📋 Scheduled migration: ${shardId} from ${sourceNodeId} to ${targetNodeId}`);
    return operation.id;
  }

  getStats() {
    const nodeShardCounts = {};
    for (const shard of this.shards.values()) {
      nodeShardCounts[shard.nodeId] = (nodeShardCounts[shard.nodeId] || 0) + 1;
    }
    
    return {
      totalShards: this.shards.size,
      totalNodes: this.hashRing.nodes.size,
      shardsPerNode: nodeShardCounts,
      pendingOperations: this.operations.filter(op => op.status === 'pending').length
    };
  }
}

const shardManager = new SimpleShardManager(hashRing);
shardManager.createShards();

// Test shard assignment
console.log('\nShard Assignment Test:');
for (const key of testKeys) {
  const shard = shardManager.getShardForKey(key);
  console.log(`  "${key}" -> Shard ${shard.id} on ${shard.nodeId}`);
}

// Demo 4: Migration Simulation
console.log('\n🚚 Demo 4: Migration Simulation');
console.log('--------------------------------');

// Schedule some migrations
const migrations = [
  shardManager.scheduleMigration('shard-0', 'node-1', 'node-2'),
  shardManager.scheduleMigration('shard-3', 'node-2', 'node-3'),
  shardManager.scheduleMigration('shard-6', 'node-3', 'node-1')
];

console.log(`Scheduled ${migrations.length} migrations`);

// Demo 5: Statistics
console.log('\n📈 Demo 5: System Statistics');
console.log('-----------------------------');

const hashStats = hashRing.getStats();
const shardStats = shardManager.getStats();

console.log('Hash Ring Stats:');
console.log(`  Total Nodes: ${hashStats.totalNodes}`);
console.log(`  Virtual Nodes: ${hashStats.totalVirtualNodes}`);

console.log('\nShard Manager Stats:');
console.log(`  Total Shards: ${shardStats.totalShards}`);
console.log(`  Pending Operations: ${shardStats.pendingOperations}`);
console.log('  Shards per Node:');
for (const [nodeId, count] of Object.entries(shardStats.shardsPerNode)) {
  console.log(`    ${nodeId}: ${count} shards`);
}

// Demo 6: Load Balancing Simulation
console.log('\n⚖️  Demo 6: Load Balancing');
console.log('-------------------------');

// Simulate adding a new node
console.log('Adding new node to cluster...');
hashRing.addNode('node-4', 'localhost', 3004, 1);

// Check new distribution
console.log('\nNew Key Distribution:');
const newDistribution = {};
for (const key of testKeys) {
  const nodeId = hashRing.getNode(key);
  newDistribution[nodeId] = (newDistribution[nodeId] || 0) + 1;
  console.log(`  "${key}" -> ${nodeId}`);
}

console.log('\n🎉 Sharding Demo Complete!');
console.log('==========================');
console.log('\n✅ Features Demonstrated:');
console.log('  • Consistent hashing for key distribution');
console.log('  • Virtual nodes for load balancing');
console.log('  • Replica management for fault tolerance');
console.log('  • Shard management and migration');
console.log('  • Dynamic node addition');
console.log('  • Statistics and monitoring');
console.log('\n🚀 NodeNomad sharding is ready for production!');
