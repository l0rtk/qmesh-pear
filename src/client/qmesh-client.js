/**
 * QMesh Client - P2P LLM Inference Client
 *
 * Allows users to submit inference requests to the P2P worker network.
 *
 * Features:
 * - Automatic worker discovery
 * - Health-based worker selection
 * - Request/response handling
 * - Timeout and error handling
 *
 * Usage:
 *   const client = new QMeshClient({ networkTopic: 'qmesh-inference' })
 *
 *   await client.connect()
 *   const result = await client.generate('Tell me a joke')
 *   console.log(result.text)
 *   await client.disconnect()
 */

import EventEmitter from 'bare-events'
import { NetworkManager } from '../lib/network-manager.js'
import crypto from 'bare-crypto'
import b4a from 'b4a'

/**
 * QMeshClient - Client for distributed LLM inference
 */
export class QMeshClient extends EventEmitter {
  constructor(options = {}) {
    super()

    this.config = {
      networkTopic: options.networkTopic || 'qmesh-inference',
      discoveryTimeout: options.discoveryTimeout || 5000, // 5 seconds
      requestTimeout: options.requestTimeout || 60000,   // 60 seconds
      ...options
    }

    // Network
    this.network = null
    this.topicKey = null
    this.isConnected = false

    // Worker tracking
    this.workers = new Map() // workerId -> { health, lastSeen, peerId }

    // Pending requests
    this.pendingRequests = new Map() // requestId -> { resolve, reject, timeout }
  }

  /**
   * Connect to the P2P network
   *
   * Discovers workers and prepares for inference requests
   */
  async connect() {
    if (this.isConnected) {
      throw new Error('Client already connected')
    }

    try {
      // Initialize network manager
      this.network = new NetworkManager()

      // Set up event handlers
      this.network.on('peer-connected', (peerId, conn, info) => {
        this.emit('peer-connected', peerId, info)
      })

      this.network.on('peer-disconnected', (peerId) => {
        // Remove workers associated with this peer
        for (const [workerId, worker] of this.workers.entries()) {
          if (worker.peerId === peerId) {
            this.workers.delete(workerId)
            this.emit('worker-lost', workerId)
          }
        }

        this.emit('peer-disconnected', peerId)
      })

      this.network.on('message', (peerId, message) => {
        this._handleMessage(peerId, message)
      })

      // Join the network
      this.topicKey = await this.network.joinNetwork(this.config.networkTopic, {
        server: false, // Don't accept connections (we're a client)
        client: true   // Make outgoing connections
      })

      this.isConnected = true
      this.emit('connected', { topicKey: this.topicKey })

      // Start worker discovery
      await this.discoverWorkers()

    } catch (error) {
      await this.disconnect()
      throw error
    }
  }

  /**
   * Disconnect from the P2P network
   */
  async disconnect() {
    if (!this.isConnected) {
      return
    }

    this.isConnected = false

    // Reject all pending requests
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Client disconnected'))
      this.pendingRequests.delete(requestId)
    }

    // Cleanup network
    if (this.network) {
      await this.network.destroy()
      this.network = null
    }

