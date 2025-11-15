#!/usr/bin/env pear

/**
 * Run Worker Example (Pear Sidecar Version)
 * Starts a QMesh worker node with sidecar architecture
 *
 * Usage:
 *   pear run --dev examples/inference/run-worker.js
 */

import 'bare-node-runtime/global'
import process from '#process'
import { InferenceEngineSidecar } from '../../src/worker/inference-engine-sidecar.js'

// Pear teardown
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n⚠️  Shutting down worker...')
  })
}

async function main() {
  console.log('🌐 QMesh Worker Node (Pear Sidecar)\n')
  console.log('='.repeat(60))

  let engine = null

  try {
    // Step 1: Configuration
    console.log('\n📋 Worker Configuration:\n')

    const config = {
      modelPath: './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
      binaryPath: '/home/luka/llama.cpp/build/bin/llama-server',
      port: 8080,
      gpuLayers: 0,  // CPU only (change to 33 for GPU)
      threads: 4,
      verbose: false
    }

    console.log(`  Model: ${config.modelPath}`)
    console.log(`  Binary: ${config.binaryPath}`)
    console.log(`  Port: ${config.port}`)
    console.log(`  GPU Layers: ${config.gpuLayers} (${config.gpuLayers > 0 ? 'GPU' : 'CPU'})`)
    console.log(`  Threads: ${config.threads}`)

    console.log('='.repeat(60))

    // Step 2: Initialize inference engine
    console.log('\n⚙️  Initializing inference engine...\n')

    engine = new InferenceEngineSidecar(config, {
      temperature: 0.7,
      maxTokens: 200,
    })

    // Start llama-server subprocess
    await engine.start()

    console.log('✅ Inference engine ready')
    console.log('='.repeat(60))

    // Step 3: Worker is ready (P2P networking not implemented yet)
    console.log('\n🟢 Worker Ready!\n')

    console.log('⚠️  NOTE: P2P networking not yet implemented (Phase 2)')
    console.log('         This worker can perform local inference only.\n')

    // Step 4: Quick test to verify everything works
    console.log('Running quick test...\n')

    const testPrompt = 'Say hello!, how are you?'
    console.log(`Prompt: "${testPrompt}"`)
    console.log('Generating...\n')

    console.log('Response:')
    console.log('-'.repeat(60))

    let responseText = ''
    const result = await engine.chatStream(testPrompt, (token) => {
      process.stdout.write(token)
      responseText += token
    }, {
      maxTokens: 50,
      temperature: 0.7,
    })

    console.log('\n' + '-'.repeat(60))
    console.log(`\nStats: ${result.tokens} tokens in ${result.duration.toFixed(2)}s (${result.tokensPerSecond} tokens/sec)\n`)

    console.log('='.repeat(60))
    console.log('\n✅ Worker test completed successfully!\n')

    console.log('Architecture:')
    console.log('  - Pear Runtime (Bare v1.21.7)')
    console.log('  - llama-server subprocess (HTTP sidecar)')
    console.log('  - InferenceEngineSidecar adapter\n')

    console.log('Next steps:')
    console.log('  - Phase 2: Implement P2P networking (Hyperswarm)')
    console.log('  - Phase 2: Implement system monitoring and health scores')
    console.log('  - Phase 2: Implement worker discovery and request handling\n')

    // Cleanup
    await engine.dispose()

    process.exit(0)

  } catch (error) {
    console.error('\n❌ Worker failed:', error.message)
    console.error('\nStack trace:')
    console.error(error.stack)

    // Cleanup
    if (engine) {
      try {
        await engine.dispose()
      } catch (e) {
        console.error('Cleanup error:', e.message)
      }
    }

    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Shutting down worker...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Shutting down worker...')
  process.exit(0)
})

main()
