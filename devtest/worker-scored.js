import { loadModel, completion, unloadModel } from '@tetherto/qvac-sdk';
import Hyperswarm from 'hyperswarm';
import { randomBytes } from 'bare-crypto';
import { ScoreManager } from './lib/score-manager.js';
import { ScoreDatabase } from './lib/score-db.js';
import { GlobalScoreManager } from './lib/global-score-manager.js';
import { SystemMonitor } from './lib/system-monitor.js';
import { PriorityQueue } from './lib/priority-queue.js';
import { readFileSync, writeFileSync, existsSync } from 'bare-fs';

console.log('🚀 QMesh Worker with Scoring System');
console.log('====================================');

class QMeshWorker {
  constructor() {
    this.swarm = null;
    this.modelId = null;
    this.isReady = false;
    this.workerId = this.getOrCreateWorkerId();
    this.connections = new Map();
    this.requestsProcessed = 0;
    this.requestQueue = new PriorityQueue();
    this.isProcessing = false;

    // Scoring system
    this.scoreManager = new ScoreManager();
    this.scoreDb = new ScoreDatabase();
    this.globalScoreManager = new GlobalScoreManager();
    this.systemMonitor = new SystemMonitor();
    this.workerLevel = 'Bronze';
    this.workerRank = null;
    this.scoreConnections = new Map(); // Connections for score sharing
    this.scoreSwarm = null;
    this.totalScore = 0;
    this.maxQueueSize = 5;
  }

  getOrCreateWorkerId() {
    const workerIdFile = './worker-id.txt';

    try {
      if (existsSync(workerIdFile)) {
        const id = readFileSync(workerIdFile, 'utf8').trim();
        console.log('🔄 Loaded existing worker ID');
        return id;
      }
    } catch (error) {
      console.log('⚠️ Could not read worker ID file');
    }

    // Generate new ID and save it
    const newId = randomBytes(16).toString('hex');
    try {
      writeFileSync(workerIdFile, newId);
      console.log('🆕 Generated new worker ID');
    } catch (error) {
      console.log('⚠️ Could not save worker ID to file');
    }

    return newId;
  }

  async start() {
    console.log('🔧 Initializing worker...');
    console.log('📍 Worker ID:', this.workerId.substring(0, 8) + '...');

    // Initialize score database
    await this.initScoring();

    // Load the model once and keep it loaded
    await this.loadModelSafely();

    // Setup P2P network
    await this.setupNetwork();

    // Process request queue
    this.processQueue();

    // Update uptime score every hour
    setInterval(() => {
      this.scoreManager.addUptimeScore(this.workerId, 1);
      this.saveScore();
    }, 60 * 60 * 1000); // Every hour
  }

  async initScoring() {
    try {
      await this.scoreDb.init();

      // Load existing score
      const existingScore = await this.scoreDb.getWorkerScore(this.workerId);
      if (existingScore) {
        // Restore all stats
        this.scoreManager.importScores({
          scores: [[this.workerId, existingScore]]
        });

        // Restore worker-level stats
        this.totalScore = existingScore.totalScore || 0;
        this.requestsProcessed = existingScore.requestCount || 0;
        this.workerLevel = existingScore.level || 'Bronze';

        // Log what was restored
        console.log(`📊 Restored worker stats:`);
        console.log(`   Score: ${this.totalScore} points`);
        console.log(`   Level: ${this.workerLevel}`);
        console.log(`   Requests: ${this.requestsProcessed}`);

        if (existingScore.achievements && existingScore.achievements.length > 0) {
          console.log(`   Achievements: ${existingScore.achievements.join(', ')}`);
        }
      } else {
        console.log(`🆕 Starting fresh - no previous scores found`);
      }
    } catch (error) {
      console.log('⚠️ Score database initialization failed, using in-memory only');
    }
  }

