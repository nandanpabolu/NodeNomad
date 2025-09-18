# 🚀 NodeNomad Deployment Guide

## Overview

This guide covers different deployment strategies for NodeNomad, from local development to production clusters.

## Prerequisites

- Node.js 18+
- Docker (optional)
- Docker Compose (optional)

## Local Development

### Single Node

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

### Multi-Node Cluster

```bash
# Terminal 1 - Node 1
NODE_ID=node-1 NODE_PORT=3000 npm start

# Terminal 2 - Node 2
NODE_ID=node-2 NODE_PORT=3001 npm start

# Terminal 3 - Node 3
NODE_ID=node-3 NODE_PORT=3002 npm start
```

## Docker Deployment

### Single Container

```bash
# Build the image
docker build -t nodenomad .

# Run the container
docker run -p 3000:3000 nodenomad
```

### Multi-Container Cluster

```bash
# Start the cluster
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop the cluster
docker-compose down
```

## Production Deployment

### Environment Configuration

Create a `.env` file:

```bash
# Node configuration
NODE_ID=node-1
NODE_PORT=3000
CLUSTER_NODES=node-1:3000,node-2:3000,node-3:3000

# Storage configuration
DATA_DIR=/data
WAL_DIR=/wal
MAX_WAL_SIZE=1GB

# Migration configuration
MAX_CONCURRENT_MIGRATIONS=3
MIGRATION_CHUNK_SIZE=1MB
MIGRATION_TIMEOUT=30s

# Monitoring
ENABLE_MONITORING=true
MONITORING_PORT=3001
```

### System Requirements

#### Minimum Requirements

- **CPU**: 2 cores
- **RAM**: 4GB
- **Disk**: 10GB SSD
- **Network**: 1Gbps

#### Recommended Requirements

- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Disk**: 50GB+ SSD
- **Network**: 10Gbps

### Process Management

#### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start the application
pm2 start src/raft-server.ts --name nodenomad

# Monitor
pm2 monit

# Stop
pm2 stop nodenomad
```

#### Using systemd

Create `/etc/systemd/system/nodenomad.service`:

```ini
[Unit]
Description=NodeNomad Distributed Key-Value Store
After=network.target

[Service]
Type=simple
User=nodenomad
WorkingDirectory=/opt/nodenomad
ExecStart=/usr/bin/node src/raft-server.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable nodenomad
sudo systemctl start nodenomad
```

### Load Balancing

#### Using Nginx

```nginx
upstream nodenomad {
    server node-1:3000;
    server node-2:3000;
    server node-3:3000;
}

