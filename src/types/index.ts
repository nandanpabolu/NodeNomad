/**
 * Core types and interfaces for NodeNomad
 * A distributed key-value store with migrating nodes
 */

// ============================================================================
// Basic Types
// ============================================================================

export type NodeId = string;
export type Key = string;
export type Value = string | Buffer;
export type Timestamp = number;
export type Term = number;
export type LogIndex = number;

// ============================================================================
// Node and Cluster Types
// ============================================================================

export interface Node {
  id: NodeId;
  address: string;
  port: number;
  status: NodeStatus;
  lastSeen: Timestamp;
  metadata: NodeMetadata;
}

export enum NodeStatus {
  LEADER = 'leader',
  FOLLOWER = 'follower',
  CANDIDATE = 'candidate',
  MIGRATING = 'migrating',
  OFFLINE = 'offline',
}

export interface NodeMetadata {
  version: string;
  capabilities: string[];
  load: number;
  shards: ShardId[];
  migrationStatus?: MigrationStatus;
}

export type ShardId = string;

// ============================================================================
// Raft Consensus Types
// ============================================================================

export interface RaftState {
  currentTerm: Term;
  votedFor: NodeId | null;
  log: LogEntry[];
  commitIndex: LogIndex;
  lastApplied: LogIndex;
  nextIndex: Map<NodeId, LogIndex>;
  matchIndex: Map<NodeId, LogIndex>;
}

export interface LogEntry {
  term: Term;
  index: LogIndex;
  command: Command;
  timestamp: Timestamp;
}

export interface Command {
  type: CommandType;
  key?: Key;
  value?: Value;
  shardId?: ShardId;
  migrationData?: MigrationData;
}

export enum CommandType {
  SET = 'set',
  DELETE = 'delete',
  MIGRATE_SHARD = 'migrate_shard',
  UPDATE_MEMBERSHIP = 'update_membership',
  HEARTBEAT = 'heartbeat',
}

// ============================================================================
// Raft RPC Types
// ============================================================================

export interface AppendEntriesRequest {
  term: Term;
  leaderId: NodeId;
  prevLogIndex: LogIndex;
  prevLogTerm: Term;
  entries: LogEntry[];
  leaderCommit: LogIndex;
}

export interface AppendEntriesResponse {
  term: Term;
  success: boolean;
  lastLogIndex: LogIndex;
}

export interface VoteRequest {
  term: Term;
  candidateId: NodeId;
  lastLogIndex: LogIndex;
  lastLogTerm: Term;
}

export interface VoteResponse {
  term: Term;
  voteGranted: boolean;
}

// ============================================================================
// Sharding Types
// ============================================================================

export interface Shard {
  id: ShardId;
  range: HashRange;
  nodes: NodeId[];
  status: ShardStatus;
  data: Map<Key, Value>;
  lastUpdated: Timestamp;
}

export interface HashRange {
  start: number;
  end: number;
}

export enum ShardStatus {
  ACTIVE = 'active',
  MIGRATING = 'migrating',
  INACTIVE = 'inactive',
}

export interface VirtualNode {
  id: string;
  physicalNodeId: NodeId;
  hash: number;
  shardId: ShardId;
}

// ============================================================================
// Migration Types (The "Nomad" Feature)
// ============================================================================

export interface MigrationPlan {
  id: string;
  shardId: ShardId;
  sourceNodeId: NodeId;
  targetNodeId: NodeId;
  status: MigrationStatus;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  data: MigrationData;
}

export enum MigrationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

export interface MigrationData {
  keys: Key[];
  values: Map<Key, Value>;
  metadata: Map<Key, any>;
  checksum: string;
}

// ============================================================================
// API Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Timestamp;
  nodeId: NodeId;
}

export interface SetRequest {
  key: Key;
  value: Value;
  ttl?: number;
}

export interface GetRequest {
  key: Key;
}

export interface DeleteRequest {
  key: Key;
}

export interface ClusterInfo {
  nodes: Node[];
  leader: NodeId | null;
  shards: Shard[];
  migrations: MigrationPlan[];
  metrics: ClusterMetrics;
}

export interface ClusterMetrics {
  totalNodes: number;
  activeNodes: number;
  totalShards: number;
  activeShards: number;
  totalKeys: number;
  averageLoad: number;
  uptime: number;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageEngine {
  get(key: Key): Promise<Value | null>;
  set(key: Key, value: Value, ttl?: number): Promise<void>;
  delete(key: Key): Promise<boolean>;
  has(key: Key): Promise<boolean>;
  keys(): Promise<Key[]>;
  clear(): Promise<void>;
  size(): Promise<number>;
  close(): Promise<void>;
}

export interface WriteAheadLog {
  append(entry: LogEntry): Promise<void>;
  get(index: LogIndex): Promise<LogEntry | null>;
  getRange(start: LogIndex, end: LogIndex): Promise<LogEntry[]>;
  truncate(index: LogIndex): Promise<void>;
  close(): Promise<void>;
}

// ============================================================================
// Event Types
// ============================================================================

export interface ClusterEvent {
  type: ClusterEventType;
  timestamp: Timestamp;
  nodeId: NodeId;
  data: any;
}

export enum ClusterEventType {
  NODE_JOINED = 'node_joined',
  NODE_LEFT = 'node_left',
  LEADER_ELECTED = 'leader_elected',
  SHARD_MIGRATED = 'shard_migrated',
  MIGRATION_STARTED = 'migration_started',
  MIGRATION_COMPLETED = 'migration_completed',
  MIGRATION_FAILED = 'migration_failed',
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface NodeConfig {
  id: NodeId;
  port: number;
  host: string;
  clusterNodes: string[];
  logLevel: LogLevel;
  dataDir: string;
  maxLogSize: number;
  heartbeatInterval: number;
  electionTimeout: number;
  replicationFactor: number;
  shardCount: number;
  virtualNodesPerShard: number;
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

// ============================================================================
// Error Types
// ============================================================================

export class NodeNomadError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'NodeNomadError';
  }
}

export class ConsensusError extends NodeNomadError {
  constructor(message: string) {
    super(message, 'CONSENSUS_ERROR', 503);
  }
}

export class ShardError extends NodeNomadError {
  constructor(message: string) {
    super(message, 'SHARD_ERROR', 400);
  }
}

export class MigrationError extends NodeNomadError {
  constructor(message: string) {
    super(message, 'MIGRATION_ERROR', 409);
  }
}
