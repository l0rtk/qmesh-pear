/**
 * Network Manager - P2P Networking with Hyperswarm
 *
 * Wraps Hyperswarm with a clean API for QMesh P2P communication.
 *
 * Features:
 * - Length-prefixed JSON message protocol
 * - Event-based architecture (peer-connected, peer-disconnected, message)
 * - Multi-topic support
 * - Connection lifecycle management
 * - Automatic reconnection handling
 *
 * Usage:
 *   const manager = new NetworkManager()
 *
 *   manager.on('peer-connected', (peerId, conn) => { ... })
 *   manager.on('message', (peerId, message) => { ... })
 *
 *   await manager.joinNetwork('qmesh-inference')
 *   manager.broadcast({ type: 'status', data: { ... } })
 */

import EventEmitter from 'bare-events'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import crypto from 'bare-crypto'

/**
 * NetworkManager - Manages P2P connections via Hyperswarm
 */
export class NetworkManager extends EventEmitter {
  constructor(options = {}) {
    super()

    this.swarm = new Hyperswarm()
    this.topics = new Map() // topic -> { discovery, connections: Set }
    this.peers = new Map()  // peerId -> { conn, info, buffers: [] }

    this.options = {
      maxMessageSize: options.maxMessageSize || 10 * 1024 * 1024, // 10MB default
      ...options
    }

    // Track overall swarm connection events
    this.swarm.on('connection', (conn, info) => {
      this._handleConnection(conn, info)
    })
  }

  /**
   * Join a P2P network topic
   *
   * @param {string} topicName - Topic name (will be hashed to create topic key)
   * @param {object} options - Join options
   * @param {boolean} options.server - Accept incoming connections (default: true)
   * @param {boolean} options.client - Make outgoing connections (default: true)
   * @returns {Promise<string>} - Topic hash (hex)
   */
  async joinNetwork(topicName, options = {}) {
    const topicHash = crypto.createHash('sha256').update(topicName).digest()
    const topicKey = b4a.toString(topicHash, 'hex')

    // Check if already joined
    if (this.topics.has(topicKey)) {
      return topicKey
    }

    // Join options
    const joinOptions = {
      server: options.server !== undefined ? options.server : true,
      client: options.client !== undefined ? options.client : true
    }

    // Join the topic
    const discovery = this.swarm.join(topicHash, joinOptions)

    // Store topic info
    this.topics.set(topicKey, {
      name: topicName,
      discovery,
      connections: new Set(),
      options: joinOptions
    })

    // Wait for topic to be announced to the DHT
    await discovery.flushed()

    this.emit('topic-joined', topicKey, topicName)

    return topicKey
  }

  /**
   * Leave a P2P network topic
   *
   * @param {string} topicKey - Topic hash (from joinNetwork)
   */
  async leaveNetwork(topicKey) {
    const topic = this.topics.get(topicKey)
    if (!topic) return

    // Close all connections for this topic
    for (const conn of topic.connections) {
      conn.end()
    }

    // Leave the DHT topic
    await topic.discovery.destroy()

    this.topics.delete(topicKey)
    this.emit('topic-left', topicKey, topic.name)
  }

  /**
   * Handle new connection from swarm
   *
   * @private
   */
  _handleConnection(conn, info) {
    const peerId = b4a.toString(info.publicKey, 'hex').slice(0, 16)

    // Initialize peer state
    this.peers.set(peerId, {
      conn,
      info,
      buffers: [],        // Accumulated data buffers
      expectedLength: null, // Expected message length (from prefix)
      bytesRead: 0        // Bytes read so far
    })

    // Add connection to all active topics
    // (In single-topic apps, this is fine. Multi-topic would need topic filtering)
    for (const topic of this.topics.values()) {
      topic.connections.add(conn)
    }

    // Emit peer-connected event
    this.emit('peer-connected', peerId, conn, info)

    // Handle incoming data (length-prefixed messages)
    conn.on('data', (data) => {
      this._handleData(peerId, data)
    })

    // Handle connection close
    conn.on('close', () => {
      this._handleDisconnect(peerId)
    })

    // Handle errors
    conn.on('error', (error) => {
      this.emit('peer-error', peerId, error)
    })
  }

