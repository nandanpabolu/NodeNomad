/**
 * Raft-based Cluster Manager for NodeNomad
 * Manages multi-node cluster with Raft consensus
 */

import type { NodeConfig, Node, ClusterInfo, ClusterMetrics, Key, Value, NodeStatus } from '../types/index.js';
import { RaftEngine } from '../core/consensus/index.js';
import { NodeNomadStorageEngine } from '../core/storage/index.js';
import { ShardManager } from '../core/sharding/index.js';
import { logger } from '../utils/logger.js';

export class RaftClusterManager {
  private config: NodeConfig;
  private storage: NodeNomadStorageEngine;
  private raft: RaftEngine;
  private shardManager: ShardManager;
  private nodes: Map<string, Node> = new Map();
  private isInitialized: boolean = false;

  constructor(config: NodeConfig) {
    this.config = config;
    this.storage = new NodeNomadStorageEngine(config.dataDir, config.id);
    this.raft = new RaftEngine(config.id, config.electionTimeout, config.heartbeatInterval);
    this.shardManager = new ShardManager(
      config.virtualNodesPerShard || 150,
      0.2, // rebalance threshold
      10000, // max shard size
      100 // min shard size
    );
    
    // Set up Raft callbacks
    this.raft.onStateChangeCallback((status: NodeStatus) => {
      this.handleRaftStateChange(status);
    });
    
    this.raft.onLogCommitCallback((entry) => {
      this.handleLogCommit(entry);
    });
  }

  async initialize(): Promise<void> {
    try {
      // Initialize storage
      await this.storage.initialize();
      
      // Initialize cluster nodes
      await this.initializeNodes();
      
      // Start Raft engine
      this.raft.start();
      
      this.isInitialized = true;
      
      logger.info('Raft cluster manager initialized', {
        nodeId: this.config.id,
        nodeCount: this.nodes.size,
        status: this.raft.getStatus(),
      });
    } catch (error) {
      logger.error('Failed to initialize Raft cluster manager:', error);
      throw error;
    }
  }

  private async initializeNodes(): Promise<void> {
    // Add self to cluster
    this.nodes.set(this.config.id, {
      id: this.config.id,
      address: this.config.host,
      port: this.config.port,
      status: 'follower' as const,
      lastSeen: Date.now(),
      metadata: {
        version: '1.0.0',
        capabilities: ['storage', 'consensus', 'migration'],
        load: 0,
        shards: [],
      },
    });

    // Add self to shard manager
    this.shardManager.addNode(this.config.id, this.config.host, this.config.port, 1);

    // Add other cluster nodes
    for (const nodeAddress of this.config.clusterNodes) {
      const [nodeId, port] = nodeAddress.split(':');
      if (nodeId !== this.config.id) {
        this.nodes.set(nodeId, {
          id: nodeId,
          address: 'localhost', // In real implementation, this would be parsed from address
          port: parseInt(port),
          status: 'offline' as const,
          lastSeen: 0,
          metadata: {
            version: '1.0.0',
            capabilities: ['storage', 'consensus', 'migration'],
            load: 0,
            shards: [],
          },
        });

        // Add to shard manager
        this.shardManager.addNode(nodeId, 'localhost', parseInt(port), 1);
      }
    }
  }

  private handleRaftStateChange(status: NodeStatus): void {
    logger.info('Raft state changed', { 
      nodeId: this.config.id, 
      status,
      term: this.raft.getCurrentTerm()
    });

    // Update node status
    const node = this.nodes.get(this.config.id);
    if (node) {
      node.status = status;
      node.lastSeen = Date.now();
    }

    // Log cluster event
    this.logClusterEvent('raft_state_change', {
      nodeId: this.config.id,
      status,
      term: this.raft.getCurrentTerm(),
    });
  }

  private handleLogCommit(entry: any): void {
    logger.info('Handling log commit', { 
      nodeId: this.config.id, 
      command: entry.command.type,
      key: entry.command.key 
    });
    
    // Apply the committed log entry to storage
    this.applyLogEntry(entry).catch(error => {
      logger.error('Failed to apply log entry:', error);
    });
  }

  private async applyLogEntry(entry: any): Promise<void> {
    try {
      logger.info('Applying log entry to storage', { 
        nodeId: this.config.id, 
        command: entry.command.type,
        key: entry.command.key 
      });
      
      switch (entry.command.type) {
        case 'set':
          await this.storage.set(entry.command.key, entry.command.value, entry.command.ttl);
          logger.info('Successfully applied SET command', { 
            nodeId: this.config.id, 
            key: entry.command.key 
          });
          break;
        case 'delete':
          await this.storage.delete(entry.command.key);
          logger.info('Successfully applied DELETE command', { 
            nodeId: this.config.id, 
            key: entry.command.key 
          });
          break;
        default:
          logger.warn('Unknown command type in log entry:', entry.command.type);
      }
    } catch (error) {
      logger.error('Failed to apply log entry:', error);
    }
  }

  private logClusterEvent(event: string, data: any): void {
    logger.info(`Cluster Event: ${event}`, {
      event,
      timestamp: Date.now(),
      ...data,
    });
  }

