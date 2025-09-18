#!/usr/bin/env node

/**
 * NodeNomad Migration Demo
 * Demonstrates the core "nomad" feature - live node migrations
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
  magenta: '\x1b[35m',
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

async function setupTestData() {
  log('\n📊 Setting up test data...', 'cyan');
  
  // Add some test keys
  const testKeys = [
    { key: 'user:1', value: 'Alice Johnson', ttl: 3600 },
    { key: 'user:2', value: 'Bob Smith', ttl: 3600 },
    { key: 'session:abc123', value: 'active', ttl: 1800 },
    { key: 'cache:data1', value: 'cached_value_1', ttl: 600 },
    { key: 'cache:data2', value: 'cached_value_2', ttl: 600 },
  ];

  for (const item of testKeys) {
    try {
      const response = await makeRequest('POST', '/api/v1/set', item);
      if (response.status === 200) {
        log(`  ✅ Set ${item.key}`, 'green');
      } else {
        log(`  ❌ Failed to set ${item.key}`, 'red');
      }
    } catch (e) {
      log(`  ❌ Error setting ${item.key}: ${e.message}`, 'red');
    }
  }
}

async function getClusterInfo() {
  try {
    const response = await makeRequest('GET', '/api/v1/cluster/info');
    if (response.status === 200) {
      return response.data.data;
    }
  } catch (e) {
    log(`Error getting cluster info: ${e.message}`, 'red');
  }
  return null;
}

async function getShardInfo() {
  try {
    const response = await makeRequest('GET', '/api/v1/shard/stats');
    if (response.status === 200) {
      return response.data.data;
    }
  } catch (e) {
    log(`Error getting shard info: ${e.message}`, 'red');
  }
  return null;
}

async function createMigrationPlan() {
  log('\n🗺️  Creating migration plan...', 'cyan');
  
  try {
    const response = await makeRequest('POST', '/api/v1/migration/plan', {
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      shardIds: ['shard-0', 'shard-1', 'shard-2'],
      reason: 'load_balancing'
    });

    if (response.status === 200) {
      const plan = response.data.data;
      log(`  ✅ Migration plan created: ${plan.id}`, 'green');
      log(`  📋 Plan details:`, 'blue');
      log(`     Source: ${plan.sourceNodeId}`, 'blue');
      log(`     Target: ${plan.targetNodeId}`, 'blue');
      log(`     Shards: ${plan.migrations.length}`, 'blue');
      log(`     Estimated duration: ${plan.estimatedDuration}ms`, 'blue');
      return plan;
    } else {
      log(`  ❌ Failed to create migration plan: ${response.data.error}`, 'red');
      return null;
    }
  } catch (e) {
    log(`  ❌ Error creating migration plan: ${e.message}`, 'red');
    return null;
  }
}

async function startMigration(plan) {
  log('\n🚀 Starting migration...', 'cyan');
  
  try {
    const response = await makeRequest('POST', '/api/v1/migration/start', {
      shardId: plan.migrations[0].shardId,
      targetNodeId: plan.targetNodeId
    });

    if (response.status === 200) {
      const result = response.data.data;
      log(`  ✅ Migration started!`, 'green');
      log(`  📋 Migration details:`, 'blue');
      log(`     Plan ID: ${result.planId}`, 'blue');
      log(`     Operations: ${result.operationIds.length}`, 'blue');
      log(`     Estimated duration: ${result.estimatedDuration}ms`, 'blue');
      return result.operationIds;
    } else {
      log(`  ❌ Failed to start migration: ${response.data.error}`, 'red');
      return null;
    }
  } catch (e) {
    log(`  ❌ Error starting migration: ${e.message}`, 'red');
    return null;
  }
}

async function monitorMigration(operationIds) {
  log('\n👀 Monitoring migration progress...', 'cyan');
  
  const startTime = Date.now();
  const maxWaitTime = 30000; // 30 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await makeRequest('GET', '/api/v1/migration/operations');
      if (response.status === 200) {
        const operations = response.data.data.operations;
        const relevantOps = operations.filter(op => operationIds.includes(op.id));
        
        if (relevantOps.length > 0) {
          log(`  📊 Migration progress:`, 'blue');
          relevantOps.forEach(op => {
            const status = op.status;
            const progress = op.progress;
            const duration = Date.now() - op.startTime;
            
            let statusColor = 'yellow';
            if (status === 'completed') statusColor = 'green';
            else if (status === 'failed') statusColor = 'red';
            else if (status === 'cancelled') statusColor = 'red';
            
            log(`     ${op.id}: ${status} (${progress}%) - ${duration}ms`, statusColor);
          });
          
          // Check if all operations are completed
          const allCompleted = relevantOps.every(op => 
            op.status === 'completed' || op.status === 'failed' || op.status === 'cancelled'
          );
          
          if (allCompleted) {
            log(`  ✅ Migration monitoring complete!`, 'green');
            return relevantOps;
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      log(`  ❌ Error monitoring migration: ${e.message}`, 'red');
      break;
    }
  }
  
  log(`  ⏰ Migration monitoring timeout`, 'yellow');
  return [];
}

async function getMigrationStats() {
  try {
    const response = await makeRequest('GET', '/api/v1/migration/stats');
    if (response.status === 200) {
      return response.data.data;
    }
  } catch (e) {
    log(`Error getting migration stats: ${e.message}`, 'red');
  }
  return null;
}

async function main() {
  log('🚀 NodeNomad Migration Demo', 'bright');
  log('============================', 'bright');
  
  // Wait for server
  const serverReady = await waitForServer();
  if (!serverReady) {
    process.exit(1);
  }
  
  // Setup test data
  await setupTestData();
  
  // Get initial cluster info
  log('\n📊 Initial cluster state:', 'cyan');
  const clusterInfo = await getClusterInfo();
  if (clusterInfo) {
    log(`  Nodes: ${clusterInfo.nodes.length}`, 'blue');
    log(`  Shards: ${clusterInfo.shards.length}`, 'blue');
    log(`  Leader: ${clusterInfo.leader}`, 'blue');
  }
  
  // Get shard info
  const shardInfo = await getShardInfo();
  if (shardInfo) {
    log(`  Total shards: ${shardInfo.stats.totalShards}`, 'blue');
    log(`  Total nodes: ${shardInfo.stats.totalNodes}`, 'blue');
  }
  
  // Create migration plan
  const plan = await createMigrationPlan();
  if (!plan) {
    log('❌ Cannot proceed without migration plan', 'red');
    return;
  }
  
  // Start migration
  const operationIds = await startMigration(plan);
  if (!operationIds) {
    log('❌ Cannot proceed without migration operations', 'red');
    return;
  }
  
  // Monitor migration
  const operations = await monitorMigration(operationIds);
  
  // Get final stats
  log('\n📈 Final migration statistics:', 'cyan');
  const stats = await getMigrationStats();
  if (stats) {
    log(`  Total operations: ${stats.totalOperations}`, 'blue');
    log(`  Completed: ${stats.completed}`, 'green');
    log(`  Failed: ${stats.failed}`, 'red');
    log(`  Success rate: ${stats.successRate.toFixed(1)}%`, 'blue');
    log(`  Total data transferred: ${(stats.totalDataTransferred / 1024).toFixed(2)} KB`, 'blue');
    log(`  Average duration: ${stats.averageDuration.toFixed(0)}ms`, 'blue');
  }
  
  // Get final cluster info
  log('\n📊 Final cluster state:', 'cyan');
  const finalClusterInfo = await getClusterInfo();
  if (finalClusterInfo) {
    log(`  Nodes: ${finalClusterInfo.nodes.length}`, 'blue');
    log(`  Shards: ${finalClusterInfo.shards.length}`, 'blue');
    log(`  Leader: ${finalClusterInfo.leader}`, 'blue');
  }
  
  log('\n🎉 Migration demo complete!', 'green');
  log('NodeNomad successfully demonstrated live data migration!', 'bright');
}

// Run the demo
main().catch(error => {
  log(`❌ Demo failed: ${error.message}`, 'red');
  process.exit(1);
});
