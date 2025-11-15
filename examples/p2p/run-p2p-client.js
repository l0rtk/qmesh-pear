#!/usr/bin/env pear

/**
 * P2P Client Example
 *
 * Connects to the QMesh P2P network and sends inference requests to workers.
 *
 * Usage:
 *   pear run --dev examples/p2p/run-p2p-client.js
 *
 * Note: Start a worker first with run-p2p-worker.js
 */

import 'bare-node-runtime/global'
import process from '#process'
import { QMeshClient } from '../../src/client/qmesh-client.js'

console.log('\n🌐 QMesh P2P Client\n')
console.log('='.repeat(60))

// Pear teardown
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n⚠️  Shutting down client...')
  })
}

let client = null

async function main() {
  try {
    // Configuration
    console.log('\n📋 Client Configuration:\n')

    const config = {
      networkTopic: 'qmesh-inference',
      discoveryTimeout: 5000,  // 5 seconds
      requestTimeout: 60000    // 60 seconds
    }

    console.log(`  Network Topic: ${config.networkTopic}`)
    console.log(`  Discovery Timeout: ${config.discoveryTimeout}ms`)
    console.log(`  Request Timeout: ${config.requestTimeout}ms`)
    console.log('='.repeat(60))

    // Create client
    console.log('\n⚙️  Initializing client...\n')

    client = new QMeshClient(config)

    // Event handlers
    client.on('connected', ({ topicKey }) => {
      console.log(`✅ Connected to network`)
      console.log(`   Topic: ${topicKey.slice(0, 16)}...`)
    })

    client.on('worker-discovered', (workerId, health) => {
      console.log(`\n🔍 Worker discovered: ${workerId}`)
      console.log(`   Health: ${health.score} (${health.state})`)
      console.log(`   Can accept: ${health.canAcceptRequests ? 'YES' : 'NO'}`)
    })

    client.on('worker-updated', (workerId, health) => {
      // Only log occasionally to reduce noise
      if (Math.random() < 0.1) {
        console.log(`\n🔄 Worker updated: ${workerId.slice(0, 16)}... (Health: ${health.score})`)
      }
    })

    client.on('worker-lost', (workerId) => {
      console.log(`\n❌ Worker lost: ${workerId}`)
    })

    client.on('request-sent', (workerId, requestId, prompt) => {
      console.log(`\n📤 Request sent to worker ${workerId.slice(0, 16)}...`)
      console.log(`   Request ID: ${requestId}`)
      console.log(`   Prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`)
    })

    client.on('request-completed', (requestId, workerId, result) => {
      console.log(`\n✅ Request completed: ${requestId}`)
      console.log(`   Worker: ${workerId.slice(0, 16)}...`)
      console.log(`   Tokens: ${result.tokens}`)
      console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`)
      console.log(`   Speed: ${result.tokensPerSecond} tok/s`)
    })

    client.on('request-failed', (requestId, workerId, error) => {
      console.error(`\n❌ Request failed: ${requestId}`)
      console.error(`   Worker: ${workerId}`)
      console.error(`   Error: ${error}`)
    })

    // Connect to network
    await client.connect()

    console.log('\n🔍 Discovering workers...\n')

    // Wait for worker discovery
    const workerCount = await client.discoverWorkers()

    console.log('\n' + '='.repeat(60))
    console.log(`\n✅ Discovery complete: ${workerCount} worker(s) found\n`)

    if (workerCount === 0) {
      console.log('⚠️  No workers available.')
      console.log('   Start a worker first with: pear run --dev examples/p2p/run-p2p-worker.js')
      console.log('\n' + '='.repeat(60))
      await cleanup()
      process.exit(1)
    }

    // Show available workers
    console.log('Available workers:')
    const workers = client.getWorkers()
    for (const worker of workers) {
      console.log(`  - ${worker.workerId}`)
      console.log(`    Health: ${worker.health.score} (${worker.health.state})`)
      console.log(`    Queue: ${worker.health.queueSize}/${worker.health.queueCapacity}`)
    }

    console.log('\n' + '='.repeat(60))

    // Send test requests
    console.log('\n📝 Sending test inference requests...\n')

    const testPrompts = [
      'Tell me a short joke about programming',
      'What is the capital of France?',
      'Explain quantum computing in one sentence'
    ]

    for (let i = 0; i < testPrompts.length; i++) {
      const prompt = testPrompts[i]

      console.log(`\n📋 Test ${i + 1}/${testPrompts.length}:`)
      console.log(`   Prompt: "${prompt}"`)

      try {
        const result = await client.generate(prompt, {
          maxTokens: 100,
          temperature: 0.7
        })

        console.log(`\n   Response:`)
        console.log(`   ${'-'.repeat(58)}`)
        console.log(`   ${result.text}`)
        console.log(`   ${'-'.repeat(58)}`)
        console.log(`   (${result.tokens} tokens, ${(result.duration / 1000).toFixed(2)}s)`)

      } catch (error) {
        console.error(`\n   ❌ Error: ${error.message}`)
      }

      // Wait a bit between requests
      if (i < testPrompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('\n✅ All tests completed!\n')
    console.log('='.repeat(60))

    // Cleanup
    await cleanup()
    process.exit(0)

  } catch (error) {
    console.error('\n❌ Client failed:', error.message)
    console.error('\nStack trace:')
    console.error(error.stack)

    await cleanup()
    process.exit(1)
  }
}

async function cleanup() {
  if (client) {
    console.log('\n🧹 Cleaning up...')
    await client.disconnect()
    console.log('✅ Disconnected')
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
