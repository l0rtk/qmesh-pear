#!/usr/bin/env pear

/**
 * End-to-End P2P Inference Test
 *
 * Complete integration test for Phase 2:
 * 1. Starts a WorkerNode
 * 2. Starts a QMeshClient
 * 3. Discovers workers
 * 4. Sends inference requests
 * 5. Validates responses
 * 6. Cleans up
 *
 * This is the comprehensive test that validates the entire P2P inference system.
 *
 * Usage: pear run --dev test-e2e-p2p-inference.js
 */

import 'bare-node-runtime/global'
import process from '#process'
import { WorkerNode } from './src/worker/worker-node.js'
import { QMeshClient } from './src/client/qmesh-client.js'
import { getBinaryPath } from './src/lib/binary-resolver.js'

console.log('\n🌐 End-to-End P2P Inference Test\n')
console.log('='.repeat(60))

let worker = null
let client = null
let testsPassed = 0
let testsFailed = 0

async function main() {
  try {
    console.log('\n📋 Test Configuration:\n')

    const config = {
      modelPath: './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
      binaryPath: getBinaryPath(),
      port: 8080,
      gpuLayers: 0,
      threads: 4,
      networkTopic: 'qmesh-e2e-test',
      queueCapacity: 5,
      verbose: false
    }

    console.log(`  Model: ${config.modelPath}`)
    console.log(`  Topic: ${config.networkTopic}`)
    console.log(`  Queue Capacity: ${config.queueCapacity}`)
    console.log('='.repeat(60))

    // Test 1: Start Worker
    console.log('\n📋 Test 1: Start Worker Node\n')

    worker = new WorkerNode(config)

    worker.on('ready', ({ workerId, health }) => {
      console.log(`   Worker ready: ${workerId.slice(0, 16)}...`)
      console.log(`   Health: ${health.score} (${health.state})`)
    })

    worker.on('request-accepted', (peerId, requestId) => {
      console.log(`   📥 Request accepted: ${requestId}`)
    })

    worker.on('request-completed', (peerId, requestId, stats) => {
      console.log(`   ✅ Request completed: ${requestId} (${stats.tokens} tokens, ${(stats.duration / 1000).toFixed(2)}s)`)
    })

    await worker.start()

    console.log('\n✅ Worker started successfully')
    testsPassed++

    // Test 2: Start Client
    console.log('\n📋 Test 2: Start Client\n')

    client = new QMeshClient({
      networkTopic: config.networkTopic,
      discoveryTimeout: 3000,
      requestTimeout: 30000
    })

    client.on('worker-discovered', (workerId, health) => {
      console.log(`   🔍 Discovered worker: ${workerId.slice(0, 16)}...`)
      console.log(`      Health: ${health.score} (${health.state})`)
    })

    await client.connect()

    console.log('\n✅ Client connected successfully')
    testsPassed++

    // Test 3: Worker Discovery
    console.log('\n📋 Test 3: Worker Discovery\n')

    const workerCount = await client.discoverWorkers(3000)

    if (workerCount > 0) {
      console.log(`\n✅ Discovered ${workerCount} worker(s)`)
      testsPassed++
    } else {
      console.log('\n❌ No workers discovered')
      testsFailed++
    }

    // Test 4: Single Inference Request
    console.log('\n📋 Test 4: Single Inference Request\n')

    const prompt1 = 'Say hello!'

    console.log(`   Prompt: "${prompt1}"`)
    console.log(`   Requesting...`)

    try {
      const result1 = await client.generate(prompt1, {
        maxTokens: 50,
        temperature: 0.7
      })

      console.log(`\n   Response: "${result1.text}"`)
      console.log(`   Tokens: ${result1.tokens}`)
      console.log(`   Duration: ${(result1.duration / 1000).toFixed(2)}s`)
      console.log(`   Speed: ${result1.tokensPerSecond} tok/s`)

      if (result1.text && result1.tokens > 0) {
        console.log('\n✅ Single inference request successful')
        testsPassed++
      } else {
        console.log('\n❌ Invalid inference result')
        testsFailed++
      }

    } catch (error) {
      console.error(`\n❌ Inference failed: ${error.message}`)
      testsFailed++
    }

    // Test 5: Multiple Concurrent Requests
    console.log('\n📋 Test 5: Multiple Concurrent Requests\n')

    const prompts = [
      'Count to 5',
      'Name a color',
      'Say goodbye'
    ]

    console.log(`   Sending ${prompts.length} concurrent requests...`)

    try {
      const promises = prompts.map(prompt =>
        client.generate(prompt, { maxTokens: 30, temperature: 0.7 })
      )

      const results = await Promise.all(promises)

      console.log(`\n   Results:`)
      for (let i = 0; i < results.length; i++) {
        console.log(`      ${i + 1}. "${results[i].text}" (${results[i].tokens} tokens)`)
      }

      const allValid = results.every(r => r.text && r.tokens > 0)

      if (allValid) {
        console.log('\n✅ Multiple concurrent requests successful')
        testsPassed++
      } else {
        console.log('\n❌ Some requests returned invalid results')
        testsFailed++
      }

    } catch (error) {
      console.error(`\n❌ Concurrent requests failed: ${error.message}`)
      testsFailed++
    }

    // Test 6: Worker Health Monitoring
    console.log('\n📋 Test 6: Worker Health Monitoring\n')

    const workerStatus = worker.getStatus()

    console.log(`   Worker ID: ${workerStatus.workerId.slice(0, 16)}...`)
    console.log(`   Running: ${workerStatus.isRunning}`)
    console.log(`   Health: ${workerStatus.health.score} (${workerStatus.health.state})`)
    console.log(`   Queue: ${workerStatus.health.queue.size}/${workerStatus.health.queue.capacity}`)
    console.log(`   Peers: ${workerStatus.peerCount}`)

    if (workerStatus.isRunning && workerStatus.health.score >= 0) {
      console.log('\n✅ Worker health monitoring working')
      testsPassed++
    } else {
      console.log('\n❌ Worker health monitoring failed')
      testsFailed++
    }

    // Test 7: Client Status
    console.log('\n📋 Test 7: Client Status\n')

    const clientStatus = client.getStatus()

    console.log(`   Connected: ${clientStatus.isConnected}`)
    console.log(`   Workers: ${clientStatus.workerCount}`)
    console.log(`   Pending requests: ${clientStatus.pendingRequests}`)

    if (clientStatus.isConnected && clientStatus.workerCount > 0) {
      console.log('\n✅ Client status working')
      testsPassed++
    } else {
      console.log('\n❌ Client status failed')
      testsFailed++
    }

    // Print final results
    console.log('\n' + '='.repeat(60))
    console.log('\n📊 Test Results:\n')
    console.log(`   Tests passed: ${testsPassed}`)
    console.log(`   Tests failed: ${testsFailed}`)
    console.log(`   Success rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`)

    const allPassed = testsFailed === 0

    if (allPassed) {
      console.log('\n✅ END-TO-END TEST PASSED!\n')
      console.log('Phase 2 Complete: P2P Inference Working')
      console.log('\nKey validations:')
      console.log('  ✅ Worker startup')
      console.log('  ✅ Client connection')
      console.log('  ✅ Worker discovery')
      console.log('  ✅ Single inference request')
      console.log('  ✅ Concurrent requests')
      console.log('  ✅ Health monitoring')
      console.log('  ✅ Status reporting')
      console.log('\nArchitecture validated:')
      console.log('  - Pear Runtime (Bare v1.21.7)')
      console.log('  - llama-server sidecar (HTTP)')
      console.log('  - Hyperswarm P2P networking')
      console.log('  - Length-prefixed message protocol')
      console.log('  - Health-based worker selection')
    } else {
      console.log('\n❌ END-TO-END TEST FAILED\n')
    }

    console.log('\n' + '='.repeat(60))

    // Cleanup
    await cleanup()

    process.exit(allPassed ? 0 : 1)

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

  if (client) {
    await client.disconnect()
    console.log('  ✅ Client disconnected')
  }

  if (worker) {
    await worker.stop()
    console.log('  ✅ Worker stopped')
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
