#!/usr/bin/env node

/**
 * NodeNomad - Distributed Key-Value Store
 * Main application entry point
 */

import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';

import { logger } from './utils/logger.js';
import type { NodeConfig } from './types/index.js';
import { LogLevel } from './types/index.js';
import { NodeNomadError } from './types/index.js';
import { ClusterManager } from './cluster/index.js';
import { ApiRouter } from './api/routes/index.js';
import { MetricsCollector } from './cluster/metrics/index.js';

// Load environment variables
config();

class NodeNomadServer {
  private app: express.Application;
  private server: any;
  private clusterManager: ClusterManager;
  private metricsCollector: MetricsCollector;
  private config: NodeConfig;

  constructor() {
    this.app = express();
    this.config = this.loadConfig();
    this.clusterManager = new ClusterManager(this.config);
    this.metricsCollector = new MetricsCollector();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private loadConfig(): NodeConfig {
    return {
      id: process.env['NODE_ID'] || `node-${Date.now()}`,
      port: parseInt(process.env['NODE_PORT'] || '3000'),
      host: process.env['NODE_HOST'] || '0.0.0.0',
      clusterNodes: process.env['CLUSTER_NODES']?.split(',') || [],
      logLevel: (process.env['LOG_LEVEL'] as LogLevel) || LogLevel.INFO,
      dataDir: process.env['DATA_DIR'] || './data',
      maxLogSize: parseInt(process.env['MAX_LOG_SIZE'] || '1000'),
      heartbeatInterval: parseInt(process.env['HEARTBEAT_INTERVAL'] || '150'),
      electionTimeout: parseInt(process.env['ELECTION_TIMEOUT'] || '300'),
      replicationFactor: parseInt(process.env['REPLICATION_FACTOR'] || '3'),
      shardCount: parseInt(process.env['SHARD_COUNT'] || '8'),
      virtualNodesPerShard: parseInt(process.env['VIRTUAL_NODES_PER_SHARD'] || '100'),
    };
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable for API
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') || '*',
      credentials: true,
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const health = {
        status: 'healthy',
        timestamp: Date.now(),
        nodeId: this.config.id,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cluster: this.clusterManager.getClusterInfo(),
      };
      res.json(health);
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const metrics = this.metricsCollector.getMetrics();
      res.json(metrics);
    });

    // API routes
    const apiRouter = new ApiRouter(this.clusterManager);
    this.app.use('/api/v1', apiRouter.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'NodeNomad',
        version: '1.0.0',
        description: 'A distributed key-value store where nodes migrate like digital nomads',
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          api: '/api/v1',
        },
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: Date.now(),
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);

      if (error instanceof NodeNomadError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          timestamp: Date.now(),
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env['NODE_ENV'] === 'development' ? error.message : 'Something went wrong',
        timestamp: Date.now(),
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize cluster manager
      await this.clusterManager.initialize();
      logger.info('Cluster manager initialized');

      // Start metrics collection
      this.metricsCollector.start();
      logger.info('Metrics collection started');

      // Create HTTP server
      this.server = createServer(this.app);

      // Start server
      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(`NodeNomad server started`, {
          nodeId: this.config.id,
          port: this.config.port,
          host: this.config.host,
          clusterNodes: this.config.clusterNodes.length,
        });
      });

      // Graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start NodeNomad server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Stop accepting new connections
        this.server?.close(() => {
          logger.info('HTTP server closed');
        });

        // Shutdown cluster manager
        await this.clusterManager.shutdown();
        logger.info('Cluster manager shutdown');

        // Stop metrics collection
        this.metricsCollector.stop();
        logger.info('Metrics collection stopped');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }

  public async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
    }
    await this.clusterManager.shutdown();
    this.metricsCollector.stop();
  }
}

// Start the server
const server = new NodeNomadServer();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
server.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

export default NodeNomadServer;
