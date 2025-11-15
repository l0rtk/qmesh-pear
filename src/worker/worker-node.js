/**
 * Worker Node - P2P Inference Worker
 *
 * Orchestrates all subsystems to provide distributed LLM inference.
 *
 * Components:
 * - InferenceEngineSidecar: LLM inference via llama-server subprocess
 * - NetworkManager: P2P communication via Hyperswarm
 * - SystemMonitor: Health tracking and load management
 *
 * Message Types Handled:
 * - prompt: Inference request from client
 * - status_request: Health status query
 *
 * Message Types Sent:
 * - status: Worker availability broadcast
 * - inference_result: Inference response
 * - inference_error: Inference failure
 *
 * Usage:
 *   const worker = new WorkerNode({
 *     modelPath: './models/model.gguf',
 *     binaryPath: '/path/to/llama-server',
 *     port: 8080
 *   })
 *
 *   await worker.start()
 *   // Worker now accepts P2P requests
 */

import EventEmitter from 'bare-events'
import { InferenceEngineSidecar } from './inference-engine-sidecar.js'
import { NetworkManager } from '../lib/network-manager.js'
import { SystemMonitor } from '../lib/system-monitor.js'
import crypto from 'bare-crypto'
import b4a from 'b4a'

/**
 * WorkerNode - Distributed LLM inference worker
 */
export class WorkerNode extends EventEmitter {
  constructor(options = {}) {
    super()

    // Worker configuration
    this.config = {
      // Inference engine config
      modelPath: options.modelPath,
      binaryPath: options.binaryPath,
      port: options.port || 8080,
      gpuLayers: options.gpuLayers !== undefined ? options.gpuLayers : 0,
      threads: options.threads || 4,
      verbose: options.verbose || false,

      // Network config
      networkTopic: options.networkTopic || 'qmesh-inference',

      // Queue config
      queueCapacity: options.queueCapacity || 10,

      // Health broadcast interval
      statusBroadcastInterval: options.statusBroadcastInterval || 10000, // 10 seconds

      // Inference defaults
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 200,

      ...options
    }

    // Subsystems
    this.engine = null
    this.network = null
    this.monitor = null

    // Worker state
    this.workerId = this._generateWorkerId()
    this.topicKey = null
    this.statusBroadcastTimer = null
    this.isRunning = false
  }

  /**
   * Generate a unique worker ID
   *
   * @private
   * @returns {string} - Worker ID (hex string)
   */
  _generateWorkerId() {
    const random = crypto.randomBytes(16)
    return b4a.toString(random, 'hex')
  }

  /**
   * Start the worker node
   *
   * Initializes all subsystems and joins the P2P network
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Worker already running')
    }

    try {
      // Step 1: Initialize inference engine
      this.emit('starting', { step: 'inference-engine' })

      this.engine = new InferenceEngineSidecar(
        {
          modelPath: this.config.modelPath,
          binaryPath: this.config.binaryPath,
          port: this.config.port,
          gpuLayers: this.config.gpuLayers,
          threads: this.config.threads,
          verbose: this.config.verbose
        },
        {
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens
        }
      )

      await this.engine.start()
      this.emit('started', { subsystem: 'inference-engine' })

      // Step 2: Initialize system monitor
      this.emit('starting', { step: 'system-monitor' })

      this.monitor = new SystemMonitor({
        queueCapacity: this.config.queueCapacity
      })

      this.monitor.startMonitoring(5000) // Update every 5 seconds
      this.emit('started', { subsystem: 'system-monitor' })

      // Step 3: Initialize network manager
      this.emit('starting', { step: 'network-manager' })

      this.network = new NetworkManager()

      // Set up network event handlers
      this.network.on('peer-connected', (peerId, conn, info) => {
        this.emit('peer-connected', peerId, info)
      })

      this.network.on('peer-disconnected', (peerId) => {
        this.emit('peer-disconnected', peerId)
      })

      this.network.on('message', (peerId, message) => {
        this._handleMessage(peerId, message)
      })

      this.network.on('peer-error', (peerId, error) => {
        this.emit('peer-error', peerId, error)
      })

      // Join the P2P network
      this.topicKey = await this.network.joinNetwork(this.config.networkTopic, {
        server: true, // Accept incoming connections
        client: true  // Make outgoing connections
      })

      this.emit('started', { subsystem: 'network-manager', topicKey: this.topicKey })

      // Step 4: Start broadcasting worker status
      this._startStatusBroadcast()

      this.isRunning = true
      this.emit('ready', {
        workerId: this.workerId,
        topicKey: this.topicKey,
        health: this.monitor.getHealth()
      })

    } catch (error) {
      // Cleanup on failure
      await this.stop()
      throw error
    }
  }

  /**
   * Stop the worker node
   *
   * Gracefully shuts down all subsystems
   */
  async stop() {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    this.emit('stopping')

    // Stop status broadcasts
    if (this.statusBroadcastTimer) {
      clearInterval(this.statusBroadcastTimer)
      this.statusBroadcastTimer = null
    }

    // Shutdown subsystems
    if (this.network) {
      await this.network.destroy()
      this.network = null
    }

    if (this.monitor) {
      this.monitor.destroy()
      this.monitor = null
    }

    if (this.engine) {
      await this.engine.dispose()
      this.engine = null
    }

    this.emit('stopped')
  }

