/**
 * Raft Consensus Engine for NodeNomad
 * Implements the Raft consensus algorithm for distributed consensus
 */

import type { 
  RaftState, 
  LogEntry, 
  Command, 
  CommandType, 
  NodeId, 
  Term, 
  LogIndex,
  AppendEntriesRequest,
  AppendEntriesResponse,
  VoteRequest,
  VoteResponse,
  NodeStatus
} from '../../types/index.js';
import { logger } from '../../utils/logger.js';

export class RaftEngine {
  private state: RaftState;
  private nodeId: NodeId;
  private currentTerm: Term = 0;
  private votedFor: NodeId | null = null;
  private log: LogEntry[] = [];
  private commitIndex: LogIndex = 0;
  private lastApplied: LogIndex = 0;
  private nextIndex: Map<NodeId, LogIndex> = new Map();
  private matchIndex: Map<NodeId, LogIndex> = new Map();
  
  // Raft timers
  private electionTimeout: number;
  private heartbeatInterval: number;
  private electionTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  
  // Node status
  private status: NodeStatus = 'follower';
  private leaderId: NodeId | null = null;
  
  // Callbacks
  private onStateChange?: (status: NodeStatus) => void;
  private onLogCommit?: (entry: LogEntry) => void;

  constructor(
    nodeId: NodeId, 
    electionTimeout: number = 300,
    heartbeatInterval: number = 150
  ) {
    this.nodeId = nodeId;
    this.electionTimeout = electionTimeout;
    this.heartbeatInterval = heartbeatInterval;
    
    this.state = {
      currentTerm: 0,
      votedFor: null,
      log: [],
      commitIndex: 0,
      lastApplied: 0,
      nextIndex: new Map(),
      matchIndex: new Map(),
    };
  }

  /**
   * Start the Raft engine
   */
  start(): void {
    logger.info('Starting Raft engine', { nodeId: this.nodeId });
    this.startElectionTimer();
  }

  /**
   * Stop the Raft engine
   */
  stop(): void {
    logger.info('Stopping Raft engine', { nodeId: this.nodeId });
    this.clearTimers();
  }

