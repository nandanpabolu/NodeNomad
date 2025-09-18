# Multi-stage build for production-ready NodeNomad
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodenomad

# Copy built application
COPY --from=builder --chown=nodenomad:nodejs /app/dist ./dist
COPY --from=deps --chown=nodenomad:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodenomad:nodejs /app/package*.json ./

# Create data directory
RUN mkdir -p /app/data && chown nodenomad:nodejs /app/data

# Switch to non-root user
USER nodenomad

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/index.js"]
