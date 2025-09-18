/**
 * Key-Value API Routes
 * Handles basic CRUD operations for the distributed store
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import Joi from 'joi';
import { ClusterManager } from '../../cluster/index.js';
import type { SetRequest, GetRequest, DeleteRequest, ApiResponse } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

export class KeyValueRoutes {
  private router: Router;
  private clusterManager: ClusterManager;

  // Validation schemas
  private setSchema = Joi.object({
    key: Joi.string().min(1).max(255).required(),
    value: Joi.alternatives().try(
      Joi.string().max(1024 * 1024), // 1MB max
      Joi.binary()
    ).required(),
    ttl: Joi.number().integer().min(1).optional(),
  });

  private getSchema = Joi.object({
    key: Joi.string().min(1).max(255).required(),
  });

  constructor(clusterManager: ClusterManager) {
    this.router = Router();
    this.clusterManager = clusterManager;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Set key-value pair
    this.router.post('/set', this.setKeyValue.bind(this));
    
    // Get value by key
    this.router.get('/get/:key', this.getValue.bind(this));
    
    // Delete key
    this.router.delete('/delete/:key', this.deleteKey.bind(this));
    
    // Check if key exists
    this.router.get('/exists/:key', this.keyExists.bind(this));
    
    // Get all keys (for debugging)
    this.router.get('/keys', this.getAllKeys.bind(this));
    
    // Clear all data (for testing)
    this.router.delete('/clear', this.clearAll.bind(this));
  }

  private async setKeyValue(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const { error, value } = this.setSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: error.details[0].message,
          timestamp: Date.now(),
        });
        return;
      }

      const { key, value: val, ttl } = value as SetRequest;

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

      // Set the key-value pair
      await this.clusterManager.set(key, val, ttl);

      const response: ApiResponse = {
        success: true,
        data: { key, value: val, ttl },
        timestamp: Date.now(),
        nodeId: this.clusterManager.getNodeId(),
      };

      res.json(response);
      logger.info('Key-value pair set', { key, ttl });

    } catch (error) {
      logger.error('Failed to set key-value pair:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getValue(req: Request, res: Response): Promise<void> {
    try {
      // Validate request parameters
      const { error, value } = this.getSchema.validate({ key: req.params.key });
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: error.details[0].message,
          timestamp: Date.now(),
        });
        return;
      }

      const { key } = value as GetRequest;

      // Get the value
      const result = await this.clusterManager.get(key);

      const response: ApiResponse = {
        success: true,
        data: result ? { key, value: result } : null,
        timestamp: Date.now(),
        nodeId: this.clusterManager.getNodeId(),
      };

      if (result === null) {
        res.status(404).json({
          ...response,
          success: false,
          error: 'Key Not Found',
          message: `Key '${key}' not found`,
        });
        return;
      }

      res.json(response);
      logger.info('Key-value pair retrieved', { key });

    } catch (error) {
      logger.error('Failed to get value:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async deleteKey(req: Request, res: Response): Promise<void> {
    try {
      // Validate request parameters
      const { error, value } = this.getSchema.validate({ key: req.params.key });
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: error.details[0].message,
          timestamp: Date.now(),
        });
        return;
      }

      const { key } = value as DeleteRequest;

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

      // Delete the key
      const existed = await this.clusterManager.delete(key);

      const response: ApiResponse = {
        success: true,
        data: { key, deleted: existed },
        timestamp: Date.now(),
        nodeId: this.clusterManager.getNodeId(),
      };

      if (!existed) {
        res.status(404).json({
          ...response,
          success: false,
          error: 'Key Not Found',
          message: `Key '${key}' not found`,
        });
        return;
      }

      res.json(response);
      logger.info('Key deleted', { key });

    } catch (error) {
      logger.error('Failed to delete key:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async keyExists(req: Request, res: Response): Promise<void> {
    try {
      // Validate request parameters
      const { error, value } = this.getSchema.validate({ key: req.params.key });
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: error.details[0].message,
          timestamp: Date.now(),
        });
        return;
      }

      const { key } = value as GetRequest;

      // Check if key exists
      const exists = await this.clusterManager.has(key);

      const response: ApiResponse = {
        success: true,
        data: { key, exists },
        timestamp: Date.now(),
        nodeId: this.clusterManager.getNodeId(),
      };

      res.json(response);
      logger.info('Key existence checked', { key, exists });

    } catch (error) {
      logger.error('Failed to check key existence:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async getAllKeys(req: Request, res: Response): Promise<void> {
    try {
      // Get all keys
      const keys = await this.clusterManager.getAllKeys();

      const response: ApiResponse = {
        success: true,
        data: { keys, count: keys.length },
        timestamp: Date.now(),
        nodeId: this.clusterManager.getNodeId(),
      };

      res.json(response);
      logger.info('All keys retrieved', { count: keys.length });

    } catch (error) {
      logger.error('Failed to get all keys:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async clearAll(req: Request, res: Response): Promise<void> {
    try {
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

      // Clear all data
      await this.clusterManager.clearAll();

      const response: ApiResponse = {
        success: true,
        data: { message: 'All data cleared' },
        timestamp: Date.now(),
        nodeId: this.clusterManager.getNodeId(),
      };

      res.json(response);
      logger.info('All data cleared');

    } catch (error) {
      logger.error('Failed to clear all data:', error);
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
