#!/usr/bin/env node

/**
 * Simple NodeNomad Server for Testing
 * A basic version to get the project running quickly
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

// Load environment variables
config();

const app = express();
const PORT = process.env['NODE_PORT'] || 3000;
const NODE_ID = process.env['NODE_ID'] || 'node-1';

// Middleware
app.use(cors());
app.use(express.json());

// Simple in-memory storage
const storage = new Map<string, any>();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    nodeId: NODE_ID,
    timestamp: Date.now(),
    uptime: process.uptime(),
    storageSize: storage.size,
  });
});

// Key-Value API
app.post('/api/v1/set', (req, res) => {
  const { key, value, ttl } = req.body;
  
  if (!key || value === undefined) {
    return res.status(400).json({
      success: false,
      error: 'Key and value are required',
    });
  }

  storage.set(key, { value, ttl, timestamp: Date.now() });
  
  res.json({
    success: true,
    data: { key, value },
    nodeId: NODE_ID,
    timestamp: Date.now(),
  });
});

app.get('/api/v1/get/:key', (req, res) => {
  const { key } = req.params;
  const entry = storage.get(key);
  
  if (!entry) {
    return res.status(404).json({
      success: false,
      error: 'Key not found',
    });
  }

  // Check TTL
  if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
    storage.delete(key);
    return res.status(404).json({
      success: false,
      error: 'Key expired',
    });
  }

  res.json({
    success: true,
    data: { key, value: entry.value },
    nodeId: NODE_ID,
    timestamp: Date.now(),
  });
});

app.delete('/api/v1/delete/:key', (req, res) => {
  const { key } = req.params;
  const existed = storage.has(key);
  
  if (existed) {
    storage.delete(key);
  }

  res.json({
    success: true,
    data: { key, deleted: existed },
    nodeId: NODE_ID,
    timestamp: Date.now(),
  });
});

app.get('/api/v1/keys', (req, res) => {
  const keys = Array.from(storage.keys());
  
  res.json({
    success: true,
    data: { keys, count: keys.length },
    nodeId: NODE_ID,
    timestamp: Date.now(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'NodeNomad',
    version: '1.0.0',
    description: 'A distributed key-value store where nodes migrate like digital nomads',
    nodeId: NODE_ID,
    endpoints: {
      health: '/health',
      set: 'POST /api/v1/set',
      get: 'GET /api/v1/get/:key',
      delete: 'DELETE /api/v1/delete/:key',
      keys: 'GET /api/v1/keys',
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NodeNomad server started!`);
  console.log(`📍 Node ID: ${NODE_ID}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`📚 API: http://localhost:${PORT}/`);
});

export default app;
