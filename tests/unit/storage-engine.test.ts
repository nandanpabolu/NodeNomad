/**
 * Unit tests for Storage Engine
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { NodeNomadStorageEngine } from '../../src/core/storage/storage-engine.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('NodeNomadStorageEngine', () => {
  let storage: NodeNomadStorageEngine;
  const testDataDir = './test-data';

  beforeEach(async () => {
    // Clean up test data directory
    try {
      await fs.rmdir(testDataDir, { recursive: true });
    } catch (error) {
      // Directory doesn't exist, that's fine
    }
    
    storage = new NodeNomadStorageEngine(testDataDir, 'test-node');
    await storage.initialize();
  });

  afterEach(async () => {
    if (storage) {
      await storage.close();
    }
    
    // Clean up test data
    try {
      await fs.rmdir(testDataDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Operations', () => {
    it('should set and get a key-value pair', async () => {
      await storage.set('test-key', 'test-value');
      const value = await storage.get('test-key');
      expect(value).toBe('test-value');
    });

    it('should return null for non-existent key', async () => {
      const value = await storage.get('non-existent');
      expect(value).toBeNull();
    });

    it('should check if key exists', async () => {
      expect(await storage.has('test-key')).toBe(false);
      
      await storage.set('test-key', 'test-value');
      expect(await storage.has('test-key')).toBe(true);
    });

    it('should delete a key', async () => {
      await storage.set('test-key', 'test-value');
      expect(await storage.has('test-key')).toBe(true);
      
      const deleted = await storage.delete('test-key');
      expect(deleted).toBe(true);
      expect(await storage.has('test-key')).toBe(false);
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await storage.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should get all keys', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.set('key3', 'value3');
      
      const keys = await storage.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys).toHaveLength(3);
    });

    it('should clear all data', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      expect(await storage.size()).toBe(2);
      
      await storage.clear();
      expect(await storage.size()).toBe(0);
      expect(await storage.keys()).toHaveLength(0);
    });

    it('should return correct size', async () => {
      expect(await storage.size()).toBe(0);
      
      await storage.set('key1', 'value1');
      expect(await storage.size()).toBe(1);
      
      await storage.set('key2', 'value2');
      expect(await storage.size()).toBe(2);
      
      await storage.delete('key1');
      expect(await storage.size()).toBe(1);
    });
  });

  describe('TTL Support', () => {
    it('should expire keys after TTL', async () => {
      await storage.set('test-key', 'test-value', 100); // 100ms TTL
      expect(await storage.get('test-key')).toBe('test-value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(await storage.get('test-key')).toBeNull();
      expect(await storage.has('test-key')).toBe(false);
    });

    it('should not expire keys without TTL', async () => {
      await storage.set('test-key', 'test-value');
      
      // Wait longer than any TTL test
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(await storage.get('test-key')).toBe('test-value');
    });
  });

  describe('Persistence', () => {
    it('should persist data across restarts', async () => {
      await storage.set('persistent-key', 'persistent-value');
      await storage.close();
      
      // Create new storage instance
      const newStorage = new NodeNomadStorageEngine(testDataDir, 'test-node');
      await newStorage.initialize();
      
      const value = await newStorage.get('persistent-key');
      expect(value).toBe('persistent-value');
      
      await newStorage.close();
    });
  });

  describe('WAL Operations', () => {
    it('should append to WAL', async () => {
      const logEntry = {
        term: 1,
        index: 0,
        command: { type: 'set' as const, key: 'test-key', value: 'test-value' },
        timestamp: Date.now(),
      };
      
      await storage.appendToWAL(logEntry);
      
      const entries = await storage.getWALEntries(0);
      expect(entries).toHaveLength(1);
      expect(entries[0].command.key).toBe('test-key');
    });

    it('should get WAL entries from index', async () => {
      const entry1 = {
        term: 1,
        index: 0,
        command: { type: 'set' as const, key: 'key1', value: 'value1' },
        timestamp: Date.now(),
      };
      
      const entry2 = {
        term: 1,
        index: 1,
        command: { type: 'set' as const, key: 'key2', value: 'value2' },
        timestamp: Date.now(),
      };
      
      await storage.appendToWAL(entry1);
      await storage.appendToWAL(entry2);
      
      const entries = await storage.getWALEntries(1);
      expect(entries).toHaveLength(1);
      expect(entries[0].command.key).toBe('key2');
    });

    it('should truncate WAL', async () => {
      const entry1 = {
        term: 1,
        index: 0,
        command: { type: 'set' as const, key: 'key1', value: 'value1' },
        timestamp: Date.now(),
      };
      
      const entry2 = {
        term: 1,
        index: 1,
        command: { type: 'set' as const, key: 'key2', value: 'value2' },
        timestamp: Date.now(),
      };
      
      await storage.appendToWAL(entry1);
      await storage.appendToWAL(entry2);
      
      await storage.truncateWAL(1);
      
      const entries = await storage.getWALEntries(0);
      expect(entries).toHaveLength(1);
      expect(entries[0].command.key).toBe('key1');
    });
  });
});
