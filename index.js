#!/usr/bin/env pear

/**
 * QMesh Worker - Production Entry Point
 *
 * Distributed P2P LLM Inference Network
 * Running on Pear Runtime (Bare JavaScript)
 *
 * Usage:
 *   pear run qmesh-worker
 *   pear run --dev .
 */

import 'bare-node-runtime/global'
import process from '#process'
import { WorkerNode } from './src/worker/worker-node.js'
import { getBinaryPath } from './src/lib/binary-resolver.js'
import { ensureModel } from './src/lib/model-downloader.js'

console.log('\n🌐 QMesh P2P Worker\n')
console.log('='.repeat(60))

// Pear teardown hook
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n⚠️  Shutting down worker...')
  })
}

let worker = null

async function main() {
  try {
    // Production configuration
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
    console.log(`  Network Topic: ${config.networkTopic}`)
    console.log(`  Queue Capacity: ${config.queueCapacity}`)
    console.log('='.repeat(60))

    // Ensure model is available
    console.log('\n📦 Checking model availability...\n')
    await ensureModel(config.modelPath, { autoDownload: false })

    // Create worker
    console.log('\n⚙️  Initializing worker node...\n')

    worker = new WorkerNode(config)

    // Event handlers
    worker.on('ready', ({ workerId, health }) => {
      console.log('\n' + '='.repeat(60))
      console.log('\n🟢 Worker Ready!\n')
      console.log(`  Worker ID: ${workerId}`)
      console.log(`  Health: ${health.score} (${health.state})`)
      console.log('\n' + '='.repeat(60))
      console.log('\n📡 Listening for P2P requests...\n')
      console.log('Press Ctrl+C to exit\n')
    })

    worker.on('request-accepted', (peerId, requestId) => {
      console.log(`\n📥 Request accepted: ${requestId}`)
    })

    worker.on('request-completed', (peerId, requestId, stats) => {
      console.log(`✅ Request completed: ${requestId} (${stats.tokens} tokens, ${(stats.duration / 1000).toFixed(2)}s)`)
    })

    worker.on('error', (error) => {
      console.error(`\n❌ Worker error:`, error.message)
    })

    // Start worker
    await worker.start()

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

// Graceful shutdown handlers
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
