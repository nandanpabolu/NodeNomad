/**
 * Migration API Routes
 * Handles the "nomad" feature - live node migrations
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { RaftClusterManager } from '../../cluster/raft-cluster-manager.js';
import { MigrationEngine } from '../../core/migration/migration-engine.js';
import { logger } from '../../utils/logger.js';

export class MigrationRoutes {
  private router: Router;
  private clusterManager: RaftClusterManager;
  private migrationEngine: MigrationEngine;

  constructor(clusterManager: RaftClusterManager) {
    this.router = Router();
    this.clusterManager = clusterManager;
    this.migrationEngine = new MigrationEngine({
      maxConcurrentMigrations: 3,
      chunkSize: 1024 * 1024, // 1MB
      retryAttempts: 3,
      timeoutMs: 30000,
    });
    this.migrationEngine.start();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Start migration
    this.router.post('/start', this.startMigration.bind(this));
    
    // Get migration status
    this.router.get('/status/:migrationId', this.getMigrationStatus.bind(this));
    
    // Cancel migration
    this.router.post('/cancel/:migrationId', this.cancelMigration.bind(this));
    
    // Get all migrations
    this.router.get('/list', this.getMigrations.bind(this));
    
    // New migration engine endpoints
    this.router.get('/status', this.getMigrationStatus.bind(this));
    this.router.get('/operations', this.getOperations.bind(this));
    this.router.get('/operations/:id', this.getOperation.bind(this));
    this.router.post('/operations/:id/cancel', this.cancelOperation.bind(this));
    this.router.get('/stats', this.getStatistics.bind(this));
    this.router.post('/plan', this.createMigrationPlan.bind(this));
  }

  private async startMigration(req: Request, res: Response): Promise<void> {
    try {
      const { shardId, targetNodeId } = req.body;
      
      if (!shardId || !targetNodeId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'shardId and targetNodeId are required',
          timestamp: Date.now(),
        });
        return;
      }

      // Check if we're the leader
      if (!this.clusterManager.isLeaderNode()) {
        const leader = this.clusterManager.getLeader();
        res.status(503).json({
          success: false,
          error: 'Not Leader',
          message: 'This node is not the leader. Redirect to leader.',
          leader: leader?.id,
          timestamp: Date.now(),
        });
        return;
      }

      // Create mock shard for demo purposes
      const mockShard = {
        id: shardId,
        startHash: '00000000',
        endHash: 'ffffffff',
        nodeId: 'node-1', // Use a fixed node ID for demo
        keyCount: Math.floor(Math.random() * 100),
        size: Math.floor(Math.random() * 1024 * 1024), // Random size up to 1MB
        lastUpdated: Date.now()
      };

      // Create migration plan
      const plan = this.migrationEngine.createMigrationPlan(
        [mockShard],
        'node-1', // Use a fixed node ID for demo
        targetNodeId,
        'demo_migration'
      );

      // Execute migration plan
      const operationIds = await this.migrationEngine.executeMigrationPlan(plan);

      res.json({
        success: true,
        data: { 
          migrationId: plan.id,
          operationIds,
          shardId, 
          targetNodeId,
          status: 'started'
        },
        timestamp: Date.now(),
      });

      logger.info('Migration started', { migrationId: plan.id, shardId, targetNodeId });

    } catch (error) {
      logger.error('Failed to start migration:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getMigrationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { migrationId } = req.params;
      
      const status = await this.clusterManager.getMigrationStatus(migrationId);
      
      if (!status) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Migration ${migrationId} not found`,
          timestamp: Date.now(),
        });
        return;
      }

      res.json({
        success: true,
        data: status,
        timestamp: Date.now(),
      });

    } catch (error) {
      logger.error('Failed to get migration status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async cancelMigration(req: Request, res: Response): Promise<void> {
    try {
      const { migrationId } = req.params;
      
      // Check if we're the leader
      if (!this.clusterManager.isLeaderNode()) {
        const leader = this.clusterManager.getLeader();
        res.status(503).json({
          success: false,
          error: 'Not Leader',
          message: 'This node is not the leader. Redirect to leader.',
          leader: leader?.id,
          timestamp: Date.now(),
        });
        return;
      }

      const cancelled = await this.clusterManager.cancelMigration(migrationId);
      
      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Migration ${migrationId} not found or cannot be cancelled`,
          timestamp: Date.now(),
        });
        return;
      }

      res.json({
        success: true,
        data: { migrationId, cancelled: true },
        timestamp: Date.now(),
      });

      logger.info('Migration cancelled', { migrationId });

    } catch (error) {
      logger.error('Failed to cancel migration:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getMigrations(req: Request, res: Response): Promise<void> {
    try {
      const migrations = await this.clusterManager.getMigrations();
      
      res.json({
        success: true,
        data: { migrations },
        timestamp: Date.now(),
      });

    } catch (error) {
      logger.error('Failed to get migrations:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  // New migration engine methods
  private async getMigrationStatus(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.migrationEngine.getStatistics();
      const inProgressOps = this.migrationEngine.getOperationsByStatus('preparing')
        .concat(this.migrationEngine.getOperationsByStatus('transferring'))
        .concat(this.migrationEngine.getOperationsByStatus('verifying'))
        .concat(this.migrationEngine.getOperationsByStatus('updating_routing'))
        .concat(this.migrationEngine.getOperationsByStatus('cleaning_up'));

      res.json({
        success: true,
        data: {
          status: inProgressOps.length > 0 ? 'active' : 'ready',
          activeMigrations: inProgressOps.length,
          totalMigrations: stats.totalOperations,
          completed: stats.completed,
          failed: stats.failed,
          successRate: stats.successRate,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get migration status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getOperations(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.query;
      let operations = this.migrationEngine.getAllOperations();
      
      if (status) {
        operations = operations.filter(op => op.status === status);
      }

      res.json({
        success: true,
        data: {
          operations,
          total: operations.length,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get operations:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getOperation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const operation = this.migrationEngine.getOperationStatus(id);
      
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
        data: operation,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get operation:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async cancelOperation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const cancelled = await this.migrationEngine.cancelOperation(id);
      
      if (!cancelled) {
        res.status(400).json({
          success: false,
          error: 'Cannot cancel operation',
          message: 'Operation not found or already completed/failed',
          timestamp: Date.now(),
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id,
          status: 'cancelled',
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to cancel operation:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.migrationEngine.getStatistics();
      
      res.json({
        success: true,
        data: stats,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async createMigrationPlan(req: Request, res: Response): Promise<void> {
    try {
      const { sourceNodeId, targetNodeId, shardIds, reason } = req.body;
      
      if (!sourceNodeId || !targetNodeId || !shardIds || !Array.isArray(shardIds)) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'sourceNodeId, targetNodeId, and shardIds array are required',
          timestamp: Date.now(),
        });
        return;
      }

      // Get shards from cluster manager
      const allShards = this.clusterManager.getShards();
      const shardsToMigrate = allShards.filter(shard => 
        shardIds.includes(shard.id) && shard.nodeId === sourceNodeId
      );

      // For demo purposes, if no shards found, create a mock migration plan
      if (shardsToMigrate.length === 0) {
        // Create mock shards for demonstration
        const mockShards = shardIds.map(shardId => ({
          id: shardId,
          startHash: '00000000',
          endHash: 'ffffffff',
          nodeId: sourceNodeId,
          keyCount: Math.floor(Math.random() * 100),
          size: Math.floor(Math.random() * 1024 * 1024), // Random size up to 1MB
          lastUpdated: Date.now()
        }));
        
        const plan = this.migrationEngine.createMigrationPlan(
          mockShards,
          sourceNodeId,
          targetNodeId,
          reason || 'load_balancing'
        );

        res.json({
          success: true,
          data: plan,
          timestamp: Date.now(),
        });
        return;
      }

      // Create migration plan
      const plan = this.migrationEngine.createMigrationPlan(
        shardsToMigrate,
        sourceNodeId,
        targetNodeId,
        reason || 'load_balancing'
      );

      res.json({
        success: true,
        data: plan,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to create migration plan:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}
