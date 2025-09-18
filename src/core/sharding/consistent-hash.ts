/**
 * Consistent Hashing Implementation for NodeNomad
 * 
 * This module implements consistent hashing to distribute data across nodes
 * in a way that minimizes data movement when nodes are added or removed.
 */

import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';

export interface HashRingNode {
  id: string;
  host: string;
  port: number;
  weight: number;
  virtualNodes: VirtualNode[];
}

export interface VirtualNode {
  hash: string;
  nodeId: string;
  position: number;
}

export interface ShardInfo {
  id: string;
  startHash: string;
  endHash: string;
  nodeId: string;
  keyCount: number;
  size: number;
  lastUpdated: number;
}

export class ConsistentHashRing {
  private ring: VirtualNode[] = [];
  private nodes: Map<string, HashRingNode> = new Map();
  private shards: Map<string, ShardInfo> = new Map();
  private readonly replicas: number;
  private readonly hashFunction: (key: string) => string;

  constructor(replicas: number = 150) {
    this.replicas = replicas;
    this.hashFunction = this.md5Hash;
    logger.info('Consistent hash ring initialized', { replicas });
  }

  /**
   * Add a node to the hash ring
   */
  addNode(nodeId: string, host: string, port: number, weight: number = 1): void {
    if (this.nodes.has(nodeId)) {
      logger.warn('Node already exists in hash ring', { nodeId });
      return;
    }

    const node: HashRingNode = {
      id: nodeId,
      host,
      port,
      weight,
      virtualNodes: []
    };

    // Create virtual nodes for this physical node
    for (let i = 0; i < this.replicas * weight; i++) {
      const virtualNodeId = `${nodeId}-${i}`;
      const hash = this.hashFunction(virtualNodeId);
      const position = this.hashToPosition(hash);

      const virtualNode: VirtualNode = {
        hash,
        nodeId,
        position
      };

      node.virtualNodes.push(virtualNode);
      this.ring.push(virtualNode);
    }

    // Sort ring by position
    this.ring.sort((a, b) => a.position - b.position);

    this.nodes.set(nodeId, node);
    this.updateShards();

    logger.info('Node added to hash ring', {
      nodeId,
      host,
      port,
      weight,
      virtualNodes: node.virtualNodes.length,
      totalRingSize: this.ring.length
    });
  }

