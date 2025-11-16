import { loadModel, completion, unloadModel } from '@tetherto/qvac-sdk';
import Hyperswarm from 'hyperswarm';
import { randomBytes } from 'bare-crypto';
import { ScoreManager } from './lib/score-manager.js';
import { ScoreDatabase } from './lib/score-db.js';
console.log('🚀 QMesh Worker with Scoring System');
console.log('====================================');

class QMeshWorker {
  constructor() {
    this.swarm = null;
    this.modelId = null;
    this.isReady = false;
    this.workerId = randomBytes(16).toString('hex');
    this.connections = new Map();
    this.requestsProcessed = 0;
    this.totalCredits = 0;
    this.requestQueue = [];
    this.isProcessing = false;

    // Scoring system
    this.scoreManager = new ScoreManager();
    this.scoreDb = new ScoreDatabase();
    this.workerLevel = 'Bronze';
    this.workerRank = null;
  }

  async start() {
    console.log('🔧 Initializing worker...');
    console.log('📍 Worker ID:', this.workerId.substring(0, 8) + '...');

    // Load the model once and keep it loaded
    await this.loadModelSafely();

    // Setup P2P network
    await this.setupNetwork();

    // Process request queue
    this.processQueue();
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
            // Keep model in memory
            use_mlock: true,
            // Prevent automatic cleanup
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

    this.swarm.on('connection', (connection, info) => {
      const peerId = info.publicKey.toString('hex').substring(0, 8);
      console.log(`\n👤 Customer connected: ${peerId}`);

      this.connections.set(peerId, connection);
      this.handleConnection(connection, peerId);

      connection.on('error', (err) => {
        // Ignore connection errors during normal operation
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
    console.log('\n⏳ Ready for inference requests...\n');

    // Status updates
    setInterval(() => this.showStatus(), 30000);
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

  async handleMessage(connection, message, peerId) {
    switch (message.type) {
      case 'status':
        console.log(`📊 Status request from ${peerId}`);
        this.sendMessage(connection, {
          type: 'status',
          workerId: this.workerId,
          ready: this.isReady,
          requestsProcessed: this.requestsProcessed,
          queueLength: this.requestQueue.length
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

        // Add to queue
        this.requestQueue.push({
          connection,
          message,
          peerId,
          timestamp: Date.now()
        });

        console.log(`📝 Request ${message.requestId.substring(0, 8)}... added to queue (position: ${this.requestQueue.length})`);

        // Show queue status
        if (this.requestQueue.length > 1) {
          console.log(`   ⏳ ${this.requestQueue.length - 1} request(s) ahead in queue`);
        }

        // Trigger queue processing
        this.processNextInQueue();
        break;
    }
  }

  async processQueue() {
    // Process queue with interval check as backup
    setInterval(() => {
      if (this.requestQueue.length > 0 && !this.isProcessing) {
        console.log('⚠️ Queue processor backup trigger');
        this.processNextInQueue();
      }
    }, 1000);
  }

  async processNextInQueue() {
    // Don't process if already processing or queue is empty
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const request = this.requestQueue.shift();

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
      if (this.requestQueue.length > 0) {
        setImmediate(() => this.processNextInQueue());
      }
    }
  }

  async processInference(request) {
    const { connection, message } = request;

    console.log(`\n🤖 Processing request ${message.requestId.substring(0, 8)}...`);
    console.log(`   Queue remaining: ${this.requestQueue.length}`);
    console.log(`   Prompt preview: "${message.prompt.substring(0, 50)}..."`);

    const startTime = Date.now();

    try {
      // Use non-streaming mode for stability
      const response = await completion(
        this.modelId,
        [{ role: 'user', content: message.prompt }],
        false  // Non-streaming mode
      );

      // Get the text result
      const result = await response.text;

      const processingTime = Date.now() - startTime;

      // Update stats
      const credits = this.calculateCredits(processingTime, message.prompt.length);
      this.totalCredits += credits;
      this.requestsProcessed++;

      console.log(`✅ Complete in ${processingTime}ms`);
      console.log(`📝 Result: "${result.substring(0, 100)}${result.length > 100 ? '...' : ''}"`);
      console.log(`💰 Earned ${credits} credits! Total: ${this.totalCredits}`);

      // Send result
      if (connection && !connection.destroyed) {
        this.sendMessage(connection, {
          type: 'inference_result',
          requestId: message.requestId,
          result: result,
          workerId: this.workerId
        });
        console.log(`📤 Result sent to customer`);
      }

    } catch (error) {
      console.error('❌ Inference error:', error.message);

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

  calculateCredits(processingTime, promptLength) {
    let credits = 1;
    if (processingTime < 2000) credits += 1;
    if (promptLength > 100) credits += Math.floor(promptLength / 100);
    return credits;
  }

  showStatus() {
    console.log(`\n📊 Status:`);
    console.log(`   Active connections: ${this.connections.size}`);
    console.log(`   Requests processed: ${this.requestsProcessed}`);
    console.log(`   Queue length: ${this.requestQueue.length}`);
    console.log(`   Total credits: ${this.totalCredits}`);
    console.log(`   Model status: ${this.isReady ? '🟢 Ready' : '🔴 Loading'}\n`);
  }

  async shutdown() {
    console.log('🛑 Shutting down...');

    // Close connections
    for (const [peerId, connection] of this.connections) {
      connection.end();
    }

    // Leave swarm
    if (this.swarm) {
      await this.swarm.destroy();
    }

    // Keep model loaded until the very end
    if (this.modelId) {
      try {
        await unloadModel(this.modelId);
      } catch (err) {
        // Model might already be unloaded
      }
    }

    console.log(`\n📈 Final stats:`);
    console.log(`   Total requests: ${this.requestsProcessed}`);
    console.log(`   Total credits: ${this.totalCredits}`);
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