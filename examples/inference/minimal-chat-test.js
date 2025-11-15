#!/usr/bin/env node

/**
 * Minimal Chat Test
 * Simplest possible test of LlamaChatSession conversation memory
 * Based on official node-llama-cpp examples
 */

import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { findModelFile } from '../../src/worker/model-loader.js';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('   Minimal Chat Memory Test');
  console.log('═══════════════════════════════════════\n');

  try {
    // Load model
    const modelPath = await findModelFile('tinyllama');
    console.log(`📦 Model: ${modelPath}\n`);

    const llama = await getLlama();
    const model = await llama.loadModel({
      modelPath: modelPath,
      gpuLayers: 0, // CPU only for this test
    });

    const context = await model.createContext({
      contextSize: 2048,
    });

    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: "You are a helpful assistant. Remember what users tell you.",
    });

    console.log('✅ Session created\n');
    console.log('═══════════════════════════════════════\n');

    // Turn 1: User introduces themselves
    console.log('Turn 1: Introduction');
    console.log('───────────────────────────────────────');
    const prompt1 = "My name is Luka and I am 30 years old.";
    console.log(`User: ${prompt1}\n`);

    const response1 = await session.prompt(prompt1, {
      temperature: 0.7,
      maxTokens: 100,
    });
    console.log(`AI: ${response1}\n`);

    // Get and display chat history
    const history1 = session.getChatHistory();
    console.log('📜 Chat History (after turn 1):');
    console.log(JSON.stringify(history1, null, 2));
    console.log('\n═══════════════════════════════════════\n');

    // Turn 2: Ask about name
    console.log('Turn 2: Memory test - Ask about name');
    console.log('───────────────────────────────────────');
    const prompt2 = "What is my name?";
    console.log(`User: ${prompt2}\n`);

    const response2 = await session.prompt(prompt2, {
      temperature: 0.7,
      maxTokens: 100,
    });
    console.log(`AI: ${response2}\n`);

    // Get and display chat history
    const history2 = session.getChatHistory();
    console.log('📜 Chat History (after turn 2):');
    console.log(JSON.stringify(history2, null, 2));
    console.log('\n═══════════════════════════════════════\n');

    // Turn 3: Ask about age
    console.log('Turn 3: Memory test - Ask about age');
    console.log('───────────────────────────────────────');
    const prompt3 = "How old am I?";
    console.log(`User: ${prompt3}\n`);

    const response3 = await session.prompt(prompt3, {
      temperature: 0.7,
      maxTokens: 100,
    });
    console.log(`AI: ${response3}\n`);

    // Final history
    const history3 = session.getChatHistory();
    console.log('📜 Final Chat History:');
    console.log(JSON.stringify(history3, null, 2));

    console.log('\n═══════════════════════════════════════');
    console.log('🎯 Analysis:');
    console.log('───────────────────────────────────────');

    // Check if responses indicate memory
    const rememberedName = response2.toLowerCase().includes('luka');
    const rememberedAge = response3.toLowerCase().includes('30');

    console.log(`Name remembered: ${rememberedName ? '✅ YES' : '❌ NO'}`);
    console.log(`Age remembered: ${rememberedAge ? '✅ YES' : '❌ NO'}`);

    if (history3.length > 0) {
      console.log(`History entries: ${history3.length}`);
      console.log('History structure looks valid: ✅');
    } else {
      console.log('⚠️  WARNING: Chat history is empty!');
    }

    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