  /**
   * Remove a node from the hash ring
   */
  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      logger.warn('Node not found in hash ring', { nodeId });
      return;
    }

    // Remove all virtual nodes for this physical node
    this.ring = this.ring.filter(virtualNode => virtualNode.nodeId !== nodeId);
    this.nodes.delete(nodeId);
    this.updateShards();

    logger.info('Node removed from hash ring', {
      nodeId,
      remainingNodes: this.nodes.size,
      totalRingSize: this.ring.length
    });
  }

  /**
   * Get the node responsible for a given key
   */
  getNode(key: string): string | null {
    if (this.ring.length === 0) {
      return null;
    }

    const hash = this.hashFunction(key);
    const position = this.hashToPosition(hash);

    // Find the first virtual node with position >= key position
    for (const virtualNode of this.ring) {
      if (virtualNode.position >= position) {
        return virtualNode.nodeId;
      }
    }

    // Wrap around to the first node
    return this.ring[0].nodeId;
  }

  /**
   * Get multiple nodes for replication (replica set)
   */
  getReplicaNodes(key: string, replicaCount: number = 3): string[] {
    if (this.ring.length === 0) {
      return [];
    }

    const hash = this.hashFunction(key);
    const position = this.hashToPosition(hash);
    const replicas: string[] = [];
    const seenNodes = new Set<string>();

    // Find the starting position
    let startIndex = 0;
    for (let i = 0; i < this.ring.length; i++) {
      if (this.ring[i].position >= position) {
        startIndex = i;
        break;
      }
    }

    // Collect unique nodes starting from the primary
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

  /**
   * Get all shards for a specific node
   */
  getNodeShards(nodeId: string): ShardInfo[] {
    return Array.from(this.shards.values()).filter(shard => shard.nodeId === nodeId);
  }

  /**
   * Get all shards
   */
  getAllShards(): ShardInfo[] {
    return Array.from(this.shards.values());
  }

  /**
   * Get shard information for a key
   */
  getShardForKey(key: string): ShardInfo | null {
    const nodeId = this.getNode(key);
    if (!nodeId) {
      return null;
    }

    return this.getNodeShards(nodeId).find(shard => 
      this.isKeyInShard(key, shard)
    ) || null;
  }

  /**
   * Check if a key belongs to a specific shard
   */
  isKeyInShard(key: string, shard: ShardInfo): boolean {
    const keyHash = this.hashFunction(key);
    const keyPosition = this.hashToPosition(keyHash);
    
    return keyPosition >= this.hashToPosition(shard.startHash) && 
           keyPosition <= this.hashToPosition(shard.endHash);
  }

  /**
   * Get nodes that need to be notified when a key changes
   */
  getAffectedNodes(key: string): string[] {
    return this.getReplicaNodes(key);
  }

  /**
   * Get ring statistics
   */
  getRingStats(): {
    totalNodes: number;
    totalVirtualNodes: number;
    shardCount: number;
    averageShardsPerNode: number;
    ringBalance: number;
  } {
    const totalNodes = this.nodes.size;
    const totalVirtualNodes = this.ring.length;
    const shardCount = this.shards.size;
    const averageShardsPerNode = totalNodes > 0 ? shardCount / totalNodes : 0;

    // Calculate ring balance (standard deviation of shard counts per node)
    const shardCounts = Array.from(this.nodes.keys()).map(nodeId => 
      this.getNodeShards(nodeId).length
    );
    
    const mean = shardCounts.reduce((sum, count) => sum + count, 0) / shardCounts.length;
    const variance = shardCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / shardCounts.length;
    const ringBalance = Math.sqrt(variance);

    return {
      totalNodes,
      totalVirtualNodes,
      shardCount,
      averageShardsPerNode,
      ringBalance
    };
  }

  /**
   * Update shard information based on current ring state
   */
  private updateShards(): void {
    this.shards.clear();

    if (this.ring.length === 0) {
      return;
    }

    // Group virtual nodes by physical node
    const nodeVirtualNodes = new Map<string, VirtualNode[]>();
    for (const virtualNode of this.ring) {
      if (!nodeVirtualNodes.has(virtualNode.nodeId)) {
        nodeVirtualNodes.set(virtualNode.nodeId, []);
      }
      nodeVirtualNodes.get(virtualNode.nodeId)!.push(virtualNode);
    }

    // Create shards for each node
    for (const [nodeId, virtualNodes] of nodeVirtualNodes) {
      // Sort virtual nodes by position
      virtualNodes.sort((a, b) => a.position - b.position);

      for (let i = 0; i < virtualNodes.length; i++) {
        const current = virtualNodes[i];
        const next = virtualNodes[(i + 1) % virtualNodes.length];
        
        const shardId = `${nodeId}-shard-${i}`;
        const startHash = current.hash;
        const endHash = next.position > current.position ? 
          this.positionToHash(next.position - 1) : 
          this.positionToHash(0xFFFFFFFF);

        const shard: ShardInfo = {
          id: shardId,
          startHash,
          endHash,
          nodeId,
          keyCount: 0,
          size: 0,
          lastUpdated: Date.now()
        };

        this.shards.set(shardId, shard);
      }
    }

    logger.debug('Shards updated', {
      shardCount: this.shards.size,
      nodeCount: this.nodes.size
    });
  }

  /**
   * Convert hash string to numeric position
   */
  private hashToPosition(hash: string): number {
    // Use first 8 characters of hash as hex number
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Convert numeric position back to hash string
   */
  private positionToHash(position: number): string {
    return position.toString(16).padStart(8, '0');
  }

  /**
   * MD5 hash function
   */
  private md5Hash(key: string): string {
    return createHash('md5').update(key).digest('hex');
  }

  /**
   * Get detailed ring information for debugging
   */
  getRingInfo(): {
    nodes: HashRingNode[];
    virtualNodes: VirtualNode[];
    shards: ShardInfo[];
    stats: ReturnType<ConsistentHashRing['getRingStats']>;
  } {
    return {
      nodes: Array.from(this.nodes.values()),
      virtualNodes: [...this.ring],
      shards: Array.from(this.shards.values()),
      stats: this.getRingStats()
    };
  }
}
