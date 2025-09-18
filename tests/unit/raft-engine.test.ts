/**
 * Unit tests for Raft Engine
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RaftEngine } from '../../src/core/consensus/raft-engine.js';
import type { Command, AppendEntriesRequest, VoteRequest } from '../../src/types/index.js';

describe('RaftEngine', () => {
  let raft: RaftEngine;
  const nodeId = 'test-node';

  beforeEach(() => {
    raft = new RaftEngine(nodeId, 100, 50); // Short timeouts for testing
  });

  afterEach(() => {
    raft.stop();
  });

  describe('Initialization', () => {
    it('should initialize as follower', () => {
      expect(raft.getStatus()).toBe('follower');
      expect(raft.getCurrentTerm()).toBe(0);
      expect(raft.getLeaderId()).toBeNull();
    });

    it('should start and stop correctly', () => {
      raft.start();
      expect(raft.getStatus()).toBe('follower');
      
      raft.stop();
      // Status should remain but timers should be cleared
    });
  });

  describe('Leader Election', () => {
    it('should become candidate and then leader in single node', (done) => {
      let stateChanges = 0;
      
      raft.onStateChangeCallback((status) => {
        stateChanges++;
        
        if (status === 'candidate') {
          expect(raft.getCurrentTerm()).toBe(1);
        } else if (status === 'leader') {
          expect(raft.getCurrentTerm()).toBe(1);
          expect(raft.getLeaderId()).toBe(nodeId);
          expect(raft.isLeader()).toBe(true);
          done();
        }
      });
      
      raft.start();
    }, 5000);
  });

  describe('Log Operations', () => {
    beforeEach(() => {
      raft.start();
    });

    it('should append command to log when leader', (done) => {
      raft.onStateChangeCallback((status) => {
        if (status === 'leader') {
          const command: Command = {
            type: 'set' as const,
            key: 'test-key',
            value: 'test-value',
          };
          
          const entry = raft.appendCommand(command);
          expect(entry.command).toEqual(command);
          expect(entry.term).toBe(1);
          expect(entry.index).toBe(0);
          
          const logEntries = raft.getLogEntries(0);
          expect(logEntries).toHaveLength(1);
          expect(logEntries[0].command.key).toBe('test-key');
          
          done();
        }
      });
    });

    it('should throw error when appending command as non-leader', () => {
      const command: Command = {
        type: 'set' as const,
        key: 'test-key',
        value: 'test-value',
      };
      
      expect(() => {
        raft.appendCommand(command);
      }).toThrow('Only leader can append commands');
    });
  });

  describe('AppendEntries RPC', () => {
    it('should accept AppendEntries from leader', () => {
      const request: AppendEntriesRequest = {
        term: 1,
        leaderId: 'leader-node',
        prevLogIndex: -1,
        prevLogTerm: 0,
        entries: [],
        leaderCommit: 0,
      };
      
      const response = raft.handleAppendEntries(request);
      
      expect(response.success).toBe(true);
      expect(response.term).toBe(1);
      expect(raft.getCurrentTerm()).toBe(1);
      expect(raft.getLeaderId()).toBe('leader-node');
    });

    it('should reject AppendEntries with lower term', () => {
      // First accept a higher term
      const request1: AppendEntriesRequest = {
        term: 2,
        leaderId: 'leader-node',
        prevLogIndex: -1,
        prevLogTerm: 0,
        entries: [],
        leaderCommit: 0,
      };
      
      raft.handleAppendEntries(request1);
      expect(raft.getCurrentTerm()).toBe(2);
      
      // Then reject a lower term
      const request2: AppendEntriesRequest = {
        term: 1,
        leaderId: 'old-leader',
        prevLogIndex: -1,
        prevLogTerm: 0,
        entries: [],
        leaderCommit: 0,
      };
      
      const response = raft.handleAppendEntries(request2);
      
      expect(response.success).toBe(false);
      expect(response.term).toBe(2);
    });

    it('should append new entries', () => {
      const request: AppendEntriesRequest = {
        term: 1,
        leaderId: 'leader-node',
        prevLogIndex: -1,
        prevLogTerm: 0,
        entries: [
          {
            term: 1,
            index: 0,
            command: { type: 'set', key: 'test-key', value: 'test-value' },
            timestamp: Date.now(),
          },
        ],
        leaderCommit: 0,
      };
      
      const response = raft.handleAppendEntries(request);
      
      expect(response.success).toBe(true);
      expect(raft.getLogEntries(0)).toHaveLength(1);
    });
  });

  describe('RequestVote RPC', () => {
    it('should grant vote to candidate', () => {
      const request: VoteRequest = {
        term: 1,
        candidateId: 'candidate-node',
        lastLogIndex: -1,
        lastLogTerm: 0,
      };
      
      const response = raft.handleRequestVote(request);
      
      expect(response.voteGranted).toBe(true);
      expect(response.term).toBe(1);
    });

    it('should reject vote if already voted for someone else', () => {
      // First vote
      const request1: VoteRequest = {
        term: 1,
        candidateId: 'candidate-1',
        lastLogIndex: -1,
        lastLogTerm: 0,
      };
      
      raft.handleRequestVote(request1);
      
      // Second vote should be rejected
      const request2: VoteRequest = {
        term: 1,
        candidateId: 'candidate-2',
        lastLogIndex: -1,
        lastLogTerm: 0,
      };
      
      const response = raft.handleRequestVote(request2);
      
      expect(response.voteGranted).toBe(false);
    });

    it('should grant vote in new term', () => {
      // First vote in term 1
      const request1: VoteRequest = {
        term: 1,
        candidateId: 'candidate-1',
        lastLogIndex: -1,
        lastLogTerm: 0,
      };
      
      raft.handleRequestVote(request1);
      
      // Second vote in term 2 should be granted
      const request2: VoteRequest = {
        term: 2,
        candidateId: 'candidate-2',
        lastLogIndex: -1,
        lastLogTerm: 0,
      };
      
      const response = raft.handleRequestVote(request2);
      
      expect(response.voteGranted).toBe(true);
      expect(raft.getCurrentTerm()).toBe(2);
    });
  });

  describe('Log Consistency', () => {
    it('should check if candidate is up to date', () => {
      // Add some log entries
      const request: AppendEntriesRequest = {
        term: 1,
        leaderId: 'leader-node',
        prevLogIndex: -1,
        prevLogTerm: 0,
        entries: [
          {
            term: 1,
            index: 0,
            command: { type: 'set', key: 'key1', value: 'value1' },
            timestamp: Date.now(),
          },
          {
            term: 1,
            index: 1,
            command: { type: 'set', key: 'key2', value: 'value2' },
            timestamp: Date.now(),
          },
        ],
        leaderCommit: 0,
      };
      
      raft.handleAppendEntries(request);
      
      // Candidate with same log should be up to date
      const voteRequest: VoteRequest = {
        term: 2,
        candidateId: 'candidate-node',
        lastLogIndex: 1,
        lastLogTerm: 1,
      };
      
      const response = raft.handleRequestVote(voteRequest);
      expect(response.voteGranted).toBe(true);
    });
  });
});
