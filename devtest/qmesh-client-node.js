import Hyperswarm from 'hyperswarm';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { GlobalScoreManager } from './lib/global-score-manager.js';
import { existsSync, readFileSync } from 'fs';

/**
 * QMeshClient for Node.js - Uses native crypto
 */
class QMeshClient extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.timeout = options.timeout || 30000;
    this.silent = options.silent === true;
    this.autoReconnect = options.autoReconnect || false;

    // State
    this.swarm = null;
    this.customerId = this.getOrCreateClientId();
    this.connections = new Map();
    this.pendingRequests = new Map();
    this.activeWorkers = new Map();
    this.isConnected = false;
    this.myScore = 0; // Will be loaded from network

    // Score and health tracking
    this.globalScoreManager = new GlobalScoreManager(this.silent);
    this.scoreSwarm = null;
    this.healthCheckInterval = null;

    // Statistics
    this.stats = {
      requestsProcessed: 0,
      totalResponseTime: 0,
      failedRequests: 0,
      avgResponseTime: 0
    };
  }

  getOrCreateClientId() {
    // Use the same worker ID for unified identity
    const workerIdFile = './worker-id.txt';

    try {
      if (existsSync(workerIdFile)) {
        const id = readFileSync(workerIdFile, 'utf8').trim();
        if (!this.silent) {
          console.log(`🔑 Using existing worker ID as client: ${id.substring(0, 8)}...`);
        }
        return id;
      }
    } catch (e) {
      // File doesn't exist or can't be read
    }

    // Generate new ID if no worker ID exists
    const newId = crypto.randomBytes(16).toString('hex');
    if (!this.silent) {
      console.log(`🆕 Generated new client ID: ${newId.substring(0, 8)}... (Run as worker to earn priority)`);
    }
    return newId;
  }

  async connect() {
    if (this.isConnected) {
      return;
    }

    // Create P2P swarms for both inference and score networks
    this.swarm = new Hyperswarm();
    this.scoreSwarm = new Hyperswarm();

    // Handle incoming connections
    this.swarm.on('connection', (connection, info) => {
      const workerId = info.publicKey.toString('hex').substring(0, 8);

      this.connections.set(workerId, connection);
      this.handleConnection(connection, workerId);

      connection.on('close', () => {
        this.connections.delete(workerId);
        this.activeWorkers.delete(workerId);
        this.emit('worker-disconnected', workerId);
      });

      // Check worker status
      this.sendMessage(connection, {
        type: 'status'
      });
    });

    // Join inference network
    const inferenceTopic = Buffer.alloc(32).fill('qmesh-inference-network-v1');
    const inferenceDiscovery = this.swarm.join(inferenceTopic, { client: true, server: false });

    // Join score sharing network for health monitoring
    const scoreTopic = Buffer.alloc(32).fill('qmesh-scores-network-v1');
    const scoreDiscovery = this.scoreSwarm.join(scoreTopic, { client: true, server: false });

    // Handle score network connections
    this.scoreSwarm.on('connection', (connection, info) => {
      const peerId = info.publicKey.toString('hex').substring(0, 8);
      this.handleScoreConnection(connection, peerId);

      // Request scores from worker
      setTimeout(() => {
        this.sendScoreMessage(connection, {
          type: 'score_request',
          workerId: this.customerId
        });
      }, 500);
    });

    await Promise.all([inferenceDiscovery.flushed(), scoreDiscovery.flushed()]);
    this.isConnected = true;

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.requestHealthUpdates();
      this.globalScoreManager.cleanupStaleWorkers();
      this.updateMyScore();
    }, 30000);

    // Get my initial score from network
    setTimeout(() => this.updateMyScore(), 2000);

    // Wait for at least one worker
    await this.waitForWorkers();

    this.emit('connected', {
      customerId: this.customerId,
      workers: Array.from(this.activeWorkers.keys())
    });
  }

  async sendPrompt(prompt, options = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to QMesh network. Call connect() first.');
    }

    // Use intelligent worker selection if enabled
    let workerId;
    let connection;

    if (options.smartRouting !== false) {
      const bestWorker = this.globalScoreManager.selectBestWorker();
      if (bestWorker) {
        // Find connection for best worker
        for (const [wId, conn] of this.connections) {
          if (bestWorker.workerId.startsWith(wId)) {
            workerId = wId;
            connection = conn;
            break;
          }
        }
      }
    }

    // Fallback to random selection if smart routing failed
    if (!connection) {
      const workers = Array.from(this.activeWorkers.keys());
      if (workers.length === 0) {
        throw new Error('No available workers in the network');
      }
      workerId = workers[Math.floor(Math.random() * workers.length)];
      connection = this.connections.get(workerId);
    }

    if (!connection) {
      throw new Error('Lost connection to worker');
    }

    const requestId = crypto.randomBytes(16).toString('hex');
    const startTime = Date.now();

    // Create promise for response
    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        prompt,
        startTime,
        workerId
      });

      // Timeout handler
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          this.stats.failedRequests++;
          reject(new Error('Request timeout'));
        }
      }, this.timeout);
    });

    // Send inference request with sender identity and score
    this.sendMessage(connection, {
      type: 'inference',
      requestId,
      prompt,
      senderId: this.customerId,
      senderScore: this.myScore
    });

    this.emit('request-sent', { requestId, workerId, prompt });

    try {
      const result = await promise;

      // Update statistics
      const responseTime = Date.now() - startTime;
      this.stats.requestsProcessed++;
      this.stats.totalResponseTime += responseTime;
      this.stats.avgResponseTime = Math.round(
        this.stats.totalResponseTime / this.stats.requestsProcessed
      );

      this.emit('response-received', {
        requestId,
        workerId,
        responseTime,
        result
      });

      return result;
    } catch (error) {
      this.emit('request-failed', { requestId, error: error.message });
      throw error;
    }
  }

  async sendBatch(prompts) {
    const results = [];

    // Process in parallel with concurrency limit
    const concurrency = Math.min(prompts.length, this.activeWorkers.size, 5);
    const chunks = [];

    for (let i = 0; i < prompts.length; i += concurrency) {
      chunks.push(prompts.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (prompt, index) => {
        try {
          const result = await this.sendPrompt(prompt);
          return { index, result, error: null };
        } catch (error) {
          return { index, result: null, error: error.message };
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }

    return results;
  }

  getStats() {
    return {
      ...this.stats,
      activeWorkers: this.activeWorkers.size,
      connections: this.connections.size
    };
  }

  getActiveWorkers() {
    return Array.from(this.activeWorkers.keys());
  }

  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Close all connections
    for (const [workerId, connection] of this.connections) {
      connection.end();
    }

    // Destroy swarms
    if (this.swarm) {
      await this.swarm.destroy();
    }
    if (this.scoreSwarm) {
      await this.scoreSwarm.destroy();
    }

    this.isConnected = false;
    this.connections.clear();
    this.activeWorkers.clear();
    this.pendingRequests.clear();

    this.emit('disconnected');
  }

  // Private methods

  async waitForWorkers() {
    let attempts = 0;
    while (this.connections.size === 0 && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (this.connections.size === 0) {
      throw new Error('No workers found in the network after 30 seconds');
    }
  }

  handleConnection(connection, workerId) {
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
            this.handleMessage(message, workerId);
          } catch (error) {
            this.emit('error', { error: 'Failed to parse message', workerId });
          }
        } else {
          break;
        }
      }
    });
  }

  handleMessage(message, workerId) {
    switch (message.type) {
      case 'status':
        if (message.ready) {
          this.activeWorkers.set(workerId, message);
          this.emit('worker-ready', workerId);
        }
        break;

      case 'inference_result':
        const request = this.pendingRequests.get(message.requestId);
        if (request) {
          this.pendingRequests.delete(message.requestId);
          request.resolve(message.result);
        }
        break;

      case 'error':
        const errorRequest = this.pendingRequests.get(message.requestId);
        if (errorRequest) {
          this.pendingRequests.delete(message.requestId);
          errorRequest.reject(new Error(message.error));
        }
        break;
    }
  }

  sendMessage(connection, message) {
    const data = Buffer.from(JSON.stringify(message));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    connection.write(Buffer.concat([length, data]));
  }

  sendScoreMessage(connection, message) {
    try {
      const data = Buffer.from(JSON.stringify(message));
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length, 0);
      connection.write(Buffer.concat([length, data]));
    } catch (error) {
      // Connection might be closed
    }
  }

  handleScoreConnection(connection, peerId) {
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
            this.handleScoreMessage(message, peerId);
          } catch (error) {
            // Ignore parse errors
          }
        } else {
          break;
        }
      }
    });
  }

  handleScoreMessage(message, peerId) {
    switch (message.type) {
      case 'score_announce':
      case 'score_response':
        if (message.data) {
          this.globalScoreManager.updatePeerScore(message.data);
          this.emit('worker-health-update', message.data);
        }
        break;

      case 'leaderboard_sync':
        if (message.scores && Array.isArray(message.scores)) {
          this.globalScoreManager.updateMultiplePeerScores(message.scores);
        }
        break;
    }
  }

  requestHealthUpdates() {
    // Request health updates from all score connections
    for (const connection of this.scoreSwarm.connections) {
      this.sendScoreMessage(connection, {
        type: 'score_request',
        workerId: this.customerId
      });
    }
  }

  getNetworkHealth() {
    return this.globalScoreManager.getNetworkHealth();
  }

  getLeaderboard(limit = 10) {
    return this.globalScoreManager.getGlobalLeaderboard(null, limit);
  }

  getAvailableWorkers() {
    return this.globalScoreManager.getAvailableWorkers();
  }

  updateMyScore() {
    // Get my score from the global score manager
    const myWorkerData = this.globalScoreManager.getWorkerScore(this.customerId);
    if (myWorkerData) {
      this.myScore = myWorkerData.totalScore || 0;
      if (!this.silent) {
        console.log(`📊 My contribution score: ${this.myScore} (${this.getScoreTier(this.myScore)} tier)`);
      }
    } else if (this.myScore === 0 && !this.silent) {
      console.log(`⚠️ No contribution score found. Run as worker to earn priority!`);
    }
  }

  getScoreTier(score) {
    if (score >= 10000) return 'Master';
    if (score >= 4000) return 'Diamond';
    if (score >= 1500) return 'Platinum';
    if (score >= 500) return 'Gold';
    if (score >= 100) return 'Silver';
    if (score >= 1) return 'Bronze';
    return 'Unverified';
  }

  getMyStats() {
    return {
      clientId: this.customerId,
      contributionScore: this.myScore,
      tier: this.getScoreTier(this.myScore),
      ...this.stats
    };
  }
}

export default QMeshClient;