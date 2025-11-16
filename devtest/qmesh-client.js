import Hyperswarm from 'hyperswarm';
import { EventEmitter } from 'events';
import { randomBytes } from 'bare-crypto';

/**
 * QMeshClient - Programmatic API for QMesh network
 */
class QMeshClient extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.timeout = options.timeout || 30000;
    this.silent = options.silent !== false;
    this.autoReconnect = options.autoReconnect || false;

    // State
    this.swarm = null;
    this.customerId = randomBytes(16).toString('hex');
    this.connections = new Map();
    this.pendingRequests = new Map();
    this.activeWorkers = new Map();
    this.isConnected = false;

    // Statistics
    this.stats = {
      requestsProcessed: 0,
      totalResponseTime: 0,
      failedRequests: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Connect to the QMesh P2P network
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      return;
    }

    // Create P2P swarm
    this.swarm = new Hyperswarm();

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

    // Join the network
    const topic = Buffer.alloc(32).fill('qmesh-inference-network-v1');
    const discovery = this.swarm.join(topic);

    await discovery.flushed();
    this.isConnected = true;

    // Wait for at least one worker
    await this.waitForWorkers();

    this.emit('connected', {
      customerId: this.customerId,
      workers: Array.from(this.activeWorkers.keys())
    });
  }

  /**
   * Send a prompt to an available worker
   * @param {string} prompt - The prompt to send
   * @returns {Promise<string>} The response from the worker
   */
  async sendPrompt(prompt) {
    if (!this.isConnected) {
      throw new Error('Not connected to QMesh network. Call connect() first.');
    }

    // Find an available worker
    const workers = Array.from(this.activeWorkers.keys());
    if (workers.length === 0) {
      throw new Error('No available workers in the network');
    }

    const workerId = workers[Math.floor(Math.random() * workers.length)];
    const connection = this.connections.get(workerId);

    if (!connection) {
      throw new Error('Lost connection to worker');
    }

    const requestId = randomBytes(16).toString('hex');
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

    // Send inference request
    this.sendMessage(connection, {
      type: 'inference',
      requestId,
      prompt
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

  /**
   * Send multiple prompts in batch
   * @param {string[]} prompts - Array of prompts
   * @returns {Promise<string[]>} Array of responses
   */
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

  /**
   * Get current statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      activeWorkers: this.activeWorkers.size,
      connections: this.connections.size
    };
  }

  /**
   * Get list of active workers
   * @returns {Array} Array of worker IDs
   */
  getActiveWorkers() {
    return Array.from(this.activeWorkers.keys());
  }

  /**
   * Disconnect from the network
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    // Close all connections
    for (const [workerId, connection] of this.connections) {
      connection.end();
    }

    // Destroy swarm
    if (this.swarm) {
      await this.swarm.destroy();
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
}

export default QMeshClient;