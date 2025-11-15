#!/usr/bin/env node

/**
 * Interactive Chat with LLM
 * Chat with your local model in real-time
 *
 * Usage:
 *   npm run chat
 *   node examples/interactive-chat.js [model-name]
 */

import readline from 'readline';
import { detectHardware } from '../../src/lib/hardware-detector.js';
import { ModelLoader, listAvailableModels, findModelFile } from '../../src/worker/model-loader.js';
import { InferenceEngine } from '../../src/worker/inference-engine.js';
import { select } from '@inquirer/prompts';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

let engine = null;
let loader = null;

async function main() {
  console.log(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║   QMesh Interactive Chat              ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════╝${colors.reset}\n`);

  try {
    // Step 1: Select model
    console.log(`${colors.dim}Detecting hardware...${colors.reset}`);
    const hardware = await detectHardware();

    console.log(`${colors.green}✓${colors.reset} GPU: ${hardware.gpu.name}`);
    console.log(`${colors.green}✓${colors.reset} RAM: ${hardware.memory.total.toFixed(1)}GB\n`);

    let modelPath;
    const cmdLineModel = process.argv[2];

    if (cmdLineModel) {
      try {
        modelPath = await findModelFile(cmdLineModel);
      } catch (error) {
        console.error(`${colors.red}✗${colors.reset} ${error.message}`);
        process.exit(1);
      }
    } else {
      const models = await listAvailableModels();

      if (models.length === 0) {
        console.error(`${colors.red}✗${colors.reset} No models found. Run: npm run download`);
        process.exit(1);
      }

      const choices = models.map(m => ({
        name: `${m.name} (${m.size})`,
        value: m.path,
      }));

      modelPath = await select({
        message: 'Select a model:',
        choices,
      });
    }

    // Step 2: Load model
    console.log(`\n${colors.dim}Loading model...${colors.reset}`);

    loader = new ModelLoader({ gpuLayers: -1 });
    const model = await loader.loadModel(modelPath);

    const modelInfo = loader.getModelInfo();
    console.log(`${colors.green}✓${colors.reset} Model loaded (${modelInfo.gpuLayers} GPU layers)\n`);

    // Step 3: Initialize engine with system prompt
    const systemPrompt = "You are a helpful AI assistant. Respond directly to user questions and maintain a natural conversation. Be concise and relevant.";

    engine = new InferenceEngine(model, {
      temperature: 0.7,
      maxTokens: 200,
      systemPrompt: systemPrompt,
    });

    // Step 4: Start chat loop
    console.log(`${colors.bright}${colors.yellow}Chat started!${colors.reset} Type your message or 'exit' to quit.\n`);
    console.log(`${colors.dim}Tips: Ask questions, request explanations, or have a conversation!${colors.reset}`);
    console.log(`${colors.dim}═══════════════════════════════════════${colors.reset}\n`);

    await chatLoop();

  } catch (error) {
    console.error(`\n${colors.red}✗ Error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

async function chatLoop() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.bright}${colors.blue}You:${colors.reset} `,
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const userInput = input.trim();

    // Check for exit commands
    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      console.log(`\n${colors.dim}Goodbye!${colors.reset}\n`);
      await cleanup();
      process.exit(0);
    }

    // Skip empty input
    if (!userInput) {
      rl.prompt();
      return;
    }

    // Show AI response header
    process.stdout.write(`${colors.bright}${colors.magenta}AI:${colors.reset}  `);

    const startTime = Date.now();
    let tokenCount = 0;

    try {
      // Stream the response using chatStream
      // Session automatically maintains conversation history
      await engine.chatStream(
        userInput,  // Pass only user input, not full conversation
        (chunk, count) => {
          process.stdout.write(chunk);
          tokenCount = count;
        },
        {
          maxTokens: 200,
          temperature: 0.7,
        }
      );

      const duration = (Date.now() - startTime) / 1000;
      const tokensPerSec = Math.round(tokenCount / duration);

      // Show stats
      console.log(`\n${colors.dim}   (${tokenCount} tokens, ${tokensPerSec} tok/s)${colors.reset}\n`);

    } catch (error) {
      console.error(`\n${colors.red}✗ Generation failed:${colors.reset}`, error.message);
    }

    console.log(`${colors.dim}───────────────────────────────────────${colors.reset}\n`);
    rl.prompt();
  });

  rl.on('close', async () => {
    console.log(`\n${colors.dim}Goodbye!${colors.reset}\n`);
    await cleanup();
    process.exit(0);
  });
}

async function cleanup() {
  if (engine) {
    await engine.dispose();
  }
  if (loader) {
    await loader.unloadModel();
  }
}

// Handle Ctrl+C
process.on('SIGINT', async () => {
  console.log(`\n\n${colors.dim}Interrupted. Cleaning up...${colors.reset}`);
  await cleanup();
  process.exit(0);
});

main();
