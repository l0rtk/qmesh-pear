#!/usr/bin/env pear

/**
 * Simple P2P Test - Peer 1 (Discovery Node)
 * 
 * This peer:
 * - Joins a Hyperswarm topic
 * - Listens for connections
 * - Receives messages
 * - Sends responses
 * 
 * Run in Terminal 1: pear run --dev test-p2p-peer1.js
 */

import 'bare-node-runtime/global'
import process from '#process'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import crypto from 'bare-crypto'

console.log('\n🌐 P2P Test - Peer 1 (Discovery Node)\n')
console.log('='.repeat(60))

// Pear teardown
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n👋 Shutting down peer 1...')
  })
}

// Create a deterministic topic for testing
const topicString = 'qmesh-p2p-test'
const topic = crypto.createHash('sha256').update(topicString).digest()

console.log(`Topic: ${topicString}`)
console.log(`Topic hash: ${b4a.toString(topic, 'hex').slice(0, 16)}...\n`)

// Create swarm
const swarm = new Hyperswarm()

// Track connections
let connectionCount = 0
const connections = new Set()

// Handle new connections
swarm.on('connection', (conn, info) => {
  connectionCount++
  connections.add(conn)
  
  const peerId = b4a.toString(info.publicKey, 'hex').slice(0, 8)
  console.log(`\n✅ Peer connected: ${peerId}`)
  console.log(`   Total connections: ${connectionCount}`)
  console.log(`   Active connections: ${connections.size}`)
  console.log(`   Type: ${info.client ? 'client' : 'server'}`)

  // Handle incoming messages
  conn.on('data', (data) => {
    try {
      const message = JSON.parse(data.toString())
      console.log(`\n📨 Message from ${peerId}:`)
      console.log(`   Type: ${message.type}`)
      console.log(`   Data: ${JSON.stringify(message.data)}`)

      // Send response
      const response = {
        type: 'response',
        data: {
          received: message.data,
          timestamp: Date.now(),
          from: 'peer1'
        }
      }

      conn.write(JSON.stringify(response))
      console.log(`📤 Sent response to ${peerId}`)

    } catch (error) {
      console.error(`❌ Error parsing message: ${error.message}`)
    }
  })

  // Handle connection close
  conn.on('close', () => {
    connections.delete(conn)
    console.log(`\n❌ Peer disconnected: ${peerId}`)
    console.log(`   Active connections: ${connections.size}`)
  })

  // Handle errors
  conn.on('error', (error) => {
    console.error(`\n❌ Connection error with ${peerId}:`, error.message)
  })
})

// Join the topic as a server (will accept connections)
const discovery = swarm.join(topic, { server: true, client: false })

// Wait for topic to be fully announced
await discovery.flushed()

console.log('🟢 Peer 1 is ready and listening for connections!')
console.log('   Waiting for peer 2 to connect...\n')
console.log('Press Ctrl+C to exit\n')

// Keep alive
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...')
  await swarm.destroy()
  console.log('✅ Shutdown complete')
  process.exit(0)
})
