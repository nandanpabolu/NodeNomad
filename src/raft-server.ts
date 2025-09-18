#!/usr/bin/env node

/**
 * Raft-based NodeNomad Server
 * Multi-node distributed key-value store with Raft consensus
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { RaftClusterManager } from './cluster/raft-cluster-manager.js';
import { ApiRouter } from './api/routes/api-router.js';
import type { NodeConfig, LogLevel } from './types/index.js';
import { LogLevel } from './types/index.js';

// Load environment variables
config();

class RaftNodeNomadServer {
  private app: express.Application;
  private clusterManager: RaftClusterManager;
  private apiRouter: ApiRouter;
  private config: NodeConfig;
  private server: any;

  constructor() {
    this.app = express();
    this.config = this.loadConfig();
    this.clusterManager = new RaftClusterManager(this.config);
    this.apiRouter = new ApiRouter(this.clusterManager);
    this.setupMiddleware();
    this.setupRoutes();
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
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check with Raft status
    this.app.get('/health', (req, res) => {
      const raftStatus = this.clusterManager.getRaftStatus();
      const health = {
        status: 'healthy',
        timestamp: Date.now(),
        nodeId: this.config.id,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        raft: raftStatus,
        cluster: this.clusterManager.getClusterInfo(),
      };
      res.json(health);
    });

    // Raft status endpoint
    this.app.get('/raft/status', (req, res) => {
      const status = this.clusterManager.getRaftStatus();
      res.json({
        success: true,
        data: status,
        timestamp: Date.now(),
      });
    });

    // Cluster information
    this.app.get('/cluster/info', (req, res) => {
      const info = this.clusterManager.getClusterInfo();
      res.json({
        success: true,
        data: info,
        timestamp: Date.now(),
      });
    });

    // Key-Value API
    this.app.post('/api/v1/set', async (req, res) => {
      try {
        const { key, value, ttl } = req.body;
        
        if (!key || value === undefined) {
          return res.status(400).json({
            success: false,
            error: 'Key and value are required',
            timestamp: Date.now(),
          });
        }

        // Check if we're the leader
        if (!this.clusterManager.isLeaderNode()) {
          const leader = this.clusterManager.getLeader();
          return res.status(503).json({
            success: false,
            error: 'Not Leader',
            message: 'This node is not the leader. Redirect to leader.',
            leader: leader?.id,
            timestamp: Date.now(),
          });
        }

        await this.clusterManager.set(key, value, ttl);
        
        res.json({
          success: true,
          data: { key, value, ttl },
          nodeId: this.config.id,
          timestamp: Date.now(),
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    });

    this.app.get('/api/v1/get/:key', async (req, res) => {
      try {
        const { key } = req.params;
        const value = await this.clusterManager.get(key);
        
        if (value === null) {
          return res.status(404).json({
            success: false,
            error: 'Key not found',
            timestamp: Date.now(),
          });
        }

        res.json({
          success: true,
          data: { key, value },
          nodeId: this.config.id,
          timestamp: Date.now(),
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    });

    this.app.delete('/api/v1/delete/:key', async (req, res) => {
      try {
        const { key } = req.params;
        
        // Check if we're the leader
        if (!this.clusterManager.isLeaderNode()) {
          const leader = this.clusterManager.getLeader();
          return res.status(503).json({
            success: false,
            error: 'Not Leader',
            message: 'This node is not the leader. Redirect to leader.',
            leader: leader?.id,
            timestamp: Date.now(),
          });
        }

        const deleted = await this.clusterManager.delete(key);
        
        res.json({
          success: true,
          data: { key, deleted },
          nodeId: this.config.id,
          timestamp: Date.now(),
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    });

    this.app.get('/api/v1/keys', async (req, res) => {
      try {
        const keys = await this.clusterManager.getAllKeys();
        
        res.json({
          success: true,
          data: { keys, count: keys.length },
          nodeId: this.config.id,
          timestamp: Date.now(),
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    });

    // Use the ApiRouter for additional API endpoints
    this.app.use('/api/v1', this.apiRouter.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      const raftStatus = this.clusterManager.getRaftStatus();
      res.json({
        name: 'NodeNomad (Raft)',
        version: '1.0.0',
        description: 'A distributed key-value store with Raft consensus',
        nodeId: this.config.id,
        raftStatus,
        endpoints: {
          health: '/health',
          raftStatus: '/raft/status',
          clusterInfo: '/cluster/info',
          set: 'POST /api/v1/set',
          get: 'GET /api/v1/get/:key',
          delete: 'DELETE /api/v1/delete/:key',
          keys: 'GET /api/v1/keys',
          shards: '/api/v1/shard/*',
          cluster: '/api/v1/cluster/*',
        },
      });
    });
  }

  async start(): Promise<void> {
    try {
      // Initialize cluster manager
      await this.clusterManager.initialize();
      
      // Start HTTP server
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        console.log(`🚀 NodeNomad Raft server started!`);
        console.log(`📍 Node ID: ${this.config.id}`);
        console.log(`🌐 Port: ${this.config.port}`);
        console.log(`🏛️ Raft Status: ${this.clusterManager.getRaftStatus().status}`);
        console.log(`🔗 Health: http://localhost:${this.config.port}/health`);
        console.log(`📚 API: http://localhost:${this.config.port}/`);
      });

      // Graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('Failed to start Raft server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

      try {
        // Stop HTTP server
        this.server?.close(() => {
          console.log('✅ HTTP server closed');
        });

        // Shutdown cluster manager
        await this.clusterManager.shutdown();
        console.log('✅ Cluster manager shutdown');

        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start the server
const server = new RaftNodeNomadServer();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
server.start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

export default RaftNodeNomadServer;