server {
    listen 80;
    server_name nodenomad.example.com;

    location / {
        proxy_pass http://nodenomad;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### Using HAProxy

```haproxy
global
    daemon

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

frontend nodenomad_frontend
    bind *:80
    default_backend nodenomad_backend

backend nodenomad_backend
    balance roundrobin
    server node1 node-1:3000 check
    server node2 node-2:3000 check
    server node3 node-3:3000 check
```

### Monitoring

#### Prometheus Configuration

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nodenomad'
    static_configs:
      - targets: ['node-1:3000', 'node-2:3000', 'node-3:3000']
```

#### Grafana Dashboard

Import the NodeNomad dashboard JSON configuration to visualize metrics.

### Security

#### Firewall Configuration

```bash
# Allow HTTP traffic
sudo ufw allow 3000/tcp

# Allow cluster communication
sudo ufw allow 3001:3002/tcp

# Allow monitoring
sudo ufw allow 9090/tcp
```

#### SSL/TLS

```bash
# Generate certificates
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Update environment
SSL_CERT=cert.pem
SSL_KEY=key.pem
```

### Backup and Recovery

#### Data Backup

```bash
# Backup data directory
tar -czf nodenomad-backup-$(date +%Y%m%d).tar.gz /data

# Backup WAL
tar -czf nodenomad-wal-$(date +%Y%m%d).tar.gz /wal
```

#### Recovery

```bash
# Stop the service
sudo systemctl stop nodenomad

# Restore data
tar -xzf nodenomad-backup-20240101.tar.gz -C /

# Restore WAL
tar -xzf nodenomad-wal-20240101.tar.gz -C /

# Start the service
sudo systemctl start nodenomad
```

### Scaling

#### Horizontal Scaling

1. **Add New Node**:
   ```bash
   NODE_ID=node-4 NODE_PORT=3003 npm start
   ```

2. **Update Cluster Configuration**:
   ```bash
   CLUSTER_NODES=node-1:3000,node-2:3000,node-3:3000,node-4:3000
   ```

3. **Rebalance Shards**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/shard/rebalance
   ```

#### Vertical Scaling

1. **Increase Memory**:
   ```bash
   NODE_OPTIONS="--max-old-space-size=8192" npm start
   ```

2. **Increase CPU**:
   - Add more CPU cores
   - Update cluster configuration

### Troubleshooting

#### Common Issues

1. **Node Won't Start**:
   - Check port availability
   - Verify environment variables
   - Check disk space

2. **Cluster Split-brain**:
   - Check network connectivity
   - Verify cluster configuration
   - Restart nodes

3. **High Memory Usage**:
   - Check for memory leaks
   - Increase heap size
   - Monitor garbage collection

#### Debug Commands

```bash
# Check node status
curl http://localhost:3000/health

# Check cluster info
curl http://localhost:3000/api/v1/cluster/info

# Check migration status
curl http://localhost:3000/api/v1/migration/status

# View logs
tail -f /var/log/nodenomad.log
```

### Performance Tuning

#### Node.js Optimization

```bash
# Increase heap size
NODE_OPTIONS="--max-old-space-size=4096"

# Enable V8 optimization
NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"

# Enable garbage collection logging
NODE_OPTIONS="--max-old-space-size=4096 --trace-gc"
```

#### System Optimization

```bash
# Increase file descriptor limit
ulimit -n 65536

# Optimize TCP settings
echo 'net.core.somaxconn = 65536' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_max_syn_backlog = 65536' >> /etc/sysctl.conf
sysctl -p
```

### Health Checks

#### Application Health

```bash
# Basic health check
curl -f http://localhost:3000/health || exit 1

# Detailed health check
curl -f http://localhost:3000/api/v1/cluster/info || exit 1
```

#### System Health

```bash
# Check disk space
df -h | grep -E "(Filesystem|/data|/wal)"

# Check memory usage
free -h

# Check CPU usage
top -p $(pgrep -f nodenomad)
```

### Maintenance

#### Regular Maintenance

1. **Daily**:
   - Check cluster health
   - Monitor disk space
   - Review logs

2. **Weekly**:
   - Backup data
   - Update dependencies
   - Performance analysis

3. **Monthly**:
   - Security updates
   - Capacity planning
   - Disaster recovery testing

#### Log Rotation

```bash
# Configure logrotate
cat > /etc/logrotate.d/nodenomad << EOF
/var/log/nodenomad/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 nodenomad nodenomad
}
EOF
```

### Disaster Recovery

#### Backup Strategy

1. **Full Backup**: Daily full backup of data and WAL
2. **Incremental Backup**: Hourly incremental backup
3. **Offsite Backup**: Weekly offsite backup
4. **Test Recovery**: Monthly recovery testing

#### Recovery Procedures

1. **Single Node Failure**:
   - Remove failed node from cluster
   - Add replacement node
   - Rebalance shards

2. **Cluster Failure**:
   - Restore from backup
   - Rebuild cluster
   - Verify data integrity

3. **Data Corruption**:
   - Stop affected nodes
   - Restore from backup
   - Rebuild affected shards

### Monitoring and Alerting

#### Key Metrics

- **Performance**: Ops/sec, latency, error rate
- **Cluster**: Node health, shard distribution
- **Storage**: Disk usage, WAL size
- **Migration**: Migration progress, success rate

#### Alert Rules

```yaml
# Prometheus alert rules
groups:
  - name: nodenomad
    rules:
      - alert: NodeDown
        expr: up{job="nodenomad"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "NodeNomad node is down"
      
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
```

This deployment guide provides comprehensive instructions for deploying NodeNomad in various environments, from development to production.
