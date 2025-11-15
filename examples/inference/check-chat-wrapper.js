#!/usr/bin/env node

/**
 * Check Chat Wrapper
 * Inspect which chat wrapper is being used for TinyLlama
 */

import { getLlama } from 'node-llama-cpp';
import { findModelFile } from '../../src/worker/model-loader.js';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('   Chat Wrapper Inspector');
  console.log('═══════════════════════════════════════\n');

  try {
    // Find and load model
    const modelPath = await findModelFile('tinyllama');
    console.log(`📦 Model path: ${modelPath}\n`);

    const llama = await getLlama();
    console.log('✅ Llama instance created\n');

    console.log('⏳ Loading model...');
    const model = await llama.loadModel({
      modelPath: modelPath,
      gpuLayers: 0, // CPU only for quick test
    });
    console.log('✅ Model loaded\n');

    // Check if model has metadata about chat template
    console.log('🔍 Inspecting model properties:');
    console.log('   Model type:', model.constructor.name);
    console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(model)).slice(0, 10));

    // Try to get chat wrapper info
    try {
      // Some models expose chatWrapper or template info
      if (model.chatWrapper) {
        console.log('\n📋 Chat Wrapper found:');
        console.log('   Type:', model.chatWrapper.constructor.name);
      }
    } catch (e) {
      console.log('\n⚠️  No direct chatWrapper property');
    }

    // Create context and session
    console.log('\n⏳ Creating context...');
    const context = await model.createContext({ contextSize: 512 });
    console.log('✅ Context created');

    console.log('\n⏳ Creating chat session...');
    const { LlamaChatSession } = await import('node-llama-cpp');

    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
    });
    console.log('✅ Session created\n');

    // Inspect session
    console.log('🔍 Session properties:');
    const sessionProps = Object.keys(session);
    console.log('   Properties:', sessionProps);

    const sessionMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(session));
    console.log('   Methods:', sessionMethods);

    // Check if getChatHistory exists
    if (sessionMethods.includes('getChatHistory')) {
      console.log('\n✅ getChatHistory() method is available');

      // Try getting empty history
      const history = session.getChatHistory();
      console.log('   Empty history structure:');
      console.log('   ', JSON.stringify(history, null, 2));
    } else {
      console.log('\n❌ getChatHistory() method NOT found');
    }

    // Try to access chat wrapper from session
    console.log('\n🔍 Looking for chat wrapper in session:');
    for (const prop of sessionProps) {
      const value = session[prop];
      if (value && typeof value === 'object' && value.constructor) {
        console.log(`   ${prop}:`, value.constructor.name);
      }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('✅ Inspection completed');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