  /**
   * Start periodic status broadcasts
   *
   * @private
   */
  _startStatusBroadcast() {
    // Broadcast immediately
    this._broadcastStatus()

    // Then broadcast periodically
    this.statusBroadcastTimer = setInterval(() => {
      this._broadcastStatus()
    }, this.config.statusBroadcastInterval)
  }

  /**
   * Broadcast worker status to the network
   *
   * @private
   */
  _broadcastStatus() {
    if (!this.network || !this.isRunning) {
      return
    }

    const health = this.monitor.getHealth()

    const statusMessage = {
      type: 'status',
      workerId: this.workerId,
      timestamp: Date.now(),
      health: {
        score: health.score,
        state: health.state,
        cpu: health.cpu,
        memory: health.memory,
        queueSize: health.queue.size,
        queueCapacity: health.queue.capacity,
        canAcceptRequests: health.canAcceptRequests
      }
    }

    try {
      this.network.broadcast(statusMessage, this.topicKey)
      this.emit('status-broadcast', statusMessage)
    } catch (error) {
      this.emit('error', new Error(`Status broadcast failed: ${error.message}`))
    }
  }

  /**
   * Handle incoming P2P message
   *
   * @private
   */
  async _handleMessage(peerId, message) {
    this.emit('message-received', peerId, message)

    switch (message.type) {
      case 'prompt':
        await this._handlePromptRequest(peerId, message)
        break

      case 'status_request':
        this._handleStatusRequest(peerId, message)
        break

      default:
        this.emit('unknown-message', peerId, message)
    }
  }

  /**
   * Handle inference request
   *
   * @private
   */
  async _handlePromptRequest(peerId, message) {
    const { prompt, requestId, options = {} } = message

    if (!prompt) {
      this._sendError(peerId, requestId, 'Missing prompt in request')
      return
    }

    // Check if we can accept requests
    if (!this.monitor.canAcceptRequests()) {
      this._sendError(peerId, requestId, 'Worker overloaded, rejecting request')
      this.emit('request-rejected', peerId, requestId, 'overloaded')
      return
    }

    this.emit('request-accepted', peerId, requestId, prompt)

    // Increment queue
    this.monitor.incrementQueue()

    try {
      const startTime = Date.now()

      // Perform inference
      const result = await this.engine.generate(prompt, {
        maxTokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature || this.config.temperature
      })

      const duration = Date.now() - startTime

      // Send result back to client
      const response = {
        type: 'inference_result',
        requestId,
        workerId: this.workerId,
        result: {
          text: result.text,
          tokens: result.tokens,
          duration,
          tokensPerSecond: result.tokensPerSecond
        },
        timestamp: Date.now()
      }

      this.network.sendMessage(peerId, response)

      this.emit('request-completed', peerId, requestId, {
        tokens: result.tokens,
        duration
      })

    } catch (error) {
      this._sendError(peerId, requestId, error.message)
      this.emit('request-failed', peerId, requestId, error)

    } finally {
      // Decrement queue
      this.monitor.decrementQueue()
    }
  }

  /**
   * Handle status request
   *
   * @private
   */
  _handleStatusRequest(peerId, message) {
    const { requestId } = message

    const health = this.monitor.getHealth()

    const response = {
      type: 'status_response',
      requestId,
      workerId: this.workerId,
      health: {
        score: health.score,
        state: health.state,
        cpu: health.cpu,
        memory: health.memory,
        queueSize: health.queue.size,
        queueCapacity: health.queue.capacity,
        canAcceptRequests: health.canAcceptRequests
      },
      timestamp: Date.now()
    }

    this.network.sendMessage(peerId, response)
    this.emit('status-sent', peerId, requestId)
  }

  /**
   * Send error response to peer
   *
   * @private
   */
  _sendError(peerId, requestId, errorMessage) {
    const response = {
      type: 'inference_error',
      requestId,
      workerId: this.workerId,
      error: errorMessage,
      timestamp: Date.now()
    }

    try {
      this.network.sendMessage(peerId, response)
    } catch (error) {
      this.emit('error', new Error(`Failed to send error response: ${error.message}`))
    }
  }

  /**
   * Get worker status
   *
   * @returns {object} - Worker status
   */
  getStatus() {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      topicKey: this.topicKey,
      networkTopic: this.config.networkTopic,
      health: this.monitor ? this.monitor.getHealth() : null,
      peerCount: this.network ? this.network.getPeers(this.topicKey).length : 0
    }
  }
}
