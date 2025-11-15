#!/usr/bin/env pear

/**
 * Simple Inference Test (Pear Sidecar Version)
 * Quick test of sidecar inference
 */

import 'bare-node-runtime/global'
import process from '#process'
import { InferenceEngineSidecar } from '../../src/worker/inference-engine-sidecar.js'

async function main() {
  console.log('\n🧪 Simple Inference Test (Sidecar)\n')

  const engine = new InferenceEngineSidecar({
    modelPath: './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    binaryPath: '/home/luka/llama.cpp/build/bin/llama-server',
    port: 8080,
    gpuLayers: 0
  })

  try {
    await engine.start()

    console.log('Testing non-streaming...')
    const result = await engine.generate('What is 2+2?', { maxTokens: 30 })
    console.log('Response:', result.text)
    console.log(`${result.tokens} tokens in ${result.duration.toFixed(2)}s\n`)

    console.log('Testing streaming...')
    process.stdout.write('Response: ')
    await engine.generateStream('Count to 3:', (token) => {
      process.stdout.write(token)
    }, { maxTokens: 20 })
    console.log('\n\n✅ Test complete!')

    await engine.dispose()
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error.message)
    await engine.dispose()
    process.exit(1)
  }
}

main()
