#!/usr/bin/env pear

/**
 * Simple P2P Test - Peer 2 (Client Node)
 * 
 * This peer:
 * - Joins the same Hyperswarm topic
 * - Connects to peer 1
 * - Sends test messages
 * - Receives responses
 * 
 * Run in Terminal 2: pear run --dev test-p2p-peer2.js
 */

import 'bare-node-runtime/global'
import process from '#process'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import crypto from 'bare-crypto'

console.log('\n🌐 P2P Test - Peer 2 (Client Node)\n')
console.log('='.repeat(60))

// Pear teardown
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n👋 Shutting down peer 2...')
  })
}

// Same topic as peer 1
const topicString = 'qmesh-p2p-test'
const topic = crypto.createHash('sha256').update(topicString).digest()

console.log(`Topic: ${topicString}`)
console.log(`Topic hash: ${b4a.toString(topic, 'hex').slice(0, 16)}...\n`)

// Create swarm
const swarm = new Hyperswarm()

// Track connections
let connectionCount = 0
let firstConnection = null

// Handle new connections
swarm.on('connection', (conn, info) => {
  connectionCount++
  
  const peerId = b4a.toString(info.publicKey, 'hex').slice(0, 8)
  console.log(`\n✅ Connected to peer: ${peerId}`)
  console.log(`   Total connections: ${connectionCount}`)
  console.log(`   Type: ${info.client ? 'client' : 'server'}`)

  // Save first connection for testing
  if (!firstConnection) {
    firstConnection = conn
    
    // Send test message after a short delay
    setTimeout(() => {
      sendTestMessage(conn, peerId)
    }, 1000)
  }

  // Handle incoming messages
  conn.on('data', (data) => {
    try {
      const message = JSON.parse(data.toString())
      console.log(`\n📨 Response from ${peerId}:`)
      console.log(`   Type: ${message.type}`)
      console.log(`   Data: ${JSON.stringify(message.data, null, 2)}`)
      
      // Test successful - shut down after 2 seconds
      console.log('\n🎉 P2P test SUCCESSFUL!')
      console.log('   - Connection established ✅')
      console.log('   - Message sent ✅')
      console.log('   - Response received ✅')
      console.log('\nShutting down in 2 seconds...')
      
      setTimeout(async () => {
        await swarm.destroy()
        console.log('✅ Shutdown complete')
        process.exit(0)
      }, 2000)

    } catch (error) {
      console.error(`❌ Error parsing message: ${error.message}`)
    }
  })

  // Handle connection close
  conn.on('close', () => {
    console.log(`\n❌ Disconnected from peer: ${peerId}`)
  })

  // Handle errors
  conn.on('error', (error) => {
    console.error(`\n❌ Connection error with ${peerId}:`, error.message)
  })
})

// Send test message
function sendTestMessage(conn, peerId) {
  const message = {
    type: 'test',
    data: {
      text: 'Hello from peer 2!',
      timestamp: Date.now()
    }
  }

  console.log(`\n📤 Sending test message to ${peerId}:`)
  console.log(`   ${JSON.stringify(message.data)}`)
  
  conn.write(JSON.stringify(message))
}

// Join the topic as a client (will connect to servers)
const discovery = swarm.join(topic, { server: false, client: true })

// Wait for topic to be fully announced
await discovery.flushed()

console.log('🔍 Peer 2 is searching for peer 1...')
console.log('   Waiting to discover and connect...\n')
console.log('Press Ctrl+C to exit\n')

// Timeout if no connection after 30 seconds
setTimeout(() => {
  if (connectionCount === 0) {
    console.error('\n❌ Test FAILED: No connection after 30 seconds')
    console.error('   Make sure peer 1 is running first!')
    process.exit(1)
  }
}, 30000)

// Keep alive
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...')
  await swarm.destroy()
  console.log('✅ Shutdown complete')
  process.exit(0)
})
