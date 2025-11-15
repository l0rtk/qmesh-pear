#!/usr/bin/env node

/**
 * Run Worker Example
 * Starts a QMesh worker node with automatic setup
 *
 * Usage:
 *   npm run worker
 *   node examples/run-worker.js [model-name-or-path]
 */

import { checkSetup, loadSetupConfig } from '../../src/worker/setup-wizard.js';
import { ModelLoader, findModelFile, listAvailableModels } from '../../src/worker/model-loader.js';
import { InferenceEngine } from '../../src/worker/inference-engine.js';
import { select } from '@inquirer/prompts';

async function main() {
  console.log('🌐 QMesh Worker Node\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Check if setup is needed (models exist, worker ID exists)
    console.log('\n🔍 Checking setup...\n');
    await checkSetup();

    console.log('✅ Setup verified');
    console.log('='.repeat(60));

    // Step 2: Load configuration
    console.log('\n📋 Loading configuration...\n');

    const setupConfig = await loadSetupConfig();

    if (setupConfig) {
      console.log('Worker Configuration:');
      console.log(`  Worker ID: ${setupConfig.workerId.slice(0, 16)}...`);
      console.log(`  GPU: ${setupConfig.hardware.gpuType}`);
      console.log(`  RAM: ${setupConfig.hardware.totalRAM}GB`);
      console.log(`  Model: ${setupConfig.modelPath}`);
    }

    console.log('='.repeat(60));

    // Step 3: Select and load model
    console.log('\n📦 Loading model...\n');

    let modelPath;
    const cmdLineModel = process.argv[2];

    if (cmdLineModel) {
      // Model specified via command line
      try {
        modelPath = await findModelFile(cmdLineModel);
        console.log(`Using specified model: ${modelPath}`);
      } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
      }
    } else if (setupConfig && setupConfig.modelPath) {
      // Use model from setup config
      modelPath = setupConfig.modelPath;
      console.log(`Using configured model: ${modelPath}`);
    } else {
      // Interactive selection
      const models = await listAvailableModels();

      if (models.length === 0) {
        console.error('❌ No models available. Run setup wizard first.');
        process.exit(1);
      }

      const choices = models.map(m => ({
        name: `${m.name} (${m.size})`,
        value: m.path,
      }));

      modelPath = await select({
        message: 'Select a model to load:',
        choices,
      });
    }

    // Load the model
    const loader = new ModelLoader({ gpuLayers: -1 });
    const model = await loader.loadModel(modelPath);

    const modelInfo = loader.getModelInfo();
    console.log('\nModel Info:');
    console.log(`  Path: ${modelInfo.path}`);
    console.log(`  GPU: ${modelInfo.gpuName}`);
    console.log(`  GPU Layers: ${modelInfo.gpuLayers}`);
    console.log(`  CPU Threads: ${modelInfo.threads}`);

    console.log('='.repeat(60));

    // Step 4: Initialize inference engine
    console.log('\n⚙️  Initializing inference engine...\n');

    const engine = new InferenceEngine(model, {
      maxContexts: 3,
      temperature: 0.7,
    });

    console.log('✅ Inference engine ready');

    console.log('='.repeat(60));

    // Step 5: Worker is ready (P2P networking not implemented yet)
    console.log('\n🟢 Worker Ready!\n');

    console.log('⚠️  NOTE: P2P networking not yet implemented (Phase 2)');
    console.log('         This worker can perform local inference only.\n');

    // Quick test to verify everything works
    console.log('Running quick test...\n');

    const testPrompt = 'Say hello!';
    console.log(`Prompt: "${testPrompt}"`);
    console.log('Generating...\n');

    const result = await engine.generate(testPrompt, {
      maxTokens: 50,
      temperature: 0.7,
    });

    console.log('Response:');
    console.log('-'.repeat(60));
    console.log(result.text);
    console.log('-'.repeat(60));
    console.log(`\nStats: ${result.tokens} tokens in ${result.duration.toFixed(2)}s (${result.tokensPerSecond} tokens/sec)\n`);

    console.log('='.repeat(60));
    console.log('\n✅ Worker test completed successfully!\n');

    console.log('Next steps:');
    console.log('  - Phase 2: Implement P2P networking (Hyperswarm)');
    console.log('  - Phase 2: Implement system monitoring and health scores');
    console.log('  - Phase 2: Implement worker discovery and request handling\n');

    // Cleanup
    await engine.dispose();
    await loader.unloadModel();

  } catch (error) {
    console.error('\n❌ Worker failed:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Shutting down worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Shutting down worker...');
  process.exit(0);
});

main();