  async shutdown(): Promise<void> {
    try {
      this.raft.stop();
      await this.storage.close();
      this.isInitialized = false;
      logger.info('Raft cluster manager shutdown');
    } catch (error) {
      logger.error('Failed to shutdown Raft cluster manager:', error);
      throw error;
    }
  }

  // Key-Value Operations (Leader only)
  async set(key: Key, value: Value, ttl?: number): Promise<void> {
    if (!this.raft.isLeader()) {
      throw new Error('Only leader can accept writes');
    }

    const command = {
      type: 'set' as const,
      key,
      value,
      ttl,
    };

    this.raft.appendCommand(command);
  }

  async get(key: Key): Promise<Value | null> {
    return await this.storage.get(key);
  }

  async delete(key: Key): Promise<boolean> {
    if (!this.raft.isLeader()) {
      throw new Error('Only leader can accept writes');
    }

    const command = {
      type: 'delete' as const,
      key,
    };

    this.raft.appendCommand(command);
    return await this.storage.delete(key);
  }

  async has(key: Key): Promise<boolean> {
    return await this.storage.has(key);
  }

  async getAllKeys(): Promise<Key[]> {
    return await this.storage.keys();
  }

  async clearAll(): Promise<void> {
    if (!this.raft.isLeader()) {
      throw new Error('Only leader can accept writes');
    }

    // In a real implementation, this would be a special command
    await this.storage.clear();
  }

  // Cluster Management
  getNodeId(): string {
    return this.config.id;
  }

  isLeaderNode(): boolean {
    return this.raft.isLeader();
  }

  getLeader(): Node | null {
    const leaderId = this.raft.getLeaderId();
    return leaderId ? this.nodes.get(leaderId) || null : null;
  }

  getNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  getShards(): any[] {
    return this.shardManager.getAllShards();
  }

  // Shard Management Methods
  getNodeForKey(key: Key): string | null {
    return this.shardManager.getNodeForKey(key);
  }

  getReplicaNodes(key: Key, replicaCount: number = 3): string[] {
    return this.shardManager.getReplicaNodes(key, replicaCount);
  }

  getShardForKey(key: Key): any {
    return this.shardManager.getShardForKey(key);
  }

  getNodeShards(nodeId: string): any[] {
    return this.shardManager.getNodeShards(nodeId);
  }

  isKeyInShard(key: Key, shardId: string): boolean {
    return this.shardManager.isKeyInShard(key, shardId);
  }

  getAffectedNodes(key: Key): string[] {
    return this.shardManager.getAffectedNodes(key);
  }

  async scheduleShardMigration(shardId: string, sourceNodeId: string, targetNodeId?: string): Promise<string> {
    return await this.shardManager.scheduleShardMigration(shardId, sourceNodeId, targetNodeId);
  }

  async executeShardOperation(operationId: string): Promise<boolean> {
    return await this.shardManager.executeShardOperation(operationId);
  }

  getShardOperation(operationId: string): any {
    return this.shardManager.getShardOperation(operationId);
  }

  getAllShardOperations(): any[] {
    return this.shardManager.getAllShardOperations();
  }

  needsRebalancing(): boolean {
    return this.shardManager.needsRebalancing();
  }

  async rebalance(): Promise<string[]> {
    return await this.shardManager.rebalance();
  }

  getShardStats(): any {
    return this.shardManager.getStats();
  }

  getClusterInfo(): ClusterInfo {
    return {
      nodes: this.getNodes(),
      leader: this.raft.getLeaderId(),
      shards: this.getShards(),
      migrations: [], // Placeholder
      metrics: this.getMetrics(),
    };
  }

  getMetrics(): ClusterMetrics {
    const activeNodes = Array.from(this.nodes.values()).filter(node => 
      node.status !== 'offline'
    ).length;

    return {
      totalNodes: this.nodes.size,
      activeNodes,
      totalShards: 0, // Placeholder
      activeShards: 0, // Placeholder
      totalKeys: 0, // Will be implemented
      averageLoad: 0,
      uptime: process.uptime(),
    };
  }

  // Raft-specific methods
  getRaftStatus(): {
    status: NodeStatus;
    term: number;
    leaderId: string | null;
    logLength: number;
  } {
    return {
      status: this.raft.getStatus(),
      term: this.raft.getCurrentTerm(),
      leaderId: this.raft.getLeaderId(),
      logLength: this.raft.getLogEntries(0).length,
    };
  }

  // Migration Operations (Placeholder)
  async startMigration(shardId: string, targetNodeId: string): Promise<string> {
    const migrationId = `migration-${Date.now()}`;
    logger.info('Migration started (placeholder)', { migrationId, shardId, targetNodeId });
    return migrationId;
  }

  async getMigrationStatus(migrationId: string): Promise<any> {
    // Placeholder
    return null;
  }

  async cancelMigration(migrationId: string): Promise<boolean> {
    // Placeholder
    return false;
  }

  async getMigrations(): Promise<any[]> {
    // Placeholder
    return [];
  }
}
