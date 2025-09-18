/**
 * Shard Management API Routes
 * Handles shard operations, rebalancing, and migration
 */

import { Router, type Request, type Response } from 'express';
import type { RaftClusterManager } from '../../cluster/raft-cluster-manager.js';
import { logger } from '../../utils/logger.js';

export class ShardRoutes {
  private router: Router;

  constructor(private clusterManager: RaftClusterManager) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get all shards
    this.router.get('/', (req, res) => this.getAllShards(req, res));
    
    // Get shards for a specific node
    this.router.get('/node/:nodeId', (req, res) => this.getNodeShards(req, res));
    
    // Get shard for a key
    this.router.get('/key/:key', (req, res) => this.getShardForKey(req, res));
    
    // Get node responsible for a key
    this.router.get('/node-for-key/:key', (req, res) => this.getNodeForKey(req, res));
    
    // Get replica nodes for a key
    this.router.get('/replicas/:key', (req, res) => this.getReplicaNodes(req, res));
    
    // Schedule shard migration
    this.router.post('/migrate', (req, res) => this.scheduleMigration(req, res));
    
    // Execute shard operation
    this.router.post('/operation/:operationId/execute', (req, res) => this.executeOperation(req, res));
    
    // Get operation status
    this.router.get('/operation/:operationId', (req, res) => this.getOperationStatus(req, res));
    
    // Get all operations
    this.router.get('/operations', (req, res) => this.getAllOperations(req, res));
    
    // Check if rebalancing is needed
    this.router.get('/rebalance/check', (req, res) => this.checkRebalancing(req, res));
    
    // Trigger rebalancing
    this.router.post('/rebalance', (req, res) => this.triggerRebalancing(req, res));
    
    // Get shard statistics
    this.router.get('/stats', (req, res) => this.getShardStats(req, res));
  }

  public getRouter(): Router {
    return this.router;
  }

  /**
   * Get all shards
   */
  async getAllShards(req: Request, res: Response): Promise<void> {
    try {
      const shards = this.clusterManager.getShards();
      
      res.json({
        success: true,
        data: { shards, count: shards.length },
        nodeId: this.clusterManager.getNodeId(),
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get shards:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get shards for a specific node
   */
  async getNodeShards(req: Request, res: Response): Promise<void> {
    try {
      const { nodeId } = req.params;
      const shards = this.clusterManager.getNodeShards(nodeId);
      
      res.json({
        success: true,
        data: { nodeId, shards, count: shards.length },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get node shards:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get shard information for a key
   */
  async getShardForKey(req: Request, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const shard = this.clusterManager.getShardForKey(key);
      
      if (!shard) {
        res.status(404).json({
          success: false,
          error: 'Shard not found for key',
          timestamp: Date.now(),
        });
        return;
      }

      res.json({
        success: true,
        data: { key, shard },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get shard for key:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get node responsible for a key
   */
  async getNodeForKey(req: Request, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const nodeId = this.clusterManager.getNodeForKey(key);
      
      if (!nodeId) {
        res.status(404).json({
          success: false,
          error: 'No node found for key',
          timestamp: Date.now(),
        });
        return;
      }

      res.json({
        success: true,
        data: { key, nodeId },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get node for key:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get replica nodes for a key
   */
  async getReplicaNodes(req: Request, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const replicaCount = parseInt(req.query.replicas as string) || 3;
      const replicaNodes = this.clusterManager.getReplicaNodes(key, replicaCount);
      
      res.json({
        success: true,
        data: { key, replicaNodes, count: replicaNodes.length },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get replica nodes:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Schedule shard migration
   */
  async scheduleMigration(req: Request, res: Response): Promise<void> {
    try {
      if (!this.clusterManager.isLeaderNode()) {
        const leader = this.clusterManager.getLeader();
        res.status(503).json({
          success: false,
          error: 'Not Leader',
          message: 'This node is not the leader.',
          leader: leader?.id,
          timestamp: Date.now(),
        });
        return;
      }

      const { shardId, sourceNodeId, targetNodeId } = req.body;
      
      if (!shardId || !sourceNodeId) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'shardId and sourceNodeId are required',
          timestamp: Date.now(),
        });
        return;
      }

      const operationId = await this.clusterManager.scheduleShardMigration(
        shardId,
        sourceNodeId,
        targetNodeId
      );

      res.json({
        success: true,
        data: { operationId, shardId, sourceNodeId, targetNodeId },
        nodeId: this.clusterManager.getNodeId(),
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to schedule migration:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Execute shard operation
   */
  async executeOperation(req: Request, res: Response): Promise<void> {
    try {
      if (!this.clusterManager.isLeaderNode()) {
        const leader = this.clusterManager.getLeader();
        res.status(503).json({
          success: false,
          error: 'Not Leader',
          message: 'This node is not the leader.',
          leader: leader?.id,
          timestamp: Date.now(),
        });
        return;
      }

      const { operationId } = req.params;
      
      if (!operationId) {
        res.status(400).json({
          success: false,
          error: 'Missing operation ID',
          timestamp: Date.now(),
        });
        return;
      }

      const success = await this.clusterManager.executeShardOperation(operationId);

      res.json({
        success: true,
        data: { operationId, executed: success },
        nodeId: this.clusterManager.getNodeId(),
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to execute shard operation:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get shard operation status
   */
  async getOperationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { operationId } = req.params;
      const operation = this.clusterManager.getShardOperation(operationId);
      
      if (!operation) {
        res.status(404).json({
          success: false,
          error: 'Operation not found',
          timestamp: Date.now(),
        });
        return;
      }

      res.json({
        success: true,
        data: { operation },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get operation status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get all shard operations
   */
  async getAllOperations(req: Request, res: Response): Promise<void> {
    try {
      const operations = this.clusterManager.getAllShardOperations();
      
      res.json({
        success: true,
        data: { operations, count: operations.length },
        nodeId: this.clusterManager.getNodeId(),
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get shard operations:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Check if rebalancing is needed
   */
  async checkRebalancing(req: Request, res: Response): Promise<void> {
    try {
      const needsRebalancing = this.clusterManager.needsRebalancing();
      
      res.json({
        success: true,
        data: { needsRebalancing },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to check rebalancing:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Trigger rebalancing
   */
  async triggerRebalancing(req: Request, res: Response): Promise<void> {
    try {
      if (!this.clusterManager.isLeaderNode()) {
        const leader = this.clusterManager.getLeader();
        res.status(503).json({
          success: false,
          error: 'Not Leader',
          message: 'This node is not the leader.',
          leader: leader?.id,
          timestamp: Date.now(),
        });
        return;
      }

      const operationIds = await this.clusterManager.rebalance();

      res.json({
        success: true,
        data: { operationIds, count: operationIds.length },
        nodeId: this.clusterManager.getNodeId(),
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to trigger rebalancing:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get shard statistics
   */
  async getShardStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.clusterManager.getShardStats();
      
      res.json({
        success: true,
        data: { stats },
        nodeId: this.clusterManager.getNodeId(),
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get shard stats:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }
}
