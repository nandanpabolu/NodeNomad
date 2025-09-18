/**
 * Shard Manager for NodeNomad
 * 
 * Manages shard operations, data distribution, and shard rebalancing
 */

import { ConsistentHashRing, type HashRingNode, type ShardInfo } from './consistent-hash.js';
import { logger } from '../../utils/logger.js';
import type { NodeConfig } from '../../types/index.js';

export interface ShardOperation {
  id: string;
  type: 'create' | 'delete' | 'move' | 'split' | 'merge';
  shardId: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ShardMetrics {
  shardId: string;
  nodeId: string;
  keyCount: number;
  size: number;
  readOps: number;
  writeOps: number;
  lastAccessed: number;
  loadFactor: number;
}

export class ShardManager {
  private hashRing: ConsistentHashRing;
  private shardOperations: Map<string, ShardOperation> = new Map();
  private shardMetrics: Map<string, ShardMetrics> = new Map();
  private rebalanceThreshold: number;
  private maxShardSize: number;
  private minShardSize: number;

  constructor(
    replicas: number = 150,
    rebalanceThreshold: number = 0.2,
    maxShardSize: number = 10000,
    minShardSize: number = 100
  ) {
    this.hashRing = new ConsistentHashRing(replicas);
    this.rebalanceThreshold = rebalanceThreshold;
    this.maxShardSize = maxShardSize;
    this.minShardSize = minShardSize;
    
    logger.info('Shard manager initialized', {
      replicas,
      rebalanceThreshold,
      maxShardSize,
      minShardSize
    });
  }

  /**
   * Add a node to the cluster
   */
  addNode(nodeId: string, host: string, port: number, weight: number = 1): void {
    this.hashRing.addNode(nodeId, host, port, weight);
    this.initializeShardMetrics(nodeId);
    logger.info('Node added to shard manager', { nodeId, host, port, weight });
  }

  /**
   * Remove a node from the cluster
   */
  async removeNode(nodeId: string): Promise<void> {
    const nodeShards = this.hashRing.getNodeShards(nodeId);
    
    // Create migration operations for all shards on this node
    for (const shard of nodeShards) {
      await this.scheduleShardMigration(shard.id, nodeId, undefined);
    }

    this.hashRing.removeNode(nodeId);
    this.cleanupShardMetrics(nodeId);
    
    logger.info('Node removed from shard manager', { 
      nodeId, 
      migratedShards: nodeShards.length 
    });
  }

  /**
   * Get the node responsible for a key
   */
  getNodeForKey(key: string): string | null {
    return this.hashRing.getNode(key);
  }

  /**
   * Get replica nodes for a key
   */
  getReplicaNodes(key: string, replicaCount: number = 3): string[] {
    return this.hashRing.getReplicaNodes(key, replicaCount);
  }

  /**
   * Get shard information for a key
   */
  getShardForKey(key: string): ShardInfo | null {
    return this.hashRing.getShardForKey(key);
  }

  /**
   * Get all shards for a node
   */
  getNodeShards(nodeId: string): ShardInfo[] {
    return this.hashRing.getNodeShards(nodeId);
  }

  /**
   * Get all shards
   */
  getAllShards(): ShardInfo[] {
    return this.hashRing.getAllShards();
  }

  /**
   * Check if a key belongs to a specific shard
   */
  isKeyInShard(key: string, shardId: string): boolean {
    const shard = this.getAllShards().find(s => s.id === shardId);
    if (!shard) {
      return false;
    }
    return this.hashRing.isKeyInShard(key, shard);
  }

  /**
   * Get nodes affected by a key operation
   */
  getAffectedNodes(key: string): string[] {
    return this.hashRing.getAffectedNodes(key);
  }

  /**
   * Update shard metrics
   */
  updateShardMetrics(shardId: string, metrics: Partial<ShardMetrics>): void {
    const existing = this.shardMetrics.get(shardId);
    if (existing) {
      this.shardMetrics.set(shardId, { ...existing, ...metrics });
    } else {
      this.shardMetrics.set(shardId, {
        shardId,
        nodeId: '',
        keyCount: 0,
        size: 0,
        readOps: 0,
        writeOps: 0,
        lastAccessed: Date.now(),
        loadFactor: 0,
        ...metrics
      });
    }
  }

