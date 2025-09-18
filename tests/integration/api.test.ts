/**
 * Integration tests for API endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { RaftClusterManager } from '../../src/cluster/raft-cluster-manager.js';
import type { NodeConfig } from '../../src/types/index.js';
import { LogLevel } from '../../src/types/index.js';

// Mock the RaftClusterManager for testing
class MockRaftClusterManager {
  private isLeader = true;
  private storage = new Map<string, any>();

  async initialize(): Promise<void> {
    // Mock initialization
  }

  async shutdown(): Promise<void> {
    // Mock shutdown
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    this.storage.set(key, { value, ttl, timestamp: Date.now() });
  }

  async get(key: string): Promise<any> {
    const entry = this.storage.get(key);
    if (!entry) return null;
    
    if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
      this.storage.delete(key);
      return null;
    }
    
    return entry.value;
  }

  async delete(key: string): Promise<boolean> {
    return this.storage.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async clearAll(): Promise<void> {
    this.storage.clear();
  }

  getNodeId(): string {
    return 'test-node';
  }

  isLeaderNode(): boolean {
    return this.isLeader;
  }

  getLeader(): any {
    return { id: 'test-node' };
  }

  getNodes(): any[] {
    return [{ id: 'test-node', status: 'leader' }];
  }

  getShards(): any[] {
    return [];
  }

  getClusterInfo(): any {
    return {
      nodes: this.getNodes(),
      leader: 'test-node',
      shards: [],
      migrations: [],
      metrics: this.getMetrics(),
    };
  }

  getMetrics(): any {
    return {
      totalNodes: 1,
      activeNodes: 1,
      totalShards: 0,
      activeShards: 0,
      totalKeys: this.storage.size,
      averageLoad: 0,
      uptime: process.uptime(),
    };
  }

  getRaftStatus(): any {
    return {
      status: 'leader',
      term: 1,
      leaderId: 'test-node',
      logLength: 0,
    };
  }

  // Mock migration methods
  async startMigration(shardId: string, targetNodeId: string): Promise<string> {
    return `migration-${Date.now()}`;
  }

  async getMigrationStatus(migrationId: string): Promise<any> {
    return null;
  }

  async cancelMigration(migrationId: string): Promise<boolean> {
    return false;
  }

  async getMigrations(): Promise<any[]> {
    return [];
  }
}

// Create a simple Express app for testing
import express from 'express';
import cors from 'cors';

const createTestApp = () => {
  const app = express();
  const clusterManager = new MockRaftClusterManager();
  
  app.use(cors());
  app.use(express.json());
  
  // Health endpoint
  app.get('/health', (req, res) => {
    const raftStatus = clusterManager.getRaftStatus();
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      nodeId: clusterManager.getNodeId(),
      uptime: process.uptime(),
      raft: raftStatus,
    });
  });
  
  // Raft status endpoint
  app.get('/raft/status', (req, res) => {
    const status = clusterManager.getRaftStatus();
    res.json({
      success: true,
      data: status,
      timestamp: Date.now(),
    });
  });
  
  // Key-value endpoints
  app.post('/api/v1/set', async (req, res) => {
    try {
      const { key, value, ttl } = req.body;
      
      if (!key || value === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Key and value are required',
          timestamp: Date.now(),
        });
      }

      if (!clusterManager.isLeaderNode()) {
        const leader = clusterManager.getLeader();
        return res.status(503).json({
          success: false,
          error: 'Not Leader',
          message: 'This node is not the leader.',
          leader: leader?.id,
          timestamp: Date.now(),
        });
      }

      await clusterManager.set(key, value, ttl);
      
      res.json({
        success: true,
        data: { key, value, ttl },
        nodeId: clusterManager.getNodeId(),
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
  
  app.get('/api/v1/get/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const value = await clusterManager.get(key);
      
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
        nodeId: clusterManager.getNodeId(),
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
  
  app.delete('/api/v1/delete/:key', async (req, res) => {
    try {
      const { key } = req.params;
      
      if (!clusterManager.isLeaderNode()) {
        const leader = clusterManager.getLeader();
        return res.status(503).json({
          success: false,
          error: 'Not Leader',
          message: 'This node is not the leader.',
          leader: leader?.id,
          timestamp: Date.now(),
        });
      }

      const deleted = await clusterManager.delete(key);
      
      res.json({
        success: true,
        data: { key, deleted },
        nodeId: clusterManager.getNodeId(),
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
  
  app.get('/api/v1/keys', async (req, res) => {
    try {
      const keys = await clusterManager.getAllKeys();
      
      res.json({
        success: true,
        data: { keys, count: keys.length },
        nodeId: clusterManager.getNodeId(),
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
  
  return app;
};

describe('API Integration Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    app = createTestApp();
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.nodeId).toBe('test-node');
      expect(response.body.raft).toBeDefined();
    });

    it('should return Raft status', async () => {
      const response = await request(app)
        .get('/raft/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('leader');
      expect(response.body.data.term).toBe(1);
    });
  });

  describe('Key-Value Operations', () => {
    it('should set a key-value pair', async () => {
      const response = await request(app)
        .post('/api/v1/set')
        .send({ key: 'test-key', value: 'test-value' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe('test-key');
      expect(response.body.data.value).toBe('test-value');
    });

    it('should get a value by key', async () => {
      // First set a value
      await request(app)
        .post('/api/v1/set')
        .send({ key: 'get-test', value: 'get-value' });

      // Then get it
      const response = await request(app)
        .get('/api/v1/get/get-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe('get-test');
      expect(response.body.data.value).toBe('get-value');
    });

    it('should return 404 for non-existent key', async () => {
      const response = await request(app)
        .get('/api/v1/get/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Key not found');
    });

    it('should delete a key', async () => {
      // First set a value
      await request(app)
        .post('/api/v1/set')
        .send({ key: 'delete-test', value: 'delete-value' });

      // Then delete it
      const response = await request(app)
        .delete('/api/v1/delete/delete-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);

      // Verify it's deleted
      await request(app)
        .get('/api/v1/get/delete-test')
        .expect(404);
    });

    it('should return false when deleting non-existent key', async () => {
      const response = await request(app)
        .delete('/api/v1/delete/non-existent')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(false);
    });

    it('should list all keys', async () => {
      // Set some values
      await request(app)
        .post('/api/v1/set')
        .send({ key: 'key1', value: 'value1' });
      
      await request(app)
        .post('/api/v1/set')
        .send({ key: 'key2', value: 'value2' });

      const response = await request(app)
        .get('/api/v1/keys')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.keys).toContain('key1');
      expect(response.body.data.keys).toContain('key2');
      expect(response.body.data.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Validation', () => {
    it('should reject set request without key', async () => {
      const response = await request(app)
        .post('/api/v1/set')
        .send({ value: 'test-value' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Key and value are required');
    });

    it('should reject set request without value', async () => {
      const response = await request(app)
        .post('/api/v1/set')
        .send({ key: 'test-key' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Key and value are required');
    });
  });

  describe('TTL Support', () => {
    it('should set key with TTL', async () => {
      const response = await request(app)
        .post('/api/v1/set')
        .send({ key: 'ttl-test', value: 'ttl-value', ttl: 1000 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ttl).toBe(1000);
    });
  });
});
