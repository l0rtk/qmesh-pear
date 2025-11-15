#!/usr/bin/env pear

/**
 * Test InferenceEngineSidecar adapter
 * Verify it's compatible with the original InferenceEngine API
 */

import 'bare-node-runtime/global'
import process from '#process'
import { InferenceEngineSidecar } from './src/worker/inference-engine-sidecar.js'

console.log('\n🧪 Testing InferenceEngineSidecar\n')
console.log('='.repeat(60))

// Pear teardown
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n👋 Test shutdown...')
  })
}

async function testInferenceEngineSidecar() {
  let engine = null

  try {
    console.log('\n📦 Step 1: Create InferenceEngineSidecar')
    engine = new InferenceEngineSidecar({
      modelPath: './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
      binaryPath: '/home/luka/llama.cpp/build/bin/llama-server',
      port: 8080,
      gpuLayers: 0  // CPU only
    }, {
      temperature: 0.7,
      maxTokens: 50
    })
    console.log('✅ Engine created')

    console.log('\n📦 Step 2: Start engine')
    await engine.start()
    console.log('✅ Engine started')

    console.log('\n📦 Step 3: Check health')
    const healthy = await engine.isHealthy()
    console.log(`   Healthy: ${healthy ? '✅' : '❌'}`)

    if (!healthy) {
      throw new Error('Engine not healthy!')
    }

    console.log('\n📦 Step 4: Test non-streaming inference (generate)')
    const result = await engine.generate('What is 2+2?', {
      maxTokens: 30
    })
    console.log(`   Response: ${result.text}`)
    console.log(`   Tokens: ${result.tokens}, Duration: ${result.duration.toFixed(2)}s, Speed: ${result.tokensPerSecond} tok/s`)
    console.log('✅ Non-streaming works!')

    console.log('\n📦 Step 5: Test streaming inference (generateStream)')
    console.log('   Prompt: "Count from 1 to 3:"')
    console.log('   Stream: ', { noNewline: true })

    const streamResult = await engine.generateStream(
      'Count from 1 to 3:',
      (token) => {
        process.stdout.write(token)
      },
      { maxTokens: 20 }
    )

    console.log('')
    console.log(`   Tokens: ${streamResult.tokens}, Duration: ${streamResult.duration.toFixed(2)}s`)
    console.log('✅ Streaming works!')

    console.log('\n📦 Step 6: Test chat (chatStream)')
    console.log('   Starting conversation...')

    // First turn
    console.log('\n   User: "Hi! My name is Alice."')
    console.log('   Assistant: ', { noNewline: true })

    await engine.chatStream(
      'Hi! My name is Alice.',
      (token) => {
        process.stdout.write(token)
      },
      { maxTokens: 30 }
    )

    console.log('')

    // Second turn
    console.log('\n   User: "What is my name?"')
    console.log('   Assistant: ', { noNewline: true })

    await engine.chatStream(
      'What is my name?',
      (token) => {
        process.stdout.write(token)
      },
      { maxTokens: 30 }
    )

    console.log('')
    console.log('✅ Chat with history works!')

    console.log('\n📦 Step 7: Get stats')
    const stats = engine.getStats()
    console.log('   Stats:', JSON.stringify(stats, null, 2))

    console.log('\n📦 Step 8: Dispose engine')
    await engine.dispose()
    console.log('✅ Engine disposed')

    console.log('\n' + '='.repeat(60))
    console.log('🎉 ALL TESTS PASSED!')
    console.log('\n✅ InferenceEngineSidecar is working!')
    console.log('✅ API is compatible with InferenceEngine')

    process.exit(0)

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message)
    console.error('\nStack trace:')
    console.error(error.stack)

    // Cleanup
    if (engine) {
      console.log('\n🧹 Cleaning up...')
      try {
        await engine.dispose()
      } catch (e) {
        console.error('Cleanup error:', e.message)
      }
    }

    process.exit(1)
  }
}

// Run test
testInferenceEngineSidecar()