  /**
   * Get shard metrics
   */
  getShardMetrics(shardId: string): ShardMetrics | null {
    return this.shardMetrics.get(shardId) || null;
  }

  /**
   * Get all shard metrics
   */
  getAllShardMetrics(): ShardMetrics[] {
    return Array.from(this.shardMetrics.values());
  }

  /**
   * Schedule a shard migration
   */
  async scheduleShardMigration(
    shardId: string, 
    sourceNodeId: string, 
    targetNodeId?: string
  ): Promise<string> {
    const operationId = `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // If no target node specified, find the best one
    if (!targetNodeId) {
      targetNodeId = this.findBestTargetNode(sourceNodeId);
    }

    const operation: ShardOperation = {
      id: operationId,
      type: 'move',
      shardId,
      sourceNodeId,
      targetNodeId,
      status: 'pending',
      createdAt: Date.now(),
      metadata: {
        shardSize: this.getShardMetrics(shardId)?.size || 0,
        keyCount: this.getShardMetrics(shardId)?.keyCount || 0
      }
    };

    this.shardOperations.set(operationId, operation);
    
    logger.info('Shard migration scheduled', {
      operationId,
      shardId,
      sourceNodeId,
      targetNodeId
    });

    return operationId;
  }

  /**
   * Execute a shard operation
   */
  async executeShardOperation(operationId: string): Promise<boolean> {
    const operation = this.shardOperations.get(operationId);
    if (!operation) {
      logger.error('Shard operation not found', { operationId });
      return false;
    }

    if (operation.status !== 'pending') {
      logger.warn('Shard operation already processed', { 
        operationId, 
        status: operation.status 
      });
      return false;
    }

    operation.status = 'in_progress';
    operation.startedAt = Date.now();

    try {
      let success = false;

      switch (operation.type) {
        case 'move':
          success = await this.executeShardMove(operation);
          break;
        case 'split':
          success = await this.executeShardSplit(operation);
          break;
        case 'merge':
          success = await this.executeShardMerge(operation);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      if (success) {
        operation.status = 'completed';
        operation.completedAt = Date.now();
        logger.info('Shard operation completed', { operationId, type: operation.type });
      } else {
        operation.status = 'failed';
        operation.error = 'Operation execution failed';
        logger.error('Shard operation failed', { operationId, type: operation.type });
      }

      return success;
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : String(error);
      operation.completedAt = Date.now();
      
      logger.error('Shard operation error', {
        operationId,
        type: operation.type,
        error: operation.error
      });
      
      return false;
    }
  }

  /**
   * Get shard operation status
   */
  getShardOperation(operationId: string): ShardOperation | null {
    return this.shardOperations.get(operationId) || null;
  }

  /**
   * Get all shard operations
   */
  getAllShardOperations(): ShardOperation[] {
    return Array.from(this.shardOperations.values());
  }

  /**
   * Check if rebalancing is needed
   */
  needsRebalancing(): boolean {
    const stats = this.hashRing.getRingStats();
    return stats.ringBalance > this.rebalanceThreshold;
  }

  /**
   * Perform automatic rebalancing
   */
  async rebalance(): Promise<string[]> {
    if (!this.needsRebalancing()) {
      logger.info('No rebalancing needed');
      return [];
    }

    const operations: string[] = [];
    const shards = this.getAllShards();
    const nodeShardCounts = new Map<string, number>();

    // Count shards per node
    for (const shard of shards) {
      const count = nodeShardCounts.get(shard.nodeId) || 0;
      nodeShardCounts.set(shard.nodeId, count + 1);
    }

    const nodes = Array.from(nodeShardCounts.keys());
    const averageShardsPerNode = shards.length / nodes.length;

    // Find overloaded and underloaded nodes
    const overloadedNodes = nodes.filter(nodeId => 
      (nodeShardCounts.get(nodeId) || 0) > averageShardsPerNode * (1 + this.rebalanceThreshold)
    );
    const underloadedNodes = nodes.filter(nodeId => 
      (nodeShardCounts.get(nodeId) || 0) < averageShardsPerNode * (1 - this.rebalanceThreshold)
    );

    // Schedule migrations from overloaded to underloaded nodes
    for (const sourceNodeId of overloadedNodes) {
      const sourceShards = this.getNodeShards(sourceNodeId);
      const shardsToMove = Math.floor(
        (nodeShardCounts.get(sourceNodeId) || 0) - averageShardsPerNode
      );

      for (let i = 0; i < shardsToMove && i < sourceShards.length; i++) {
        const targetNodeId = underloadedNodes[i % underloadedNodes.length];
        const operationId = await this.scheduleShardMigration(
          sourceShards[i].id,
          sourceNodeId,
          targetNodeId
        );
        operations.push(operationId);
      }
    }

    logger.info('Rebalancing scheduled', {
      operationsCount: operations.length,
      overloadedNodes: overloadedNodes.length,
      underloadedNodes: underloadedNodes.length
    });

    return operations;
  }

  /**
   * Get shard manager statistics
   */
  getStats(): {
    totalShards: number;
    totalNodes: number;
    totalOperations: number;
    pendingOperations: number;
    inProgressOperations: number;
    completedOperations: number;
    failedOperations: number;
    ringStats: ReturnType<ConsistentHashRing['getRingStats']>;
  } {
    const operations = this.getAllShardOperations();
    const ringStats = this.hashRing.getRingStats();

    return {
      totalShards: this.getAllShards().length,
      totalNodes: ringStats.totalNodes,
      totalOperations: operations.length,
      pendingOperations: operations.filter(op => op.status === 'pending').length,
      inProgressOperations: operations.filter(op => op.status === 'in_progress').length,
      completedOperations: operations.filter(op => op.status === 'completed').length,
      failedOperations: operations.filter(op => op.status === 'failed').length,
      ringStats
    };
  }

  /**
   * Execute shard move operation
   */
  private async executeShardMove(operation: ShardOperation): Promise<boolean> {
    // This would typically involve:
    // 1. Notify source node to prepare shard for migration
    // 2. Transfer shard data to target node
    // 3. Update hash ring to point to new node
    // 4. Notify all nodes of the change
    // 5. Clean up old shard data

    logger.info('Executing shard move', {
      operationId: operation.id,
      shardId: operation.shardId,
      sourceNodeId: operation.sourceNodeId,
      targetNodeId: operation.targetNodeId
    });

    // For now, we'll simulate the operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
  }

  /**
   * Execute shard split operation
   */
  private async executeShardSplit(operation: ShardOperation): Promise<boolean> {
    logger.info('Executing shard split', {
      operationId: operation.id,
      shardId: operation.shardId
    });

    // Implementation would split a large shard into smaller ones
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
  }

  /**
   * Execute shard merge operation
   */
  private async executeShardMerge(operation: ShardOperation): Promise<boolean> {
    logger.info('Executing shard merge', {
      operationId: operation.id,
      shardId: operation.shardId
    });

    // Implementation would merge small shards
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
  }

  /**
   * Find the best target node for migration
   */
  private findBestTargetNode(sourceNodeId: string): string {
    const stats = this.hashRing.getRingStats();
    const nodeShardCounts = new Map<string, number>();
    
    for (const shard of this.getAllShards()) {
      const count = nodeShardCounts.get(shard.nodeId) || 0;
      nodeShardCounts.set(shard.nodeId, count + 1);
    }

    // Find node with least shards (excluding source)
    let bestNode = '';
    let minShards = Infinity;

    for (const [nodeId, count] of nodeShardCounts) {
      if (nodeId !== sourceNodeId && count < minShards) {
        minShards = count;
        bestNode = nodeId;
      }
    }

    return bestNode || sourceNodeId;
  }

  /**
   * Initialize shard metrics for a new node
   */
  private initializeShardMetrics(nodeId: string): void {
    const nodeShards = this.getNodeShards(nodeId);
    for (const shard of nodeShards) {
      this.updateShardMetrics(shard.id, {
        shardId: shard.id,
        nodeId: shard.nodeId,
        keyCount: 0,
        size: 0,
        readOps: 0,
        writeOps: 0,
        lastAccessed: Date.now(),
        loadFactor: 0
      });
    }
  }

  /**
   * Clean up shard metrics for a removed node
   */
  private cleanupShardMetrics(nodeId: string): void {
    const nodeShards = this.getNodeShards(nodeId);
    for (const shard of nodeShards) {
      this.shardMetrics.delete(shard.id);
    }
  }
}
