/**
 * NodeNomad Migration Engine
 * Handles live data migration between nodes without downtime
 * This is the core "nomad" feature that makes nodes mobile
 */

import { logger } from '../../utils/logger.js';
import type { Node, Shard, MigrationPlan, MigrationStatus, MigrationData } from '../../types/index.js';

export interface MigrationOperation {
  id: string;
  shardId: string;
  sourceNodeId: string;
  targetNodeId: string;
  status: MigrationStatus;
  progress: number; // 0-100
  startTime: number;
  endTime?: number;
  dataTransferred: number;
  totalDataSize: number;
  error?: string;
}

export interface MigrationConfig {
  maxConcurrentMigrations: number;
  chunkSize: number; // bytes per chunk
  retryAttempts: number;
  timeoutMs: number;
}

export class MigrationEngine {
  private operations: Map<string, MigrationOperation> = new Map();
  private config: MigrationConfig;
  private isRunning: boolean = false;

  constructor(config: Partial<MigrationConfig> = {}) {
    this.config = {
      maxConcurrentMigrations: config.maxConcurrentMigrations || 3,
      chunkSize: config.chunkSize || 1024 * 1024, // 1MB chunks
      retryAttempts: config.retryAttempts || 3,
      timeoutMs: config.timeoutMs || 30000, // 30 seconds
    };
  }

  /**
   * Start the migration engine
   */
  start(): void {
    this.isRunning = true;
    logger.info('Migration engine started', { config: this.config });
  }

  /**
   * Stop the migration engine
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Migration engine stopped');
  }

  /**
   * Create a migration plan for moving shards between nodes
   */
  createMigrationPlan(
    shards: Shard[],
    sourceNodeId: string,
    targetNodeId: string,
    reason: string = 'load_balancing'
  ): MigrationPlan {
    const migrations = shards.map(shard => ({
      shardId: shard.id,
      sourceNodeId,
      targetNodeId,
      reason,
      estimatedDataSize: shard.size,
      priority: this.calculatePriority(shard),
    }));

    const plan: MigrationPlan = {
      id: `migration-${Date.now()}`,
      sourceNodeId,
      targetNodeId,
      reason,
      migrations,
      status: 'pending',
      createdAt: Date.now(),
      estimatedDuration: this.estimateDuration(migrations),
    };

    logger.info('Migration plan created', {
      planId: plan.id,
      sourceNodeId,
      targetNodeId,
      shardCount: migrations.length,
      estimatedDuration: plan.estimatedDuration,
    });

    return plan;
  }

  /**
   * Execute a migration plan
   */
  async executeMigrationPlan(plan: MigrationPlan): Promise<string[]> {
    if (!this.isRunning) {
      throw new Error('Migration engine is not running');
    }

    const operationIds: string[] = [];
    
    for (const migration of plan.migrations) {
      const operationId = await this.executeMigration(migration);
      operationIds.push(operationId);
    }

    logger.info('Migration plan execution started', {
      planId: plan.id,
      operationCount: operationIds.length,
    });

    return operationIds;
  }

  /**
   * Execute a single migration
   */
  async executeMigration(migration: any): Promise<string> {
    const operationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const operation: MigrationOperation = {
      id: operationId,
      shardId: migration.shardId,
      sourceNodeId: migration.sourceNodeId,
      targetNodeId: migration.targetNodeId,
      status: 'pending',
      progress: 0,
      startTime: Date.now(),
      dataTransferred: 0,
      totalDataSize: migration.estimatedDataSize,
    };

    this.operations.set(operationId, operation);

    // Start migration asynchronously
    this.performMigration(operationId).catch(error => {
      logger.error('Migration failed', { operationId, error: error.message });
      this.updateOperationStatus(operationId, 'failed', error.message);
    });

    return operationId;
  }

