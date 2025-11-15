#!/usr/bin/env pear

/**
 * Sidecar Architecture Test
 *
 * Tests the llama-server sidecar approach:
 * 1. Start llama-server subprocess
 * 2. Make inference request via HTTP
 * 3. Test streaming
 * 4. Graceful shutdown
 */

import 'bare-node-runtime/global'
import process from '#process'
import { LlamaProcessManager } from './src/lib/llama-process-manager.js'
import { LlamaHttpClient } from './src/lib/llama-http-client.js'

console.log('\n🧪 Testing Llama Sidecar Architecture\n')
console.log('=' .repeat(60))

// Pear teardown
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n👋 Test shutdown...')
  })
}

async function testSidecar() {
  let processManager
  let httpClient

  try {
    // Configuration
    const config = {
      modelPath: './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
      binaryPath: '/home/luka/llama.cpp/build/bin/llama-server',  // Adjust after build
      port: 8080,
      gpuLayers: 33,
      verbose: false
    }

    console.log('\n📦 Step 1: Initialize Components')
    processManager = new LlamaProcessManager(config)
    httpClient = new LlamaHttpClient({ port: config.port })
    console.log('✅ Components created')

    console.log('\n📦 Step 2: Start llama-server')
    console.log('   This will:')
    console.log('   - Spawn llama-server subprocess')
    console.log('   - Load model into VRAM')
    console.log('   - Start HTTP server on port 8080')
    await processManager.start()
    console.log('✅ Server started')

    console.log('\n📦 Step 3: Health Check')
    const healthy = await httpClient.healthCheck()
    console.log(`   Server healthy: ${healthy ? '✅' : '❌'}`)

    if (!healthy) {
      throw new Error('Server not healthy!')
    }

    console.log('\n📦 Step 4: Get Model Properties')
    try {
      const props = await httpClient.getProps()
      console.log('   Model info:', props)
    } catch (error) {
      console.log('   (Props endpoint may not be available)')
    }

    console.log('\n📦 Step 5: Test Non-Streaming Inference')
    const prompt = 'What is the capital of France?'
    console.log(`   Prompt: "${prompt}"`)

    const result = await httpClient.generate(prompt, {
      maxTokens: 50,
      temperature: 0.7
    })

    console.log(`\n   Response: ${result.text}`)
    console.log(`   Tokens: ${result.tokens}`)
    console.log('✅ Non-streaming inference works!')

    console.log('\n📦 Step 6: Test Streaming Inference')
    const streamPrompt = 'Count from 1 to 5:'
    console.log(`   Prompt: "${streamPrompt}"`)
    console.log('   Stream: ', { noNewline: true })

    await httpClient.generateStream(
      streamPrompt,
      (token) => {
        process.stdout.write(token)
      },
      { maxTokens: 30 }
    )

    console.log('\n✅ Streaming inference works!')

    console.log('\n📦 Step 7: Test Chat Completion')
    const messages = [
      { role: 'user', content: 'Hello! How are you?' }
    ]

    const chatResult = await httpClient.chat(messages, {
      maxTokens: 50
    })

    console.log(`\n   Response: ${chatResult.text}`)
    console.log('✅ Chat completion works!')

    console.log('\n📦 Step 8: Server Info')
    const info = processManager.getInfo()
    console.log('   Uptime:', Math.floor(info.uptime / 1000), 'seconds')
    console.log('   Endpoint:', info.endpoint)
    console.log('   Restarts:', info.restartCount)

    console.log('\n📦 Step 9: Stop Server')
    await processManager.stop()
    console.log('✅ Server stopped gracefully')

    console.log('\n' + '='.repeat(60))
    console.log('🎉 ALL TESTS PASSED!')
    console.log('\n✅ Sidecar architecture is working!')
    console.log('\n📋 Next steps:')
    console.log('   1. Integrate with P2P networking')
    console.log('   2. Create worker node that uses sidecar')
    console.log('   3. Test multi-worker coordination')
    console.log('   4. Deploy via Pear!')

    process.exit(0)

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message)
    console.error('\nStack trace:')
    console.error(error.stack)

    // Cleanup
    if (processManager && processManager.isRunning) {
      console.log('\n🧹 Cleaning up...')
      try {
        await processManager.stop()
      } catch (e) {
        console.error('Cleanup error:', e.message)
      }
    }

    process.exit(1)
  }
}

// Run test
testSidecar()
