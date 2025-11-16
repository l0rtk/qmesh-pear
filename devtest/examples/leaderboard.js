#!/usr/bin/env node

/**
 * Live Global Leaderboard Monitor
 * Connects to the score sharing network to display real-time rankings
 */

import Hyperswarm from 'hyperswarm';
import { GlobalScoreManager } from '../lib/global-score-manager.js';
import crypto from 'crypto';

class LiveLeaderboardMonitor {
  constructor() {
    this.swarm = null;
    this.globalScoreManager = new GlobalScoreManager();
    this.connections = new Map();
    this.monitorId = crypto.randomBytes(16).toString('hex');
  }

  async start() {
    console.log('🏆 Live Global Leaderboard Monitor');
    console.log('===================================\n');
    console.log('Connecting to score network...');

    this.swarm = new Hyperswarm();

    // Handle connections
    this.swarm.on('connection', (connection, info) => {
      const peerId = info.publicKey.toString('hex').substring(0, 8);
      console.log(`📊 Connected to worker: ${peerId}`);

      this.connections.set(peerId, connection);
      this.handleConnection(connection, peerId);

      connection.on('close', () => {
        console.log(`📊 Disconnected from worker: ${peerId}`);
        this.connections.delete(peerId);
      });

      // Request scores from worker
      setTimeout(() => {
        this.sendMessage(connection, {
          type: 'score_request',
          workerId: this.monitorId
        });
      }, 500);
    });

    // Join score sharing topic
    const scoreTopic = Buffer.alloc(32).fill('qmesh-scores-network-v1');
    const discovery = this.swarm.join(scoreTopic, { client: true, server: false });

    await discovery.flushed();
    console.log('✅ Connected to score network!\n');

    // Display leaderboard every 5 seconds
    setInterval(() => this.displayLeaderboard(), 5000);

    // Initial display
    setTimeout(() => this.displayLeaderboard(), 2000);
  }

  handleConnection(connection, peerId) {
    let buffer = Buffer.alloc(0);

    connection.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 4) {
        const messageLength = buffer.readUInt32BE(0);

        if (buffer.length >= messageLength + 4) {
          const messageData = buffer.slice(4, messageLength + 4);
          buffer = buffer.slice(messageLength + 4);

          try {
            const message = JSON.parse(messageData.toString());
            this.handleMessage(message, peerId);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        } else {
          break;
        }
      }
    });
  }

  handleMessage(message, peerId) {
    switch (message.type) {
      case 'score_announce':
      case 'score_response':
        if (message.data) {
          this.globalScoreManager.updatePeerScore(message.data);
        }
        break;

      case 'leaderboard_sync':
        if (message.scores && Array.isArray(message.scores)) {
          this.globalScoreManager.updateMultiplePeerScores(message.scores);
        }
        break;
    }
  }

  sendMessage(connection, message) {
    try {
      const data = Buffer.from(JSON.stringify(message));
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length, 0);
      connection.write(Buffer.concat([length, data]));
    } catch (error) {
      // Connection might be closed
    }
  }

  displayLeaderboard() {
    console.clear();
    console.log('🏆 QMesh Global Leaderboard - Live');
    console.log('===================================');
    console.log(new Date().toLocaleTimeString());
    console.log(`Connected to ${this.connections.size} workers\n`);

    const leaderboard = this.globalScoreManager.getGlobalLeaderboard(null, 10);

    if (leaderboard.length === 0) {
      console.log('   Waiting for workers to share scores...\n');
      console.log('   Make sure workers are running with score sharing enabled.');
      return;
    }

    console.log('📊 Top Workers:\n');

    leaderboard.forEach((worker, index) => {
      const medal = index === 0 ? '🥇' :
                    index === 1 ? '🥈' :
                    index === 2 ? '🥉' : '  ';

      // Get health status emoji
      const healthEmoji = worker.system?.status === 'idle' ? '🟢' :
                         worker.system?.status === 'light' ? '🟢' :
                         worker.system?.status === 'moderate' ? '🟡' :
                         worker.system?.status === 'busy' ? '🟠' :
                         worker.system?.status === 'overloaded' ? '🔴' : '⚪';

      console.log(`${medal} #${worker.rank}. Worker ${worker.workerId.substring(0, 8)}... ${healthEmoji}`);
      console.log(`      Score: ${worker.totalScore || 0} points | Level: ${worker.level || 'Bronze'}`);

      // Show system health if available
      if (worker.system) {
        const queue = `${worker.system.queueLength || 0}/${worker.system.maxQueue || 5}`;
        console.log(`      System: CPU ${worker.system.cpuUsage || 0}% | Mem ${worker.system.memoryUsage || 0}% | Queue ${queue}`);
        console.log(`      Status: ${worker.system.status || 'unknown'} | Accepting: ${worker.system.isAccepting ? 'Yes' : 'No'}`);
      }

      if (worker.requestCount) {
        const successRate = worker.successRate ? (worker.successRate * 100).toFixed(1) : '0.0';
        console.log(`      Stats: ${worker.requestCount} requests | ${successRate}% success`);

        if (worker.averageResponseTime) {
          console.log(`      Avg Response: ${worker.averageResponseTime}ms`);
        }
      }

      if (worker.achievements && worker.achievements.length > 0) {
        console.log(`      🏅 ${worker.achievements.join(', ')}`);
      }

      console.log('');
    });

    const stats = this.globalScoreManager.getNetworkStats();
    console.log('📈 Network Statistics:');
    console.log(`   Total Workers: ${stats.totalWorkers}`);
    console.log(`   Average Score: ${stats.averageScore}`);
    console.log(`   Total Requests: ${stats.totalRequests}`);
    console.log(`   Top Score: ${stats.topScore}`);
    console.log(`   Network Success Rate: ${(stats.networkSuccessRate * 100).toFixed(1)}%`);

    console.log('\n🔄 Updates every 5 seconds | Press Ctrl+C to exit');
  }

  async shutdown() {
    console.log('\n👋 Shutting down monitor...');

    // Close connections
    for (const [peerId, connection] of this.connections) {
      connection.end();
    }

    // Leave swarm
    if (this.swarm) {
      await this.swarm.destroy();
    }

    process.exit(0);
  }
}

// Main execution
async function main() {
  const monitor = new LiveLeaderboardMonitor();

  // Handle shutdown
  process.on('SIGINT', () => monitor.shutdown());
  process.on('SIGTERM', () => monitor.shutdown());

  try {
    await monitor.start();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);