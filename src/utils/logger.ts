/**
 * Centralized logging utility for NodeNomad
 * Uses Winston for structured logging with multiple transports
 */

import winston from 'winston';
import { LogLevel } from '../types/index.js';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || LogLevel.INFO,
  format: logFormat,
  defaultMeta: {
    service: 'nodenomad',
    version: '1.0.0',
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: process.env['NODE_ENV'] === 'development' ? consoleFormat : logFormat,
    }),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

// Add file transport in production
if (process.env['NODE_ENV'] === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create child loggers for different components
export const createComponentLogger = (component: string) => {
  return logger.child({ component });
};

// Logging utilities
export const logPerformance = (operation: string, startTime: number, metadata?: any) => {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation}`, {
    operation,
    duration: `${duration}ms`,
    ...metadata,
  });
};

export const logClusterEvent = (event: string, nodeId: string, data?: any) => {
  logger.info(`Cluster Event: ${event}`, {
    event,
    nodeId,
    timestamp: Date.now(),
    ...data,
  });
};

export const logRaftEvent = (event: string, term: number, nodeId: string, data?: any) => {
  logger.info(`Raft Event: ${event}`, {
    event,
    term,
    nodeId,
    timestamp: Date.now(),
    ...data,
  });
};

export const logMigrationEvent = (event: string, migrationId: string, data?: any) => {
  logger.info(`Migration Event: ${event}`, {
    event,
    migrationId,
    timestamp: Date.now(),
    ...data,
  });
};

export const logShardEvent = (event: string, shardId: string, data?: any) => {
  logger.info(`Shard Event: ${event}`, {
    event,
    shardId,
    timestamp: Date.now(),
    ...data,
  });
};

// Performance monitoring decorator
export const logExecutionTime = (operation: string) => {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      try {
        const result = await method.apply(this, args);
        logPerformance(operation, startTime, { success: true });
        return result;
      } catch (error) {
        logPerformance(operation, startTime, { success: false, error: error.message });
        throw error;
      }
    };
  };
};

export default logger;
