#!/usr/bin/env pear

/**
 * P2P Worker Example
 *
 * Starts a QMesh worker that:
 * - Joins the P2P network
 * - Accepts inference requests from clients
 * - Broadcasts availability and health status
 *
 * Usage:
 *   pear run --dev examples/p2p/run-p2p-worker.js
 */

import 'bare-node-runtime/global'
import process from '#process'
import { WorkerNode } from '../../src/worker/worker-node.js'
import { getBinaryPath } from '../../src/lib/binary-resolver.js'

console.log('\n🌐 QMesh P2P Worker\n')
console.log('='.repeat(60))

// Pear teardown
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n⚠️  Shutting down worker...')
  })
}

let worker = null

async function main() {
  try {
    // Configuration
    console.log('\n📋 Worker Configuration:\n')

    const config = {
      // Model and inference
      modelPath: './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
      binaryPath: getBinaryPath(),
      port: 8080,
      gpuLayers: 0,  // CPU only (change to 33 for GPU)
      threads: 4,
      temperature: 0.7,
      maxTokens: 200,

      // P2P network
      networkTopic: 'qmesh-inference',

      // Queue and health
      queueCapacity: 10,
      statusBroadcastInterval: 10000, // 10 seconds

      verbose: false
    }

    console.log(`  Model: ${config.modelPath}`)
    console.log(`  Binary: ${config.binaryPath}`)
    console.log(`  Port: ${config.port}`)
    console.log(`  GPU Layers: ${config.gpuLayers} (${config.gpuLayers > 0 ? 'GPU' : 'CPU'})`)
    console.log(`  Threads: ${config.threads}`)
    console.log(`  Network Topic: ${config.networkTopic}`)
    console.log(`  Queue Capacity: ${config.queueCapacity}`)
    console.log('='.repeat(60))

    // Create worker
    console.log('\n⚙️  Initializing worker node...\n')

    worker = new WorkerNode(config)

    // Event handlers
    worker.on('starting', ({ step }) => {
      console.log(`   🔄 Starting ${step}...`)
    })

    worker.on('started', ({ subsystem, topicKey }) => {
      console.log(`   ✅ ${subsystem} started${topicKey ? ` (topic: ${topicKey.slice(0, 16)}...)` : ''}`)
    })

    worker.on('ready', ({ workerId, topicKey, health }) => {
      console.log('\n' + '='.repeat(60))
      console.log('\n🟢 Worker Ready!\n')
      console.log(`  Worker ID: ${workerId}`)
      console.log(`  Topic: ${topicKey.slice(0, 16)}...`)
      console.log(`  Health: ${health.score} (${health.state} ${getHealthEmoji(health.state)})`)
      console.log(`  Accepting requests: ${health.canAcceptRequests ? 'YES' : 'NO'}`)
      console.log('\n' + '='.repeat(60))
      console.log('\n📡 Listening for P2P requests...\n')
      console.log('Press Ctrl+C to exit\n')
    })

    worker.on('peer-connected', (peerId, info) => {
      console.log(`\n✅ Peer connected: ${peerId}`)
      console.log(`   Type: ${info.client ? 'client' : 'server'}`)
    })

    worker.on('peer-disconnected', (peerId) => {
      console.log(`\n❌ Peer disconnected: ${peerId}`)
    })

    worker.on('status-broadcast', (status) => {
      // Only log every 3rd broadcast to reduce noise
      if (Math.random() < 0.33) {
        console.log(`\n📡 Status broadcast: Health ${status.health.score}, Queue ${status.health.queueSize}/${status.health.queueCapacity}`)
      }
    })

    worker.on('request-accepted', (peerId, requestId, prompt) => {
      console.log(`\n📥 Request accepted from ${peerId}`)
      console.log(`   Request ID: ${requestId}`)
      console.log(`   Prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`)
    })

    worker.on('request-completed', (peerId, requestId, stats) => {
      console.log(`\n✅ Request completed: ${requestId}`)
      console.log(`   Tokens: ${stats.tokens}`)
      console.log(`   Duration: ${(stats.duration / 1000).toFixed(2)}s`)
      console.log(`   Speed: ${Math.round(stats.tokens / (stats.duration / 1000))} tok/s`)
    })

    worker.on('request-rejected', (peerId, requestId, reason) => {
      console.log(`\n⚠️  Request rejected: ${requestId}`)
      console.log(`   Reason: ${reason}`)
    })

    worker.on('request-failed', (peerId, requestId, error) => {
      console.log(`\n❌ Request failed: ${requestId}`)
      console.log(`   Error: ${error.message}`)
    })

    worker.on('peer-error', (peerId, error) => {
      console.error(`\n❌ Peer error with ${peerId}:`, error.message)
    })

    worker.on('error', (error) => {
      console.error(`\n❌ Worker error:`, error.message)
    })

    // Start worker
    await worker.start()

    // Keep alive - worker runs until stopped
    // The process will exit on SIGINT/SIGTERM or manual shutdown

  } catch (error) {
    console.error('\n❌ Worker failed:', error.message)
    console.error('\nStack trace:')
    console.error(error.stack)

    await cleanup()
    process.exit(1)
  }
}

async function cleanup() {
  if (worker) {
    console.log('\n🧹 Cleaning up...')
    await worker.stop()
    console.log('✅ Shutdown complete')
  }
}

function getHealthEmoji(state) {
  switch (state) {
    case 'healthy':
      return '🟢'
    case 'busy':
      return '🟡'
    case 'overloaded':
      return '🔴'
    default:
      return '⚪'
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Shutting down worker...')
  await cleanup()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n\n⚠️  Shutting down worker...')
  await cleanup()
  process.exit(0)
})

main()