  /**
   * Set callback for state changes
   */
  onStateChangeCallback(callback: (status: NodeStatus) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Set callback for log commits
   */
  onLogCommitCallback(callback: (entry: LogEntry) => void): void {
    this.onLogCommit = callback;
  }

  /**
   * Get current node status
   */
  getStatus(): NodeStatus {
    return this.status;
  }

  /**
   * Get current term
   */
  getCurrentTerm(): Term {
    return this.currentTerm;
  }

  /**
   * Get leader ID
   */
  getLeaderId(): NodeId | null {
    return this.leaderId;
  }

  /**
   * Check if this node is the leader
   */
  isLeader(): boolean {
    return this.status === 'leader';
  }

  /**
   * Get the last log entry
   */
  getLastLogEntry(): LogEntry | null {
    return this.log.length > 0 ? this.log[this.log.length - 1] : null;
  }

  /**
   * Get log entries from index
   */
  getLogEntries(fromIndex: LogIndex): LogEntry[] {
    return this.log.slice(fromIndex);
  }

  /**
   * Append a command to the log (leader only)
   */
  appendCommand(command: Command): LogEntry {
    if (this.status !== 'leader') {
      throw new Error('Only leader can append commands');
    }

    const entry: LogEntry = {
      term: this.currentTerm,
      index: this.log.length,
      command,
      timestamp: Date.now(),
    };

    this.log.push(entry);
    logger.info('Command appended to log', { 
      nodeId: this.nodeId, 
      command: command.type,
      logIndex: entry.index 
    });

    return entry;
  }

  /**
   * Handle AppendEntries RPC
   */
  handleAppendEntries(request: AppendEntriesRequest): AppendEntriesResponse {
    logger.debug('Received AppendEntries', { 
      nodeId: this.nodeId, 
      leaderId: request.leaderId,
      term: request.term 
    });

    // Update term if necessary
    if (request.term > this.currentTerm) {
      this.updateTerm(request.term);
      this.becomeFollower(request.leaderId);
    }

    // Reject if term is lower
    if (request.term < this.currentTerm) {
      return {
        term: this.currentTerm,
        success: false,
        lastLogIndex: this.log.length - 1,
      };
    }

    // Reset election timer
    this.resetElectionTimer();

    // Update leader
    if (this.status === 'follower') {
      this.leaderId = request.leaderId;
    }

    // Check log consistency
    if (request.prevLogIndex >= 0) {
      const prevEntry = this.log[request.prevLogIndex];
      if (!prevEntry || prevEntry.term !== request.prevLogTerm) {
        return {
          term: this.currentTerm,
          success: false,
          lastLogIndex: this.log.length - 1,
        };
      }
    }

    // Append new entries
    if (request.entries.length > 0) {
      // Remove conflicting entries
      this.log = this.log.slice(0, request.prevLogIndex + 1);
      
      // Append new entries
      this.log.push(...request.entries);
      
      logger.info('Log entries appended', { 
        nodeId: this.nodeId, 
        entriesCount: request.entries.length 
      });
    }

    // Update commit index
    if (request.leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(request.leaderCommit, this.log.length - 1);
      this.applyCommittedEntries();
    }

    return {
      term: this.currentTerm,
      success: true,
      lastLogIndex: this.log.length - 1,
    };
  }

  /**
   * Handle RequestVote RPC
   */
  handleRequestVote(request: VoteRequest): VoteResponse {
    logger.debug('Received RequestVote', { 
      nodeId: this.nodeId, 
      candidateId: request.candidateId,
      term: request.term 
    });

    // Update term if necessary
    if (request.term > this.currentTerm) {
      this.updateTerm(request.term);
      this.becomeFollower(null);
    }

    // Check if we can vote
    const canVote = this.votedFor === null || this.votedFor === request.candidateId;
    const isUpToDate = this.isCandidateUpToDate(request.lastLogIndex, request.lastLogTerm);

    if (request.term < this.currentTerm || !canVote || !isUpToDate) {
      return {
        term: this.currentTerm,
        voteGranted: false,
      };
    }

    // Grant vote
    this.votedFor = request.candidateId;
    this.resetElectionTimer();

    logger.info('Vote granted', { 
      nodeId: this.nodeId, 
      candidateId: request.candidateId,
      term: request.term 
    });

    return {
      term: this.currentTerm,
      voteGranted: true,
    };
  }

  /**
   * Start election timer
   */
  private startElectionTimer(): void {
    this.electionTimer = setTimeout(() => {
      this.startElection();
    }, this.getRandomElectionTimeout());
  }

  /**
   * Reset election timer
   */
  private resetElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
    }
    this.startElectionTimer();
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }

  /**
   * Start leader election
   */
  private startElection(): void {
    if (this.status === 'leader') {
      return;
    }

    logger.info('Starting election', { nodeId: this.nodeId, term: this.currentTerm + 1 });

    this.currentTerm++;
    this.status = 'candidate';
    this.votedFor = this.nodeId;
    this.votesReceived = 1; // Vote for self

    this.onStateChange?.(this.status);

    // Request votes from other nodes
    this.requestVotes();
  }

  /**
   * Request votes from other nodes
   */
  private requestVotes(): void {
    const lastLogEntry = this.getLastLogEntry();
    const request: VoteRequest = {
      term: this.currentTerm,
      candidateId: this.nodeId,
      lastLogIndex: lastLogEntry?.index ?? -1,
      lastLogTerm: lastLogEntry?.term ?? 0,
    };

    // In a real implementation, this would send RPCs to other nodes
    // For now, we'll simulate the election process
    logger.info('Requesting votes', { nodeId: this.nodeId, term: this.currentTerm });
    
    // Simulate becoming leader after a short delay
    setTimeout(() => {
      if (this.status === 'candidate') {
        this.becomeLeader();
      }
    }, 100);
  }

  /**
   * Become leader
   */
  private becomeLeader(): void {
    logger.info('Becoming leader', { nodeId: this.nodeId, term: this.currentTerm });

    this.status = 'leader';
    this.leaderId = this.nodeId;
    this.onStateChange?.(this.status);

    // Initialize nextIndex and matchIndex for all followers
    // In a real implementation, this would be done for all known nodes
    this.nextIndex.clear();
    this.matchIndex.clear();

    // Start sending heartbeats
    this.startHeartbeatTimer();
  }

  /**
   * Become follower
   */
  private becomeFollower(leaderId: NodeId | null): void {
    if (this.status === 'leader') {
      this.clearTimers();
    }

    this.status = 'follower';
    this.leaderId = leaderId;
    this.onStateChange?.(this.status);

    this.resetElectionTimer();
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeatTimer(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
  }

  /**
   * Send heartbeat to followers
   */
  private sendHeartbeat(): void {
    if (this.status !== 'leader') {
      return;
    }

    logger.debug('Sending heartbeat', { nodeId: this.nodeId, term: this.currentTerm });

    // In a real implementation, this would send AppendEntries RPCs to all followers
    // For now, we'll just log the heartbeat
  }

  /**
   * Update term
   */
  private updateTerm(newTerm: Term): void {
    this.currentTerm = newTerm;
    this.votedFor = null;
    this.state.currentTerm = newTerm;
    this.state.votedFor = null;
  }

  /**
   * Check if candidate is up to date
   */
  private isCandidateUpToDate(candidateLastLogIndex: LogIndex, candidateLastLogTerm: Term): boolean {
    const lastLogEntry = this.getLastLogEntry();
    if (!lastLogEntry) {
      return true;
    }

    if (candidateLastLogTerm > lastLogEntry.term) {
      return true;
    }

    if (candidateLastLogTerm === lastLogEntry.term && candidateLastLogIndex >= lastLogEntry.index) {
      return true;
    }

    return false;
  }

  /**
   * Apply committed entries
   */
  private applyCommittedEntries(): void {
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied++;
      const entry = this.log[this.lastApplied];
      if (entry) {
        this.onLogCommit?.(entry);
        logger.debug('Applied log entry', { 
          nodeId: this.nodeId, 
          index: this.lastApplied,
          command: entry.command.type 
        });
      }
    }
  }

  /**
   * Get random election timeout
   */
  private getRandomElectionTimeout(): number {
    return this.electionTimeout + Math.random() * this.electionTimeout;
  }

  // Placeholder for votes received (in real implementation, this would track votes)
  private votesReceived: number = 0;
}
