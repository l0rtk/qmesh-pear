#!/usr/bin/env pear

/**
 * Debug version of sidecar test with verbose logging
 */

import 'bare-node-runtime/global'
import process from '#process'
import { LlamaProcessManager } from './src/lib/llama-process-manager.js'
import { LlamaHttpClient } from './src/lib/llama-http-client.js'

console.log('\n🧪 Testing Llama Sidecar Architecture (DEBUG MODE)\n')
console.log('='.repeat(60))

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
    // Configuration with VERBOSE enabled
    const config = {
      modelPath: './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
      binaryPath: '/home/luka/llama.cpp/build/bin/llama-server',
      port: 8080,
      gpuLayers: 0,  // CPU only since no GPU support in binary
      verbose: true   // ENABLE VERBOSE LOGGING
    }

    console.log('\n📦 Step 1: Initialize Components')
    processManager = new LlamaProcessManager(config)
    httpClient = new LlamaHttpClient({ port: config.port })
    console.log('✅ Components created')

    console.log('\n📦 Step 2: Start llama-server')
    await processManager.start()
    console.log('✅ Server started')

    console.log('\n📦 Step 3: Check if process is still running')
    console.log('   isRunning:', processManager.isRunning)
    console.log('   process object:', processManager.process ? 'exists' : 'null')

    console.log('\n📦 Step 4: Wait a bit before health check')
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('\n📦 Step 5: Check if process is STILL running')
    console.log('   isRunning:', processManager.isRunning)

    console.log('\n📦 Step 6: Health Check via HTTP')
    const healthy = await httpClient.healthCheck()
    console.log(`   Server healthy: ${healthy ? '✅' : '❌'}`)

    if (healthy) {
      console.log('\n📦 Step 7: Simple inference test')
      const result = await httpClient.generate('Say "Hello World"', {
        maxTokens: 10
      })
      console.log('   Response:', result.text)
    }

    console.log('\n📦 Step 8: Stop Server')
    await processManager.stop()
    console.log('✅ Server stopped gracefully')

    console.log('\n🎉 TEST COMPLETED!')
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
