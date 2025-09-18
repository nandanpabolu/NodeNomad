/**
 * Migration API Routes
 * Handles the "nomad" feature - live node migrations
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { ClusterManager } from '../../cluster/index.js';
import { logger } from '../../utils/logger.js';

export class MigrationRoutes {
  private router: Router;
  private clusterManager: ClusterManager;

  constructor(clusterManager: ClusterManager) {
    this.router = Router();
    this.clusterManager = clusterManager;
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

      // Start migration
      const migrationId = await this.clusterManager.startMigration(shardId, targetNodeId);

      res.json({
        success: true,
        data: { migrationId, shardId, targetNodeId },
        timestamp: Date.now(),
      });

      logger.info('Migration started', { migrationId, shardId, targetNodeId });

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

  public getRouter(): Router {
    return this.router;
  }
}
