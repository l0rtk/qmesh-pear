#!/usr/bin/env node

/**
 * Debug Chat History
 * Test script to verify LlamaChatSession maintains conversation history
 */

import { ModelLoader, findModelFile } from '../../src/worker/model-loader.js';
import { InferenceEngine } from '../../src/worker/inference-engine.js';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('   Chat History Debug Test');
  console.log('═══════════════════════════════════════\n');

  try {
    // Load model
    const modelPath = await findModelFile('tinyllama');
    console.log(`📦 Loading model: ${modelPath}\n`);

    const loader = new ModelLoader({ gpuLayers: -1 });
    const model = await loader.loadModel(modelPath);

    // Create engine with system prompt
    const systemPrompt = "You are a helpful AI assistant. Remember facts that users tell you.";
    const engine = new InferenceEngine(model, {
      temperature: 0.7,
      maxTokens: 150,
      systemPrompt: systemPrompt,
    });

    console.log('✅ Engine initialized with system prompt\n');
    console.log('═══════════════════════════════════════\n');

    // Test 1: First message
    console.log('TEST 1: User says their name');
    console.log('───────────────────────────────────────');
    console.log('User: "My name is Luka"\n');
    console.log('AI: ');

    await engine.chatStream(
      "My name is Luka",
      (chunk) => process.stdout.write(chunk),
      { maxTokens: 150 }
    );

    console.log('\n\n═══════════════════════════════════════\n');

    // Get chat session to inspect history
    const chatSession = await engine.getChatSession();
    console.log('📊 Inspecting chat session state:');
    console.log('   Session ID:', chatSession.id);
    console.log('   Request count:', chatSession.requestCount);
    console.log('   Session object type:', chatSession.session.constructor.name);

    // Try to get chat history
    try {
      const history = chatSession.session.getChatHistory();
      console.log('\n📜 Chat History:');
      console.log(JSON.stringify(history, null, 2));
    } catch (error) {
      console.log('\n⚠️  getChatHistory() not available:', error.message);
    }

    console.log('\n═══════════════════════════════════════\n');

    // Test 2: Second message (should remember name)
    console.log('TEST 2: Ask about the name');
    console.log('───────────────────────────────────────');
    console.log('User: "What is my name?"\n');
    console.log('AI: ');

    await engine.chatStream(
      "What is my name?",
      (chunk) => process.stdout.write(chunk),
      { maxTokens: 150 }
    );

    console.log('\n\n═══════════════════════════════════════\n');

    // Get chat history again
    try {
      const history = chatSession.session.getChatHistory();
      console.log('📜 Chat History after second message:');
      console.log(JSON.stringify(history, null, 2));
    } catch (error) {
      console.log('⚠️  getChatHistory() not available:', error.message);
    }

    console.log('\n═══════════════════════════════════════\n');

    // Test 3: Third message to verify continuity
    console.log('TEST 3: Follow-up question');
    console.log('───────────────────────────────────────');
    console.log('User: "How old am I?"\n');
    console.log('AI: ');

    await engine.chatStream(
      "I am 30 years old. Can you repeat my name and age?",
      (chunk) => process.stdout.write(chunk),
      { maxTokens: 150 }
    );

    console.log('\n\n═══════════════════════════════════════\n');

    // Final history check
    try {
      const history = chatSession.session.getChatHistory();
      console.log('📜 Final Chat History:');
      console.log(JSON.stringify(history, null, 2));
    } catch (error) {
      console.log('⚠️  getChatHistory() not available:', error.message);
    }

    // Check session properties
    console.log('\n🔍 Session Internals:');
    console.log('   Available properties:', Object.keys(chatSession.session));
    console.log('   Session prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(chatSession.session)));

    console.log('\n═══════════════════════════════════════');
    console.log('✅ Test completed');
    console.log('═══════════════════════════════════════\n');

    // Cleanup
    await engine.dispose();
    await loader.unloadModel();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
