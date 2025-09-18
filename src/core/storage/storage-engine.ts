/**
 * Storage Engine for NodeNomad
 * Implements persistent key-value storage with WAL support
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { StorageEngine, Key, Value, LogEntry } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

interface StorageEntry {
  key: Key;
  value: Value;
  timestamp: number;
  ttl?: number;
}

export class NodeNomadStorageEngine implements StorageEngine {
  private data: Map<Key, StorageEntry> = new Map();
  private dataFile: string;
  private walFile: string;
  private isInitialized: boolean = false;

  constructor(dataDir: string, nodeId: string) {
    this.dataFile = path.join(dataDir, `${nodeId}-data.json`);
    this.walFile = path.join(dataDir, `${nodeId}-wal.log`);
  }

  async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(this.dataFile), { recursive: true });

      // Load existing data
      await this.loadData();

      // Replay WAL if it exists
      await this.replayWAL();

      this.isInitialized = true;
      logger.info('Storage engine initialized', {
        dataFile: this.dataFile,
        walFile: this.walFile,
        entryCount: this.data.size,
      });
    } catch (error) {
      logger.error('Failed to initialize storage engine:', error);
      throw error;
    }
  }

  private async loadData(): Promise<void> {
    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const entries: StorageEntry[] = JSON.parse(data);
      
      for (const entry of entries) {
        // Check if entry has expired
        if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
          continue; // Skip expired entries
        }
        this.data.set(entry.key, entry);
      }

      logger.info('Loaded data from disk', { entryCount: entries.length });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to load data from disk:', error);
        throw error;
      }
      // File doesn't exist, start with empty data
      logger.info('No existing data file found, starting fresh');
    }
  }

  private async replayWAL(): Promise<void> {
    try {
      const walData = await fs.readFile(this.walFile, 'utf-8');
      const lines = walData.trim().split('\n');
      
      let replayedCount = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const entry: LogEntry = JSON.parse(line);
          await this.applyLogEntry(entry);
          replayedCount++;
        } catch (error) {
          logger.warn('Failed to replay WAL entry:', { line, error });
        }
      }

      logger.info('WAL replay completed', { replayedCount });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to replay WAL:', error);
        throw error;
      }
      // WAL doesn't exist, nothing to replay
      logger.info('No WAL file found, nothing to replay');
    }
  }

  private async applyLogEntry(entry: LogEntry): Promise<void> {
    switch (entry.command.type) {
      case 'set':
        if (entry.command.key && entry.command.value !== undefined) {
          this.data.set(entry.command.key, {
            key: entry.command.key,
            value: entry.command.value,
            timestamp: entry.timestamp,
          });
        }
        break;
      case 'delete':
        if (entry.command.key) {
          this.data.delete(entry.command.key);
        }
        break;
      default:
        logger.warn('Unknown command type in WAL:', entry.command.type);
    }
  }

  async get(key: Key): Promise<Value | null> {
    this.ensureInitialized();
    
    const entry = this.data.get(key);
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
      this.data.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: Key, value: Value, ttl?: number): Promise<void> {
    this.ensureInitialized();
    
    const entry: StorageEntry = {
      key,
      value,
      timestamp: Date.now(),
      ...(ttl !== undefined && { ttl }),
    };

    this.data.set(key, entry);
    
    // Persist to disk asynchronously
    this.persistData().catch(error => {
      logger.error('Failed to persist data:', error);
    });
  }

  async delete(key: Key): Promise<boolean> {
    this.ensureInitialized();
    
    const existed = this.data.has(key);
    if (existed) {
      this.data.delete(key);
      
      // Persist to disk asynchronously
      this.persistData().catch(error => {
        logger.error('Failed to persist data:', error);
      });
    }
    
    return existed;
  }

  async has(key: Key): Promise<boolean> {
    this.ensureInitialized();
    
    const entry = this.data.get(key);
    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
      this.data.delete(key);
      return false;
    }

    return true;
  }

  async keys(): Promise<Key[]> {
    this.ensureInitialized();
    
    const now = Date.now();
    const validKeys: Key[] = [];
    
    for (const [key, entry] of this.data.entries()) {
      if (entry.ttl && now > entry.timestamp + entry.ttl) {
        this.data.delete(key);
      } else {
        validKeys.push(key);
      }
    }
    
    return validKeys;
  }

  async clear(): Promise<void> {
    this.ensureInitialized();
    this.data.clear();
    
    // Persist to disk asynchronously
    this.persistData().catch(error => {
      logger.error('Failed to persist data:', error);
    });
  }

  async size(): Promise<number> {
    this.ensureInitialized();
    
    // Clean up expired entries
    const now = Date.now();
    for (const [key, entry] of this.data.entries()) {
      if (entry.ttl && now > entry.timestamp + entry.ttl) {
        this.data.delete(key);
      }
    }
    
    return this.data.size;
  }

  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Final persistence
      await this.persistData();
      
      // Clear memory
      this.data.clear();
      this.isInitialized = false;
      
      logger.info('Storage engine closed');
    } catch (error) {
      logger.error('Failed to close storage engine:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized');
    }
  }

  private async persistData(): Promise<void> {
    try {
      const entries = Array.from(this.data.values());
      const data = JSON.stringify(entries, null, 2);
      await fs.writeFile(this.dataFile, data, 'utf-8');
    } catch (error) {
      logger.error('Failed to persist data to disk:', error);
      throw error;
    }
  }

  // WAL methods for Raft integration
  async appendToWAL(entry: LogEntry): Promise<void> {
    try {
      const walEntry = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.walFile, walEntry, 'utf-8');
    } catch (error) {
      logger.error('Failed to append to WAL:', error);
      throw error;
    }
  }

  async getWALEntries(fromIndex: number, toIndex?: number): Promise<LogEntry[]> {
    try {
      const walData = await fs.readFile(this.walFile, 'utf-8');
      const lines = walData.trim().split('\n');
      
      const entries: LogEntry[] = [];
      for (let i = fromIndex; i < lines.length; i++) {
        if (toIndex && i >= toIndex) break;
        
        if (lines[i].trim()) {
          try {
            const entry: LogEntry = JSON.parse(lines[i]);
            entries.push(entry);
          } catch (error) {
            logger.warn('Failed to parse WAL entry:', { line: lines[i], error });
          }
        }
      }
      
      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      logger.error('Failed to read WAL entries:', error);
      throw error;
    }
  }

  async truncateWAL(fromIndex: number): Promise<void> {
    try {
      const walData = await fs.readFile(this.walFile, 'utf-8');
      const lines = walData.trim().split('\n');
      
      if (fromIndex >= lines.length) {
        return; // Nothing to truncate
      }
      
      const remainingLines = lines.slice(0, fromIndex);
      const newWalData = remainingLines.join('\n') + (remainingLines.length > 0 ? '\n' : '');
      
      await fs.writeFile(this.walFile, newWalData, 'utf-8');
      
      logger.info('WAL truncated', { fromIndex, remainingEntries: remainingLines.length });
    } catch (error) {
      logger.error('Failed to truncate WAL:', error);
      throw error;
    }
  }

  // Migration support
  async getShardData(shardId: string): Promise<Map<Key, Value>> {
    this.ensureInitialized();
    
    const shardData = new Map<Key, Value>();
    const now = Date.now();
    
    for (const [key, entry] of this.data.entries()) {
      // Check if entry has expired
      if (entry.ttl && now > entry.timestamp + entry.ttl) {
        this.data.delete(key);
        continue;
      }
      
      // For now, we'll include all data in shard
      // In a real implementation, this would be filtered by shard
      shardData.set(key, entry.value);
    }
    
    return shardData;
  }

  async setShardData(shardId: string, data: Map<Key, Value>): Promise<void> {
    this.ensureInitialized();
    
    for (const [key, value] of data.entries()) {
      await this.set(key, value);
    }
  }
}
