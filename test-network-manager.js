#!/usr/bin/env pear

/**
 * Network Manager Test
 *
 * Tests the NetworkManager with length-prefixed message protocol
 *
 * This test:
 * 1. Creates two NetworkManager instances
 * 2. Joins them to the same topic
 * 3. Tests bidirectional messaging
 * 4. Validates length-prefixed protocol works
 *
 * Usage: pear run --dev test-network-manager.js
 */

import 'bare-node-runtime/global'
import process from '#process'
import { NetworkManager } from './src/lib/network-manager.js'

console.log('\n🌐 Network Manager Test\n')
console.log('='.repeat(60))

// Test configuration
const TOPIC_NAME = 'qmesh-test'
const TEST_DURATION = 10000 // 10 seconds

let manager1 = null
let manager2 = null
let messagesReceived = 0
let testPassed = false

async function main() {
  try {
    console.log('\n📋 Test Configuration:\n')
    console.log(`  Topic: ${TOPIC_NAME}`)
    console.log(`  Test Duration: ${TEST_DURATION}ms`)
    console.log('='.repeat(60))

    // Step 1: Create two network managers
    console.log('\n⚙️  Creating network managers...\n')

    manager1 = new NetworkManager()
    manager2 = new NetworkManager()

    // Set up event handlers for manager1
    manager1.on('peer-connected', (peerId, conn, info) => {
      console.log(`✅ Manager 1: Peer connected - ${peerId}`)
      console.log(`   Type: ${info.client ? 'client' : 'server'}`)
    })

    manager1.on('peer-disconnected', (peerId) => {
      console.log(`❌ Manager 1: Peer disconnected - ${peerId}`)
    })

    manager1.on('message', (peerId, message) => {
      console.log(`\n📨 Manager 1 received message from ${peerId}:`)
      console.log(`   Type: ${message.type}`)
      console.log(`   Data: ${JSON.stringify(message.data)}`)
      messagesReceived++

      // Send a response
      if (message.type === 'ping') {
        manager1.sendMessage(peerId, {
          type: 'pong',
          data: {
            originalData: message.data,
            timestamp: Date.now(),
            from: 'manager1'
          }
        })
        console.log(`📤 Manager 1 sent pong response`)
      }
    })

    manager1.on('peer-error', (peerId, error) => {
      console.error(`❌ Manager 1 error with ${peerId}:`, error.message)
    })

    // Set up event handlers for manager2
    manager2.on('peer-connected', (peerId, conn, info) => {
      console.log(`✅ Manager 2: Peer connected - ${peerId}`)
      console.log(`   Type: ${info.client ? 'client' : 'server'}`)

      // Send test message after connection
      setTimeout(() => {
        console.log(`\n📤 Manager 2 sending ping message to ${peerId}...`)
        manager2.sendMessage(peerId, {
          type: 'ping',
          data: {
            text: 'Hello from manager 2!',
            timestamp: Date.now(),
            testNumber: 1
          }
        })
      }, 2000)
    })

    manager2.on('peer-disconnected', (peerId) => {
      console.log(`❌ Manager 2: Peer disconnected - ${peerId}`)
    })

    manager2.on('message', (peerId, message) => {
      console.log(`\n📨 Manager 2 received message from ${peerId}:`)
      console.log(`   Type: ${message.type}`)
      console.log(`   Data: ${JSON.stringify(message.data)}`)
      messagesReceived++

      if (message.type === 'pong') {
        testPassed = true
      }
    })

    manager2.on('peer-error', (peerId, error) => {
      console.error(`❌ Manager 2 error with ${peerId}:`, error.message)
    })

    console.log('✅ Network managers created')
    console.log('='.repeat(60))

    // Step 2: Join the same topic
    console.log('\n🌐 Joining P2P network...\n')

    const topic1 = await manager1.joinNetwork(TOPIC_NAME, { server: true, client: false })
    console.log(`✅ Manager 1 joined topic: ${topic1.slice(0, 16)}...`)

    const topic2 = await manager2.joinNetwork(TOPIC_NAME, { server: false, client: true })
    console.log(`✅ Manager 2 joined topic: ${topic2.slice(0, 16)}...`)

    console.log('='.repeat(60))
    console.log('\n🟢 Test running... waiting for messages\n')

    // Step 3: Wait for test to complete
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve()
      }, TEST_DURATION)
    })

    // Step 4: Print results
    console.log('\n' + '='.repeat(60))
    console.log('\n📊 Test Results:\n')
    console.log(`  Messages received: ${messagesReceived}`)
    console.log(`  Test passed: ${testPassed ? '✅ YES' : '❌ NO'}`)

    if (testPassed && messagesReceived >= 2) {
      console.log('\n✅ Network Manager test PASSED!\n')
      console.log('Key validations:')
      console.log('  ✅ Peer discovery working')
      console.log('  ✅ Connection established')
      console.log('  ✅ Length-prefixed protocol working')
      console.log('  ✅ Bidirectional messaging working')
      console.log('  ✅ Event system working')
    } else {
      console.log('\n❌ Network Manager test FAILED\n')
      console.log('Expected:')
      console.log('  - Manager 2 sends ping')
      console.log('  - Manager 1 receives ping and sends pong')
      console.log('  - Manager 2 receives pong')
      console.log('  - At least 2 messages total')
    }

    console.log('\n' + '='.repeat(60))

    // Cleanup
    await cleanup()

    process.exit(testPassed && messagesReceived >= 2 ? 0 : 1)

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('\nStack trace:')
    console.error(error.stack)

    await cleanup()
    process.exit(1)
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...')

  if (manager1) {
    await manager1.destroy()
    console.log('  ✅ Manager 1 destroyed')
  }

  if (manager2) {
    await manager2.destroy()
    console.log('  ✅ Manager 2 destroyed')
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrupted. Shutting down...')
  await cleanup()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n\n⚠️  Terminated. Shutting down...')
  await cleanup()
  process.exit(0)
})

main()