  async loadModelSafely() {
    try {
      console.log('🧠 Loading Llama 3.2 1B model...');
      console.log('   This will stay loaded for all requests...');

      this.modelId = await loadModel(
        'pear://afa79ee07c0a138bb9f11bfaee771fb1bdfca8c82d961cff0474e49827bd1de3/Llama-3.2-1B-Instruct-Q4_0.gguf',
        {
          modelType: 'llm',
          modelConfig: {
            ctx_size: 512,
            gpu_layers: 0,
            device: 'cpu',
            use_mlock: true,
            persistent: true
          }
        }
      );

      this.isReady = true;
      console.log('✅ Model loaded and ready for multiple requests!');
    } catch (error) {
      console.error('❌ Failed to load model:', error.message);
      console.log('   Make sure PAT_TOKEN is set');
      process.exit(1);
    }
  }

  async setupNetwork() {
    this.swarm = new Hyperswarm();
    console.log('🌐 Connecting to P2P network...');

    // Setup inference network
    this.swarm.on('connection', (connection, info) => {
      const peerId = info.publicKey.toString('hex').substring(0, 8);
      console.log(`\n👤 Customer connected: ${peerId}`);

      this.connections.set(peerId, connection);
      this.handleConnection(connection, peerId);

      connection.on('error', (err) => {
        if (err.code !== 'ECONNRESET') {
          console.error(`Connection error: ${err.message}`);
        }
      });

      connection.on('close', () => {
        console.log(`👋 Customer disconnected: ${peerId}`);
        this.connections.delete(peerId);
      });
    });

    const topic = Buffer.alloc(32).fill('qmesh-inference-network-v1');
    const discovery = this.swarm.join(topic);

    await discovery.flushed();
    console.log('✅ Joined P2P network!');
    console.log('📡 Topic:', topic.toString('hex').substring(0, 16) + '...');

    // Setup score sharing network
    await this.setupScoreNetwork();

    console.log('\n⏳ Ready for inference requests...\n');

    // Show status periodically
    setInterval(() => this.showStatus(), 30000);

    // Periodic score broadcasts
    setInterval(() => this.broadcastScore(), 30000); // Every 30 seconds

    // Cleanup stale workers
    setInterval(() => this.globalScoreManager.cleanupStaleWorkers(), 60000); // Every minute

    // Update dynamic queue capacity
    setInterval(() => {
      this.maxQueueSize = this.systemMonitor.getDynamicQueueCapacity(5);
    }, 10000); // Every 10 seconds
  }