  /**
   * Perform the actual migration
   */
  private async performMigration(operationId: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Migration operation ${operationId} not found`);
    }

    try {
      this.updateOperationStatus(operationId, 'preparing', 0);
      
      // Step 1: Prepare target node
      await this.prepareTargetNode(operation);
      this.updateOperationStatus(operationId, 'preparing', 25);

      // Step 2: Start data transfer
      this.updateOperationStatus(operationId, 'transferring', 25);
      await this.transferData(operation);
      this.updateOperationStatus(operationId, 'transferring', 75);

      // Step 3: Verify data integrity
      this.updateOperationStatus(operationId, 'verifying', 75);
      await this.verifyData(operation);
      this.updateOperationStatus(operationId, 'verifying', 90);

      // Step 4: Update routing
      this.updateOperationStatus(operationId, 'updating_routing', 90);
      await this.updateRouting(operation);
      this.updateOperationStatus(operationId, 'updating_routing', 95);

      // Step 5: Cleanup source
      this.updateOperationStatus(operationId, 'cleaning_up', 95);
      await this.cleanupSource(operation);
      this.updateOperationStatus(operationId, 'completed', 100);

      operation.endTime = Date.now();
      logger.info('Migration completed successfully', {
        operationId,
        duration: operation.endTime - operation.startTime,
        dataTransferred: operation.dataTransferred,
      });

    } catch (error) {
      this.updateOperationStatus(operationId, 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Prepare target node for migration
   */
  private async prepareTargetNode(operation: MigrationOperation): Promise<void> {
    logger.info('Preparing target node', {
      operationId: operation.id,
      targetNodeId: operation.targetNodeId,
      shardId: operation.shardId,
    });

    // Simulate preparation time
    await this.delay(100);
  }

  /**
   * Transfer data from source to target
   */
  private async transferData(operation: MigrationOperation): Promise<void> {
    logger.info('Starting data transfer', {
      operationId: operation.id,
      shardId: operation.shardId,
      totalSize: operation.totalDataSize,
    });

    const chunkSize = this.config.chunkSize;
    const totalChunks = Math.ceil(operation.totalDataSize / chunkSize);
    
    for (let chunk = 0; chunk < totalChunks; chunk++) {
      // Simulate data transfer
      await this.delay(50);
      
      const transferred = Math.min((chunk + 1) * chunkSize, operation.totalDataSize);
      operation.dataTransferred = transferred;
      operation.progress = 25 + (chunk / totalChunks) * 50; // 25-75% range
      
      logger.debug('Data chunk transferred', {
        operationId: operation.id,
        chunk: chunk + 1,
        totalChunks,
        progress: operation.progress,
      });
    }
  }

  /**
   * Verify data integrity
   */
  private async verifyData(operation: MigrationOperation): Promise<void> {
    logger.info('Verifying data integrity', {
      operationId: operation.id,
      shardId: operation.shardId,
    });

    // Simulate verification
    await this.delay(200);
  }

  /**
   * Update routing to point to new node
   */
  private async updateRouting(operation: MigrationOperation): Promise<void> {
    logger.info('Updating routing', {
      operationId: operation.id,
      shardId: operation.shardId,
      targetNodeId: operation.targetNodeId,
    });

    // Simulate routing update
    await this.delay(100);
  }

  /**
   * Cleanup source node
   */
  private async cleanupSource(operation: MigrationOperation): Promise<void> {
    logger.info('Cleaning up source node', {
      operationId: operation.id,
      shardId: operation.shardId,
      sourceNodeId: operation.sourceNodeId,
    });

    // Simulate cleanup
    await this.delay(100);
  }

  /**
   * Update operation status
   */
  private updateOperationStatus(operationId: string, status: MigrationStatus, progress?: number, error?: string): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = status;
      if (progress !== undefined) {
        operation.progress = progress;
      }
      if (error) {
        operation.error = error;
      }
      
      logger.debug('Migration operation updated', {
        operationId,
        status,
        progress,
        error,
      });
    }
  }

  /**
   * Calculate migration priority based on shard characteristics
   */
  private calculatePriority(shard: Shard): number {
    // Higher priority for larger shards or shards with more activity
    return shard.size * 0.7 + shard.keyCount * 0.3;
  }

  /**
   * Estimate migration duration
   */
  private estimateDuration(migrations: any[]): number {
    const totalSize = migrations.reduce((sum, m) => sum + m.estimatedDataSize, 0);
    const transferRate = 10 * 1024 * 1024; // 10MB/s (simulated)
    return Math.ceil(totalSize / transferRate) * 1000; // Convert to milliseconds
  }

  /**
   * Get migration operation status
   */
  getOperationStatus(operationId: string): MigrationOperation | null {
    return this.operations.get(operationId) || null;
  }

  /**
   * Get all migration operations
   */
  getAllOperations(): MigrationOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get operations by status
   */
  getOperationsByStatus(status: MigrationStatus): MigrationOperation[] {
    return Array.from(this.operations.values()).filter(op => op.status === status);
  }

  /**
   * Cancel a migration operation
   */
  async cancelOperation(operationId: string): Promise<boolean> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return false;
    }

    if (operation.status === 'completed' || operation.status === 'failed') {
      return false;
    }

    operation.status = 'cancelled';
    operation.endTime = Date.now();
    
    logger.info('Migration operation cancelled', { operationId });
    return true;
  }

  /**
   * Get migration statistics
   */
  getStatistics(): any {
    const operations = Array.from(this.operations.values());
    const completed = operations.filter(op => op.status === 'completed');
    const failed = operations.filter(op => op.status === 'failed');
    const inProgress = operations.filter(op => 
      op.status === 'preparing' || 
      op.status === 'transferring' || 
      op.status === 'verifying' || 
      op.status === 'updating_routing' || 
      op.status === 'cleaning_up'
    );

    const totalDataTransferred = completed.reduce((sum, op) => sum + op.dataTransferred, 0);
    const averageDuration = completed.length > 0 
      ? completed.reduce((sum, op) => sum + (op.endTime! - op.startTime), 0) / completed.length
      : 0;

    return {
      totalOperations: operations.length,
      completed: completed.length,
      failed: failed.length,
      inProgress: inProgress.length,
      totalDataTransferred,
      averageDuration,
      successRate: operations.length > 0 ? (completed.length / operations.length) * 100 : 0,
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