    this.workers.clear()
    this.emit('disconnected')
  }

  /**
   * Discover available workers
   *
   * Waits for worker status broadcasts
   *
   * @param {number} [timeout] - Discovery timeout in ms (default: from config)
   * @returns {Promise<number>} - Number of workers discovered
   */
  async discoverWorkers(timeout = null) {
    const discoveryTimeout = timeout || this.config.discoveryTimeout

    return new Promise((resolve) => {
      const initialCount = this.workers.size

      // Wait for discovery timeout
      setTimeout(() => {
        const discovered = this.workers.size - initialCount
        this.emit('discovery-complete', { total: this.workers.size, discovered })
        resolve(this.workers.size)
      }, discoveryTimeout)
    })
  }

  /**
   * Generate text using the best available worker
   *
   * @param {string} prompt - Text prompt
   * @param {object} options - Generation options
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.temperature - Sampling temperature (0-1)
   * @param {number} options.timeout - Request timeout in ms
   * @returns {Promise<object>} - Generation result
   */
  async generate(prompt, options = {}) {
    if (!this.isConnected) {
      throw new Error('Client not connected. Call connect() first.')
    }

    // Select best worker
    const worker = this._selectBestWorker()

    if (!worker) {
      throw new Error('No workers available')
    }

    // Generate request ID
    const requestId = this._generateRequestId()

    // Create request message
    const requestMessage = {
      type: 'prompt',
      requestId,
      prompt,
      options: {
        maxTokens: options.maxTokens,
        temperature: options.temperature
      },
      timestamp: Date.now()
    }

    // Send request and wait for response
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.config.requestTimeout

      // Set timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Request timeout after ${timeout}ms`))
      }, timeout)

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
        workerId: worker.workerId,
        startTime: Date.now()
      })

      // Send request
      try {
        this.network.sendMessage(worker.peerId, requestMessage)
        this.emit('request-sent', worker.workerId, requestId, prompt)

      } catch (error) {
        clearTimeout(timeoutId)
        this.pendingRequests.delete(requestId)
        reject(error)
      }
    })
  }

  /**
   * Handle incoming P2P message
   *
   * @private
   */
  _handleMessage(peerId, message) {
    switch (message.type) {
      case 'status':
        this._handleWorkerStatus(peerId, message)
        break

      case 'inference_result':
        this._handleInferenceResult(message)
        break

      case 'inference_error':
        this._handleInferenceError(message)
        break

      default:
        this.emit('unknown-message', peerId, message)
    }
  }

  /**
   * Handle worker status broadcast
   *
   * @private
   */
  _handleWorkerStatus(peerId, message) {
    const { workerId, health } = message

    // Update or add worker
    const existingWorker = this.workers.get(workerId)

    if (!existingWorker) {
      // New worker discovered
      this.workers.set(workerId, {
        workerId,
        peerId,
        health,
        lastSeen: Date.now()
      })

      this.emit('worker-discovered', workerId, health)

    } else {
      // Update existing worker
      existingWorker.health = health
      existingWorker.lastSeen = Date.now()

      this.emit('worker-updated', workerId, health)
    }
  }

  /**
   * Handle inference result
   *
   * @private
   */
  _handleInferenceResult(message) {
    const { requestId, result, workerId } = message

    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      return // Unknown or timed-out request
    }

    // Clear timeout
    clearTimeout(pending.timeout)
    this.pendingRequests.delete(requestId)

    // Resolve promise
    pending.resolve({
      ...result,
      workerId,
      requestDuration: Date.now() - pending.startTime
    })

    this.emit('request-completed', requestId, workerId, result)
  }

  /**
   * Handle inference error
   *
   * @private
   */
  _handleInferenceError(message) {
    const { requestId, error, workerId } = message

    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      return // Unknown or timed-out request
    }

    // Clear timeout
    clearTimeout(pending.timeout)
    this.pendingRequests.delete(requestId)

    // Reject promise
    pending.reject(new Error(`Worker ${workerId}: ${error}`))

    this.emit('request-failed', requestId, workerId, error)
  }

  /**
   * Select the best available worker based on health score
   *
   * @private
   * @returns {object|null} - Worker info or null if none available
   */
  _selectBestWorker() {
    let bestWorker = null
    let bestScore = -1

    for (const worker of this.workers.values()) {
      // Skip workers that can't accept requests
      if (!worker.health.canAcceptRequests) {
        continue
      }

      // Select worker with highest health score
      if (worker.health.score > bestScore) {
        bestScore = worker.health.score
        bestWorker = worker
      }
    }

    return bestWorker
  }

  /**
   * Generate a unique request ID
   *
   * @private
   * @returns {string} - Request ID
   */
  _generateRequestId() {
    const random = crypto.randomBytes(8)
    return b4a.toString(random, 'hex')
  }

  /**
   * Get all discovered workers
   *
   * @returns {object[]} - Array of worker info
   */
  getWorkers() {
    return Array.from(this.workers.values()).map(worker => ({
      workerId: worker.workerId,
      health: worker.health,
      lastSeen: worker.lastSeen
    }))
  }

  /**
   * Get worker count
   *
   * @returns {number} - Number of workers
   */
  getWorkerCount() {
    return this.workers.size
  }

  /**
   * Get client status
   *
   * @returns {object} - Client status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      topicKey: this.topicKey,
      workerCount: this.workers.size,
      pendingRequests: this.pendingRequests.size
    }
  }
}