  handleConnection(connection, peerId) {
    let buffer = Buffer.alloc(0);

    connection.on('data', async (data) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 4) {
        const messageLength = buffer.readUInt32BE(0);

        if (buffer.length >= messageLength + 4) {
          const messageData = buffer.slice(4, messageLength + 4);
          buffer = buffer.slice(messageLength + 4);

          try {
            const message = JSON.parse(messageData.toString());
            await this.handleMessage(connection, message, peerId);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        } else {
          break;
        }
      }
    });
  }

  async setupScoreNetwork() {
    console.log('🎯 Setting up score sharing network...');

    this.scoreSwarm = new Hyperswarm();

    // Handle score network connections
    this.scoreSwarm.on('connection', (connection, info) => {
      const peerId = info.publicKey.toString('hex').substring(0, 8);
      console.log(`📊 Score peer connected: ${peerId}`);

      this.scoreConnections.set(peerId, connection);
      this.handleScoreConnection(connection, peerId);

      connection.on('error', (err) => {
        if (err.code !== 'ECONNRESET') {
          console.error(`Score connection error: ${err.message}`);
        }
      });

      connection.on('close', () => {
        console.log(`📊 Score peer disconnected: ${peerId}`);
        this.scoreConnections.delete(peerId);
      });

      // Request scores from new peer
      setTimeout(() => {
        this.sendMessage(connection, {
          type: 'score_request',
          workerId: this.workerId
        });
      }, 1000);
    });

    // Join score sharing topic
    const scoreTopic = Buffer.alloc(32).fill('qmesh-scores-network-v1');
    const scoreDiscovery = this.scoreSwarm.join(scoreTopic, { server: true, client: true });

    await scoreDiscovery.flushed();
    console.log('✅ Joined score sharing network!');
    console.log('📊 Score topic:', scoreTopic.toString('hex').substring(0, 16) + '...');

    // Initial score broadcast after joining
    setTimeout(() => this.broadcastScore(), 2000);
  }

  handleScoreConnection(connection, peerId) {
    let buffer = Buffer.alloc(0);

    connection.on('data', async (data) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 4) {
        const messageLength = buffer.readUInt32BE(0);

        if (buffer.length >= messageLength + 4) {
          const messageData = buffer.slice(4, messageLength + 4);
          buffer = buffer.slice(messageLength + 4);

          try {
            const message = JSON.parse(messageData.toString());
            await this.handleScoreMessage(connection, message, peerId);
          } catch (error) {
            console.error('Error parsing score message:', error);
          }
        } else {
          break;
        }
      }
    });
  }

  async handleScoreMessage(connection, message, peerId) {
    switch (message.type) {
      case 'score_announce':
        // Update global score manager with peer's score
        this.globalScoreManager.updatePeerScore(message.data);
        break;

      case 'score_request':
        // Send our score to requesting peer
        const myScore = this.getMyScoreData();
        this.sendMessage(connection, {
          type: 'score_response',
          data: myScore
        });
        break;

      case 'score_response':
        // Update global score manager with response
        this.globalScoreManager.updatePeerScore(message.data);
        break;

      case 'leaderboard_sync':
        // Full leaderboard sync
        if (message.scores && Array.isArray(message.scores)) {
          this.globalScoreManager.updateMultiplePeerScores(message.scores);
        }
        break;
    }
  }

  getMyScoreData() {
    const stats = this.scoreManager.getWorkerStats(this.workerId) || {};
    const health = this.systemMonitor.getHealthReport(this.requestQueue.length(), this.maxQueueSize);

    return {
      workerId: this.workerId,
      totalScore: this.totalScore || 0,
      level: this.workerLevel || 'Bronze',
      requestCount: this.requestsProcessed || 0,
      successCount: stats.successCount || 0,
      successRate: stats.successRate || 0,
      averageResponseTime: stats.averageResponseTime || 0,
      achievements: stats.achievements || [],

      // System health data
      system: {
        cpuUsage: health.system.cpuUsage,
        memoryUsage: health.system.memoryUsage,
        loadAverage: health.system.loadAverage,
        queueLength: this.requestQueue.length(),
        queueCapacity: health.queue.dynamicCapacity,
        maxQueue: this.maxQueueSize,
        isAccepting: health.health.canAccept,
        status: health.health.status,
        healthScore: health.health.score
      },

      timestamp: Date.now()
    };
  }

  async broadcastScore() {
    if (this.scoreConnections.size === 0) {
      return;
    }

    const myScore = this.getMyScoreData();
    const message = {
      type: 'score_announce',
      data: myScore
    };

    let broadcasted = 0;
    for (const [peerId, connection] of this.scoreConnections) {
      try {
        if (connection && !connection.destroyed) {
          this.sendMessage(connection, message);
          broadcasted++;
        }
      } catch (error) {
        console.error(`Failed to broadcast to ${peerId}:`, error.message);
      }
    }

    if (broadcasted > 0) {
      console.log(`📢 Broadcasted score to ${broadcasted} peers`);
    }
  }

  async handleMessage(connection, message, peerId) {
    switch (message.type) {
      case 'status':
        console.log(`📊 Status request from ${peerId}`);
        const stats = this.scoreManager.getWorkerStats(this.workerId) || {};
        this.sendMessage(connection, {
          type: 'status',
          workerId: this.workerId,
          ready: this.isReady,
          requestsProcessed: this.requestsProcessed,
          queueLength: this.requestQueue.length(),
          score: stats.totalScore || 0,
          level: stats.level || 'Bronze',
          rank: stats.rank || null,
          achievements: stats.achievements || []
        });
        break;

      case 'inference':
        if (!this.isReady) {
          this.sendMessage(connection, {
            type: 'error',
            requestId: message.requestId,
            error: 'Worker not ready'
          });
          return;
        }

        // Check if we can accept more work
        const canAccept = this.systemMonitor.canAcceptWork(this.requestQueue.length(), this.maxQueueSize);
        if (!canAccept) {
          this.sendMessage(connection, {
            type: 'error',
            requestId: message.requestId,
            error: 'Worker overloaded',
            retry: true
          });
          console.log(`🔴 Rejected request - system overloaded`);
          return;
        }

        // Get sender's verified score
        const senderScore = await this.verifySenderScore(message.senderId, message.senderScore);

        // Add to priority queue
        const queueLength = this.requestQueue.enqueue({
          connection,
          message,
          peerId,
          timestamp: Date.now()
        }, senderScore);

        const position = this.requestQueue.getPosition(message.requestId);
        const tier = this.getScoreTier(senderScore);

        console.log(`📝 Request ${message.requestId.substring(0, 8)}... added to queue`);
        console.log(`   👤 Sender: ${message.senderId ? message.senderId.substring(0, 8) : 'unknown'} (${tier} tier, ${senderScore} pts)`);
        console.log(`   🔢 Queue position: ${position}/${queueLength}`);

        // Show who's ahead if not first
        if (position > 1) {
          console.log(`   ⏳ ${position - 1} higher priority request(s) ahead`);
        }

        // Trigger queue processing
        console.log('🔄 Triggering queue processing...');
        setImmediate(() => this.processNextInQueue());
        break;

      case 'leaderboard':
        const leaderboard = this.scoreManager.getTopWorkers(10);
        this.sendMessage(connection, {
          type: 'leaderboard',
          data: leaderboard
        });
        break;
    }
  }

  async processQueue() {
    // Process queue with interval check as backup
    setInterval(() => {
      if (!this.requestQueue.isEmpty() && !this.isProcessing) {
        console.log('⚠️ Queue processor backup trigger');
        this.processNextInQueue();
      }
    }, 1000);
  }

  async processNextInQueue() {
    // Don't process if already processing or queue is empty
    if (this.isProcessing) {
      console.log('⏸️  Already processing, skipping...');
      return;
    }
    if (this.requestQueue.isEmpty()) {
      console.log('📭 Queue empty, nothing to process');
      return;
    }

    this.isProcessing = true;

    try {
      const request = this.requestQueue.dequeue();

      if (!request) {
        this.isProcessing = false;
        return;
      }

      // Check if connection is still valid
      if (!request.connection || request.connection.destroyed) {
        console.log('⚠️ Skipping request - connection lost');
        this.isProcessing = false;
        // Process next request immediately
        setImmediate(() => this.processNextInQueue());
        return;
      }

      await this.processInference(request);

    } catch (error) {
      console.error('❌ Error processing queue:', error.message);
    } finally {
      this.isProcessing = false;

      // Process next request if available
      if (!this.requestQueue.isEmpty()) {
        setImmediate(() => this.processNextInQueue());
      }
    }
  }

  async processInference(request) {
    const { connection, message } = request;

    console.log(`\n🤖 Processing request ${message.requestId.substring(0, 8)}...`);
    console.log(`   Queue remaining: ${this.requestQueue.length()}`);
    console.log(`   Prompt preview: "${message.prompt.substring(0, 50)}..."`);

    const startTime = Date.now();

    try {
      // Use non-streaming mode for stability
      const response = await completion(
        this.modelId,
        [{ role: 'user', content: message.prompt }],
        false
      );

      // Get the text result
      const result = await response.text;
      console.log(`📥 Got result: "${result}"`);

      const processingTime = Date.now() - startTime;

      // Record response time for monitoring
      this.systemMonitor.addResponseTime(processingTime);

      // Send result immediately to ensure client gets response
      console.log('📤 Sending result to client...');
      if (connection && !connection.destroyed) {
        this.sendMessage(connection, {
          type: 'inference_result',
          requestId: message.requestId,
          result: result,
          workerId: this.workerId
        });
        console.log(`✅ Result sent! Complete in ${processingTime}ms`);
        console.log(`📝 Result: "${result.substring(0, 100)}${result.length > 100 ? '...' : ''}"`);
      } else {
        console.error('❌ Connection lost, cannot send result');
      }

      // Update scoring in background (non-blocking)
      this.updateScoreAsync(message, processingTime, result).catch(err => {
        console.error('⚠️ Background scoring error:', err.message);
      });

    } catch (error) {
      console.error('❌ Inference error:', error.message);

      // Record failure
      const metrics = {
        processingTime: Date.now() - startTime,
        promptLength: message.prompt.length,
        resultLength: 0,
        success: false,
        prompt: message.prompt
      };

      this.scoreManager.updateWorkerScore(
        this.workerId,
        -1, // Penalty for failure
        metrics
      );

      // Try to recover the model if it crashed
      if (error.message.includes('Model not found') || error.message.includes('Invalid model')) {
        console.log('🔄 Reloading model...');
        this.isReady = false;
        await this.loadModelSafely();
      }

      if (connection && !connection.destroyed) {
        this.sendMessage(connection, {
          type: 'error',
          requestId: message.requestId,
          error: error.message
        });
      }
    }
  }

  async updateScoreAsync(message, processingTime, result) {
    try {
      const metrics = {
        processingTime,
        promptLength: message.prompt.length,
        resultLength: result.length,
        success: true,
        prompt: message.prompt
      };

      const scoreResult = this.scoreManager.updateWorkerScore(
        this.workerId,
        this.scoreManager.calculateRequestScore(metrics),
        metrics
      );

      this.requestsProcessed++;
      this.totalScore = scoreResult.totalScore;
      this.workerLevel = this.scoreManager.calculateLevel(this.totalScore);
      this.workerRank = scoreResult.rank;

      console.log(`🎯 Score: +${scoreResult.requestScore} points! Total: ${scoreResult.totalScore}`);
      console.log(`📈 Rank: #${scoreResult.rank || 'Unranked'} | Level: ${this.workerLevel}`);

      // Broadcast score update to peers
      await this.broadcastScore();

      // Save to database
      await this.saveScore();

      // Record request history
      if (this.scoreDb.isReady) {
        await this.scoreDb.recordRequest(message.requestId, {
          workerId: this.workerId,
          processingTime,
          score: scoreResult.requestScore,
          success: true
        });
      }

      // Check for achievements
      const stats = this.scoreManager.getWorkerStats(this.workerId);
      if (stats && stats.achievements && stats.achievements.length > 0) {
        const lastAchievement = stats.achievements[stats.achievements.length - 1];
        console.log(`🏆 Achievement Unlocked: ${lastAchievement}!`);
      }
    } catch (error) {
      console.error('Score update failed:', error);
    }
  }

  async saveScore() {
    try {
      const stats = this.scoreManager.getWorkerStats(this.workerId);
      if (stats && this.scoreDb.isReady) {
        // Include current worker-level stats in the save
        const completeStats = {
          ...stats,
          totalScore: this.totalScore,
          requestCount: this.requestsProcessed,
          level: this.workerLevel
        };

        await this.scoreDb.saveWorkerScore(this.workerId, completeStats);
        await this.scoreDb.updateLeaderboard(this.scoreManager.getTopWorkers(100));
      }
    } catch (error) {
      // Silent fail - scoring is not critical
      console.error('Failed to save score:', error.message);
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

  showStatus() {
    const stats = this.scoreManager.getWorkerStats(this.workerId) || {};
    const health = this.systemMonitor.getHealthSummary(this.requestQueue.length(), this.maxQueueSize);

    console.log(`\n📊 Worker Status:`);
    console.log(`   Active connections: ${this.connections.size}`);
    console.log(`   Requests processed: ${this.requestsProcessed}`);
    console.log(`   Queue: ${health.queue} ${health.emoji} ${health.status}`);
    console.log(`   CPU: ${health.cpu}% | Memory: ${health.memory}%`);
    console.log(`   Model status: ${this.isReady ? '🟢 Ready' : '🔴 Loading'}`);
    console.log(`   Score peers: ${this.scoreConnections.size}`);
    console.log(`   Accepting work: ${health.accepting ? '✅ Yes' : '❌ No'}`);

    console.log(`\n🎯 Score Status:`);
    console.log(`   Total Score: ${stats.totalScore || 0}`);
    console.log(`   Level: ${stats.level || 'Bronze'}`);

    // Get global rank
    const localScoreData = this.getMyScoreData();
    const globalRank = this.globalScoreManager.getWorkerGlobalRank(this.workerId);

    if (globalRank) {
      console.log(`   Global Rank: #${globalRank} of ${this.globalScoreManager.getActivePeerScores().size + 1} workers`);
    } else {
      console.log(`   Local Rank: #${stats.rank || 'Unranked'}`);
    }

    console.log(`   Success Rate: ${((stats.successRate || 0) * 100).toFixed(1)}%`);
    console.log(`   Avg Response: ${stats.averageResponseTime || 0}ms`);

    if (stats.achievements && stats.achievements.length > 0) {
      console.log(`   🏅 Achievements: ${stats.achievements.join(', ')}`);
    }

    // Show global leaderboard if we have peers
    const globalLeaderboard = this.globalScoreManager.getGlobalLeaderboard(localScoreData, 5);
    if (globalLeaderboard.length > 1) {
      console.log('\n🌐 Global Leaderboard (Top 3):');
      globalLeaderboard.slice(0, 3).forEach((worker, index) => {
        const isMe = worker.workerId === this.workerId;
        const marker = isMe ? ' ← You' : '';
        console.log(`   ${index + 1}. ${worker.workerId.substring(0, 8)}... - ${worker.totalScore} pts${marker}`);
      });
    }

    console.log('');
  }

  async shutdown() {
    console.log('🛑 Shutting down...');

    // Save final scores
    await this.saveScore();

    // Show final leaderboard
    console.log(this.scoreManager.getLeaderboardDisplay(5));

    // Close connections
    for (const [peerId, connection] of this.connections) {
      connection.end();
    }

    // Leave swarms
    if (this.swarm) {
      await this.swarm.destroy();
    }
    if (this.scoreSwarm) {
      await this.scoreSwarm.destroy();
    }

    // Close score database
    if (this.scoreDb.isReady) {
      await this.scoreDb.close();
    }

    // Keep model loaded until the very end
    if (this.modelId) {
      try {
        await unloadModel(this.modelId);
      } catch (err) {
        // Model might already be unloaded
      }
    }

    const stats = this.scoreManager.getWorkerStats(this.workerId) || {};
    console.log(`\n📈 Final Session Stats:`);
    console.log(`   Total requests: ${this.requestsProcessed}`);
    console.log(`   Final score: ${stats.totalScore || 0}`);
    console.log(`   Final rank: #${stats.rank || 'Unranked'}`);
    console.log(`   Level achieved: ${stats.level || 'Bronze'}`);
  }

  async verifySenderScore(senderId, claimedScore) {
    // If no sender ID, treat as unverified (lowest priority)
    if (!senderId) {
      return 0;
    }

    // Check global score manager for verified score
    const verifiedData = this.globalScoreManager.getWorkerScore(senderId);

    if (verifiedData && verifiedData.totalScore !== undefined) {
      const verifiedScore = verifiedData.totalScore;

      // If claimed score differs significantly, use verified
      if (Math.abs(claimedScore - verifiedScore) > 100) {
        console.log(`⚠️ Score mismatch for ${senderId.substring(0, 8)}: claimed ${claimedScore}, verified ${verifiedScore}`);
        return verifiedScore;
      }

      return verifiedScore;
    }

    // If we can't verify, use claimed score but cap it
    if (claimedScore > 0) {
      console.log(`🆕 Unverified sender ${senderId.substring(0, 8)}, using claimed score: ${claimedScore}`);
      return Math.min(claimedScore, 100); // Cap unverified scores at Bronze tier
    }

    return 0; // Unknown senders get lowest priority
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
}

// Start worker
const worker = new QMeshWorker();
worker.start().catch(console.error);

// Handle shutdown signals properly
let isShuttingDown = false;

const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  await worker.shutdown();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNRESET') || err.message?.includes('bare worker')) {
    // Ignore these errors - they're from QVAC cleanup
    return;
  }
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  if (reason?.message?.includes('ECONNRESET') || reason?.message?.includes('bare worker')) {
    // Ignore these errors
    return;
  }
  console.error('Unhandled rejection:', reason);
});

// Keep process alive
process.stdin.resume();