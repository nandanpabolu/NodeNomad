/**
 * Cluster API Routes
 * Handles cluster management and monitoring endpoints
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { ClusterManager } from '../../cluster/index.js';
import { logger } from '../../utils/logger.js';

export class ClusterRoutes {
  private router: Router;
  private clusterManager: ClusterManager;

  constructor(clusterManager: ClusterManager) {
    this.router = Router();
    this.clusterManager = clusterManager;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get cluster information
    this.router.get('/info', this.getClusterInfo.bind(this));
    
    // Get all nodes
    this.router.get('/nodes', this.getNodes.bind(this));
    
    // Get shard information
    this.router.get('/shards', this.getShards.bind(this));
    
    // Get cluster metrics
    this.router.get('/metrics', this.getMetrics.bind(this));
  }

  private async getClusterInfo(req: Request, res: Response): Promise<void> {
    try {
      const clusterInfo = this.clusterManager.getClusterInfo();
      res.json({
        success: true,
        data: clusterInfo,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get cluster info:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getNodes(req: Request, res: Response): Promise<void> {
    try {
      const nodes = this.clusterManager.getNodes();
      res.json({
        success: true,
        data: { nodes },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get nodes:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getShards(req: Request, res: Response): Promise<void> {
    try {
      const shards = this.clusterManager.getShards();
      res.json({
        success: true,
        data: { shards },
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

  private async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = this.clusterManager.getMetrics();
      res.json({
        success: true,
        data: metrics,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to get metrics:', error);
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
