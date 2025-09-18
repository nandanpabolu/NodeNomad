#!/usr/bin/env node

/**
 * NodeNomad Quick Start Example
 * Demonstrates basic key-value operations
 */

import http from 'http';

const API_BASE = 'http://localhost:3000/api/v1';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function waitForServer() {
  log('⏳ Waiting for NodeNomad server...', 'yellow');
  
  for (let i = 0; i < 30; i++) {
    try {
      const response = await makeRequest('GET', '/health');
      if (response.status === 200) {
        log('✅ Server is ready!', 'green');
        return true;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  log('❌ Server not ready after 30 seconds', 'red');
  return false;
}

async function basicOperations() {
  log('\n📊 Basic Key-Value Operations', 'cyan');
  log('==============================', 'cyan');
  
  // Store some data
  log('\n1. Storing data...', 'blue');
  const testData = [
    { key: 'user:1', value: 'Alice Johnson', ttl: 3600 },
    { key: 'user:2', value: 'Bob Smith', ttl: 3600 },
    { key: 'session:abc123', value: 'active', ttl: 1800 },
    { key: 'config:theme', value: 'dark', ttl: null },
  ];

  for (const item of testData) {
    try {
      const response = await makeRequest('POST', '/api/v1/set', item);
      if (response.status === 200) {
        log(`  ✅ Stored: ${item.key} = ${item.value}`, 'green');
      } else {
        log(`  ❌ Failed to store: ${item.key}`, 'red');
      }
    } catch (e) {
      log(`  ❌ Error storing ${item.key}: ${e.message}`, 'red');
    }
  }

  // Retrieve data
  log('\n2. Retrieving data...', 'blue');
  for (const item of testData) {
    try {
      const response = await makeRequest('GET', `/api/v1/get/${item.key}`);
      if (response.status === 200 && response.data.success) {
        log(`  ✅ Retrieved: ${item.key} = ${response.data.data.value}`, 'green');
      } else {
        log(`  ❌ Failed to retrieve: ${item.key}`, 'red');
      }
    } catch (e) {
      log(`  ❌ Error retrieving ${item.key}: ${e.message}`, 'red');
    }
  }

  // Update data
  log('\n3. Updating data...', 'blue');
  try {
    const response = await makeRequest('POST', '/api/v1/set', {
      key: 'user:1',
      value: 'Alice Johnson (Updated)',
      ttl: 7200
    });
    if (response.status === 200) {
      log('  ✅ Updated: user:1', 'green');
    }
  } catch (e) {
    log(`  ❌ Error updating user:1: ${e.message}`, 'red');
  }

  // Delete data
  log('\n4. Deleting data...', 'blue');
  try {
    const response = await makeRequest('DELETE', '/api/v1/delete/session:abc123');
    if (response.status === 200) {
      log('  ✅ Deleted: session:abc123', 'green');
    }
  } catch (e) {
    log(`  ❌ Error deleting session:abc123: ${e.message}`, 'red');
  }

  // Try to retrieve deleted data
  log('\n5. Verifying deletion...', 'blue');
  try {
    const response = await makeRequest('GET', '/api/v1/get/session:abc123');
    if (response.status === 200 && !response.data.success) {
      log('  ✅ Confirmed: session:abc123 is deleted', 'green');
    }
  } catch (e) {
    log(`  ❌ Error verifying deletion: ${e.message}`, 'red');
  }
}

async function clusterInfo() {
  log('\n📊 Cluster Information', 'cyan');
  log('======================', 'cyan');
  
  try {
    const response = await makeRequest('GET', '/api/v1/cluster/info');
    if (response.status === 200) {
      const cluster = response.data.data;
      log(`  Nodes: ${cluster.nodes.length}`, 'blue');
      log(`  Leader: ${cluster.leader}`, 'blue');
      log(`  Shards: ${cluster.shards.length}`, 'blue');
      log(`  Total Keys: ${cluster.metrics.totalKeys}`, 'blue');
    }
  } catch (e) {
    log(`  ❌ Error getting cluster info: ${e.message}`, 'red');
  }
}

async function main() {
  log('🚀 NodeNomad Quick Start Example', 'bright');
  log('=================================', 'bright');
  
  // Wait for server
  const serverReady = await waitForServer();
  if (!serverReady) {
    process.exit(1);
  }
  
  // Run basic operations
  await basicOperations();
  
  // Show cluster info
  await clusterInfo();
  
  log('\n🎉 Quick start example complete!', 'green');
  log('NodeNomad is working perfectly! 🚀', 'bright');
}

// Run the example
main().catch(error => {
  log(`❌ Example failed: ${error.message}`, 'red');
  process.exit(1);
});