  /**
   * Handle incoming data with length-prefixed protocol
   *
   * Protocol: [4-byte length (big-endian)] + [JSON message bytes]
   *
   * @private
   */
  _handleData(peerId, data) {
    const peer = this.peers.get(peerId)
    if (!peer) return

    // Add new data to buffer
    peer.buffers.push(data)
    peer.bytesRead += data.length

    // Process complete messages
    while (true) {
      // Step 1: Read length prefix (4 bytes)
      if (peer.expectedLength === null) {
        if (peer.bytesRead < 4) {
          // Not enough data for length prefix yet
          break
        }

        // Concatenate buffers to read length
        const combined = b4a.concat(peer.buffers)
        peer.expectedLength = combined.readUInt32BE(0)

        // Validate message size
        if (peer.expectedLength > this.options.maxMessageSize) {
          this.emit('peer-error', peerId, new Error(`Message too large: ${peer.expectedLength} bytes`))
          peer.conn.destroy()
          return
        }

        // Remove length prefix from buffers
        peer.buffers = [combined.slice(4)]
        peer.bytesRead -= 4
      }

      // Step 2: Read message body
      if (peer.bytesRead < peer.expectedLength) {
        // Not enough data for complete message yet
        break
      }

      // We have a complete message!
      const combined = b4a.concat(peer.buffers)
      const messageBytes = combined.slice(0, peer.expectedLength)
      const remaining = combined.slice(peer.expectedLength)

      // Parse message
      try {
        const messageStr = b4a.toString(messageBytes, 'utf8')
        const message = JSON.parse(messageStr)

        // Emit message event
        this.emit('message', peerId, message)

      } catch (error) {
        this.emit('peer-error', peerId, new Error(`Failed to parse message: ${error.message}`))
      }

      // Reset for next message
      peer.buffers = remaining.length > 0 ? [remaining] : []
      peer.bytesRead = remaining.length
      peer.expectedLength = null
    }
  }

  /**
   * Handle peer disconnection
   *
   * @private
   */
  _handleDisconnect(peerId) {
    const peer = this.peers.get(peerId)
    if (!peer) return

    // Remove from all topics
    for (const topic of this.topics.values()) {
      topic.connections.delete(peer.conn)
    }

    this.peers.delete(peerId)
    this.emit('peer-disconnected', peerId)
  }

  /**
   * Send a message to a specific peer
   *
   * @param {string} peerId - Peer ID (hex string)
   * @param {object} message - Message object (will be JSON serialized)
   */
  sendMessage(peerId, message) {
    const peer = this.peers.get(peerId)
    if (!peer) {
      throw new Error(`Peer not found: ${peerId}`)
    }

    this._writeMessage(peer.conn, message)
  }

  /**
   * Broadcast a message to all connected peers
   *
   * @param {object} message - Message object (will be JSON serialized)
   * @param {string} [topicKey] - Optional: only broadcast to peers on this topic
   */
  broadcast(message, topicKey = null) {
    let connections

    if (topicKey) {
      const topic = this.topics.get(topicKey)
      if (!topic) {
        throw new Error(`Topic not found: ${topicKey}`)
      }
      connections = topic.connections
    } else {
      // Broadcast to all peers
      connections = Array.from(this.peers.values()).map(p => p.conn)
    }

    for (const conn of connections) {
      this._writeMessage(conn, message)
    }
  }

  /**
   * Write a length-prefixed message to a connection
   *
   * Protocol: [4-byte length (big-endian)] + [JSON message bytes]
   *
   * @private
   */
  _writeMessage(conn, message) {
    const messageStr = JSON.stringify(message)
    const messageBytes = b4a.from(messageStr, 'utf8')

    // Create length prefix (4 bytes, big-endian)
    const lengthPrefix = b4a.alloc(4)
    lengthPrefix.writeUInt32BE(messageBytes.length, 0)

    // Write length + message
    const packet = b4a.concat([lengthPrefix, messageBytes])
    conn.write(packet)
  }

  /**
   * Get all connected peer IDs
   *
   * @param {string} [topicKey] - Optional: only get peers on this topic
   * @returns {string[]} - Array of peer IDs
   */
  getPeers(topicKey = null) {
    if (topicKey) {
      const topic = this.topics.get(topicKey)
      if (!topic) return []

      return Array.from(this.peers.entries())
        .filter(([_, peer]) => topic.connections.has(peer.conn))
        .map(([peerId]) => peerId)
    }

    return Array.from(this.peers.keys())
  }

  /**
   * Get connection info for a peer
   *
   * @param {string} peerId - Peer ID
   * @returns {object|null} - Connection info or null
   */
  getPeerInfo(peerId) {
    const peer = this.peers.get(peerId)
    if (!peer) return null

    return {
      peerId,
      publicKey: b4a.toString(peer.info.publicKey, 'hex'),
      isClient: peer.info.client,
      isServer: !peer.info.client
    }
  }

  /**
   * Get all joined topics
   *
   * @returns {object[]} - Array of topic info
   */
  getTopics() {
    return Array.from(this.topics.entries()).map(([key, topic]) => ({
      key,
      name: topic.name,
      connectionCount: topic.connections.size,
      options: topic.options
    }))
  }

  /**
   * Clean shutdown - close all connections and leave all topics
   */
  async destroy() {
    // Leave all topics
    for (const topicKey of this.topics.keys()) {
      await this.leaveNetwork(topicKey)
    }

    // Destroy swarm
    await this.swarm.destroy()

    // Clear state
    this.peers.clear()
    this.topics.clear()

    this.emit('destroyed')
  }
}
