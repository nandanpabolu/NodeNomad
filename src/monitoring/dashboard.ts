#!/usr/bin/env node

/**
 * NodeNomad Monitoring Dashboard
 * Real-time cluster monitoring and visualization
 */

import express from 'express';
import { config } from 'dotenv';

// Load environment variables
config();

const app = express();
const PORT = process.env['DASHBOARD_PORT'] || 8080;
const CLUSTER_NODES = (process.env['CLUSTER_NODES'] || 'node-1:3001,node-2:3002,node-3:3003').split(',');

app.use(express.static('public'));
app.use(express.json());

// Fetch data from a node
async function fetchFromNode(port: number, endpoint: string): Promise<any> {
  try {
    const response = await fetch(`http://localhost:${port}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    return { error: `Node on port ${port} is not responding` };
  }
}

// Get cluster status
app.get('/api/cluster/status', async (req, res) => {
  const nodeStatuses = [];
  
  for (const nodeAddress of CLUSTER_NODES) {
    const [nodeId, port] = nodeAddress.split(':');
    const portNum = parseInt(port);
    
    try {
      const [health, raftStatus, clusterInfo] = await Promise.all([
        fetchFromNode(portNum, '/health'),
        fetchFromNode(portNum, '/raft/status'),
        fetchFromNode(portNum, '/cluster/info')
      ]);
      
      nodeStatuses.push({
        nodeId,
        port: portNum,
        health,
        raftStatus,
        clusterInfo: clusterInfo.data || clusterInfo
      });
    } catch (error) {
      nodeStatuses.push({
        nodeId,
        port: portNum,
        error: 'Node not responding',
        health: null,
        raftStatus: null,
        clusterInfo: null
      });
    }
  }
  
  res.json({
    success: true,
    data: {
      nodes: nodeStatuses,
      timestamp: Date.now()
    }
  });
});

// Get cluster metrics
app.get('/api/cluster/metrics', async (req, res) => {
  const metrics = [];
  
  for (const nodeAddress of CLUSTER_NODES) {
    const [nodeId, port] = nodeAddress.split(':');
    const portNum = parseInt(port);
    
    try {
      const health = await fetchFromNode(portNum, '/health');
      const raftStatus = await fetchFromNode(portNum, '/raft/status');
      
      metrics.push({
        nodeId,
        port: portNum,
        status: raftStatus.data?.status || 'offline',
        term: raftStatus.data?.term || 0,
        logLength: raftStatus.data?.logLength || 0,
        uptime: health.uptime || 0,
        memory: health.memory || null,
        timestamp: Date.now()
      });
    } catch (error) {
      metrics.push({
        nodeId,
        port: portNum,
        status: 'offline',
        term: 0,
        logLength: 0,
        uptime: 0,
        memory: null,
        timestamp: Date.now()
      });
    }
  }
  
  res.json({
    success: true,
    data: {
      metrics,
      timestamp: Date.now()
    }
  });
});

// Test key-value operations
app.post('/api/test/kv', async (req, res) => {
  const { operation, key, value } = req.body;
  
  // Find the leader
  let leaderPort = null;
  for (const nodeAddress of CLUSTER_NODES) {
    const [nodeId, port] = nodeAddress.split(':');
    const portNum = parseInt(port);
    
    try {
      const raftStatus = await fetchFromNode(portNum, '/raft/status');
      if (raftStatus.data?.status === 'leader') {
        leaderPort = portNum;
        break;
      }
    } catch (error) {
      // Node not responding
    }
  }
  
  if (!leaderPort) {
    return res.status(503).json({
      success: false,
      error: 'No leader found in cluster'
    });
  }
  
  try {
    let result;
    switch (operation) {
      case 'set':
        result = await fetch(`http://localhost:${leaderPort}/api/v1/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        });
        break;
      case 'get':
        result = await fetch(`http://localhost:${leaderPort}/api/v1/get/${key}`);
        break;
      case 'delete':
        result = await fetch(`http://localhost:${leaderPort}/api/v1/delete/${key}`, {
          method: 'DELETE'
        });
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid operation'
        });
    }
    
    const data = await result.json();
    res.json({
      success: true,
      data,
      leaderPort
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Serve the dashboard HTML
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NodeNomad Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            text-align: center;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .node-card {
            border-left: 4px solid #e0e0e0;
        }
        .node-card.leader {
            border-left-color: #4caf50;
        }
        .node-card.follower {
            border-left-color: #2196f3;
        }
        .node-card.candidate {
            border-left-color: #ff9800;
        }
        .node-card.offline {
            border-left-color: #f44336;
        }
        .status {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status.leader { background: #e8f5e8; color: #2e7d32; }
        .status.follower { background: #e3f2fd; color: #1565c0; }
        .status.candidate { background: #fff3e0; color: #ef6c00; }
        .status.offline { background: #ffebee; color: #c62828; }
        .kv-test {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-top: 10px;
        }
        .kv-test input, .kv-test button {
            margin: 5px;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .kv-test button {
            background: #667eea;
            color: white;
            border: none;
            cursor: pointer;
        }
        .kv-test button:hover {
            background: #5a6fd8;
        }
        .refresh-btn {
            background: #4caf50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin-bottom: 20px;
        }
        .refresh-btn:hover {
            background: #45a049;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚶‍♂️ NodeNomad Dashboard</h1>
            <p>Distributed Key-Value Store with Raft Consensus</p>
        </div>
        
        <button class="refresh-btn" onclick="refreshData()">🔄 Refresh</button>
        
        <div class="grid" id="clusterGrid">
            <!-- Cluster nodes will be populated here -->
        </div>
        
        <div class="card">
            <h3>🧪 Key-Value Operations Test</h3>
            <div class="kv-test">
                <input type="text" id="testKey" placeholder="Key" value="test-key">
                <input type="text" id="testValue" placeholder="Value" value="test-value">
                <button onclick="testKV('set')">Set</button>
                <button onclick="testKV('get')">Get</button>
                <button onclick="testKV('delete')">Delete</button>
                <div id="kvResult"></div>
            </div>
        </div>
    </div>

    <script>
        async function fetchClusterStatus() {
            try {
                const response = await fetch('/api/cluster/status');
                const data = await response.json();
                return data.data;
            } catch (error) {
                console.error('Failed to fetch cluster status:', error);
                return null;
            }
        }

        function renderClusterStatus(data) {
            const grid = document.getElementById('clusterGrid');
            grid.innerHTML = '';

            if (!data || !data.nodes) {
                grid.innerHTML = '<div class="card"><p>No cluster data available</p></div>';
                return;
            }

            data.nodes.forEach(node => {
                const card = document.createElement('div');
                card.className = 'card node-card';
                
                if (node.raftStatus && node.raftStatus.data) {
                    const status = node.raftStatus.data.status;
                    card.classList.add(status);
                } else {
                    card.classList.add('offline');
                }

                const status = node.raftStatus?.data?.status || 'offline';
                const term = node.raftStatus?.data?.term || 0;
                const logLength = node.raftStatus?.data?.logLength || 0;
                const uptime = node.health?.uptime || 0;

                card.innerHTML = \`
                    <h3>\${node.nodeId}</h3>
                    <p><strong>Port:</strong> \${node.port}</p>
                    <p><strong>Status:</strong> <span class="status \${status}">\${status}</span></p>
                    <p><strong>Term:</strong> \${term}</p>
                    <p><strong>Log Length:</strong> \${logLength}</p>
                    <p><strong>Uptime:</strong> \${Math.round(uptime)}s</p>
                    <p><strong>Memory:</strong> \${node.health?.memory ? Math.round(node.health.memory.heapUsed / 1024 / 1024) + 'MB' : 'N/A'}</p>
                \`;

                grid.appendChild(card);
            });
        }

        async function refreshData() {
            const data = await fetchClusterStatus();
            renderClusterStatus(data);
        }

        async function testKV(operation) {
            const key = document.getElementById('testKey').value;
            const value = document.getElementById('testValue').value;
            const resultDiv = document.getElementById('kvResult');

            try {
                const response = await fetch('/api/test/kv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ operation, key, value })
                });

                const data = await response.json();
                resultDiv.innerHTML = \`
                    <div style="margin-top: 10px; padding: 10px; background: \${data.success ? '#e8f5e8' : '#ffebee'}; border-radius: 4px;">
                        <strong>\${operation.toUpperCase()}</strong> - \${data.success ? 'Success' : 'Failed'}<br>
                        <pre>\${JSON.stringify(data.data, null, 2)}</pre>
                    </div>
                \`;
            } catch (error) {
                resultDiv.innerHTML = \`
                    <div style="margin-top: 10px; padding: 10px; background: #ffebee; border-radius: 4px;">
                        <strong>Error:</strong> \${error.message}
                    </div>
                \`;
            }
        }

        // Initial load
        refreshData();
        
        // Auto-refresh every 5 seconds
        setInterval(refreshData, 5000);
    </script>
</body>
</html>
  `);
});

// Start the dashboard
app.listen(PORT, () => {
  console.log(`📊 NodeNomad Dashboard started!`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🔗 Dashboard: http://localhost:${PORT}`);
  console.log(`📡 Monitoring: ${CLUSTER_NODES.length} nodes`);
});

export default app;
