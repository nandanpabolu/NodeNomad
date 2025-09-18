/**
 * Main API Router for NodeNomad
 * Handles all HTTP endpoints for the distributed key-value store
 */

import { Router } from 'express';
import { ClusterManager } from '../../cluster/index.js';
import { KeyValueRoutes } from './key-value-routes.js';
import { ClusterRoutes } from './cluster-routes.js';
import { MigrationRoutes } from './migration-routes.js';
import { logger } from '../../utils/logger.js';

export class ApiRouter {
  private router: Router;
  private clusterManager: ClusterManager;
  private keyValueRoutes: KeyValueRoutes;
  private clusterRoutes: ClusterRoutes;
  private migrationRoutes: MigrationRoutes;

  constructor(clusterManager: ClusterManager) {
    this.router = Router();
    this.clusterManager = clusterManager;
    
    // Initialize route handlers
    this.keyValueRoutes = new KeyValueRoutes(clusterManager);
    this.clusterRoutes = new ClusterRoutes(clusterManager);
    this.migrationRoutes = new MigrationRoutes(clusterManager);
    
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // API version info
    this.router.get('/', (req, res) => {
      res.json({
        name: 'NodeNomad API',
        version: '1.0.0',
        description: 'Distributed key-value store API',
        endpoints: {
          keyValue: '/kv',
          cluster: '/cluster',
          migration: '/migration',
        },
      });
    });

    // Key-Value operations
    this.router.use('/kv', this.keyValueRoutes.getRouter());
    
    // Cluster operations
    this.router.use('/cluster', this.clusterRoutes.getRouter());
    
    // Migration operations (the "nomad" feature)
    this.router.use('/migration', this.migrationRoutes.getRouter());

    // Error handling for API routes
    this.router.use((error: Error, req: any, res: any, next: any) => {
      logger.error('API Error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
      });

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env['NODE_ENV'] === 'development' ? error.message : 'Something went wrong',
        timestamp: Date.now(),
      });
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}
