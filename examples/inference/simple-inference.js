/**
 * Simple Inference Example
 * Demonstrates basic LLM inference with automatic GPU detection
 *
 * Usage:
 *   node examples/simple-inference.js [model-name-or-path]
 *
 * Examples:
 *   node examples/simple-inference.js                          # Use first available model
 *   node examples/simple-inference.js tinyllama                # Use TinyLlama model
 *   node examples/simple-inference.js ./models/my-model.gguf   # Use specific path
 */

import { detectHardware, printHardwareInfo } from '../../src/lib/hardware-detector.js';
import { ModelLoader, listAvailableModels, findModelFile } from '../../src/worker/model-loader.js';
import { InferenceEngine } from '../../src/worker/inference-engine.js';
import { select } from '@inquirer/prompts';

/**
 * Main function
 */
async function main() {
  console.log('🚀 QMesh Simple Inference Test\n');
  console.log('='.repeat(50));

  try {
    // Step 1: Detect hardware
    console.log('\n📊 Step 1: Detecting Hardware...\n');
    const hardware = await detectHardware();
    printHardwareInfo(hardware);

    // Check minimum requirements
    if (!hardware.requirements.passed) {
      console.error('❌ Hardware does not meet minimum requirements');
      process.exit(1);
    }

    console.log('='.repeat(50));

    // Step 2: Select model
    console.log('\n📦 Step 2: Selecting Model...\n');

    let modelPath;
    const cmdLineModel = process.argv[2];

    if (cmdLineModel) {
      // Model specified via command line
      try {
        modelPath = await findModelFile(cmdLineModel);
        console.log(`✅ Found model: ${modelPath}`);
      } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
      }
    } else {
      // Interactive model selection
      const models = await listAvailableModels();

      if (models.length === 0) {
        console.error('❌ No models found in models/ directory');
        console.log('\nTo download a model:');
        console.log('  1. Create the models/ directory: mkdir models');
        console.log('  2. Visit https://huggingface.co/models?library=gguf');
        console.log('  3. Download a GGUF file (Q4_K_M or Q4_0 recommended)');
        console.log('  4. Place it in the models/ directory\n');
        console.log('Example download (TinyLlama 1B):');
        console.log('  cd models');
        console.log('  wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
        process.exit(1);
      }

      // Prompt user to select a model
      const choices = models.map(m => ({
        name: `${m.name} (${m.size})`,
        value: m.path,
        description: m.path,
      }));

      modelPath = await select({
        message: 'Select a model to load:',
        choices,
      });
    }

    console.log('='.repeat(50));

    // Step 3: Load model
    console.log('\n🔧 Step 3: Loading Model...\n');

    const loader = new ModelLoader({
      // GPU layers will be auto-detected based on hardware
      gpuLayers: -1, // -1 = auto-detect
    });

    const model = await loader.loadModel(modelPath);

    const modelInfo = loader.getModelInfo();
    console.log(`\nModel Info:`);
    console.log(`  Path: ${modelInfo.path}`);
    console.log(`  GPU: ${modelInfo.gpuName}`);
    console.log(`  GPU Layers: ${modelInfo.gpuLayers}`);
    console.log(`  CPU Threads: ${modelInfo.threads}`);

    console.log('='.repeat(50));

    // Step 4: Create inference engine
    console.log('\n⚙️  Step 4: Initializing Inference Engine...\n');

    const engine = new InferenceEngine(model, {
      maxContexts: 1,
      temperature: 0.7,
      maxTokens: 100,
    });

    console.log('✅ Inference engine ready');

    console.log('='.repeat(50));

    // Step 5: Run inference
    console.log('\n💬 Step 5: Running Inference...\n');

    const testPrompts = [
      'What is the capital of France?',
      'Explain quantum computing in one sentence.',
      'Write a haiku about programming.',
    ];

    // Select a random prompt
    const prompt = testPrompts[Math.floor(Math.random() * testPrompts.length)];

    console.log(`Prompt: "${prompt}"\n`);
    console.log('Generating response...\n');

    const result = await engine.generate(prompt, {
      maxTokens: 150,
      temperature: 0.7,
    });

    console.log('Response:');
    console.log('-'.repeat(50));
    console.log(result.text);
    console.log('-'.repeat(50));

    console.log(`\nGeneration Stats:`);
    console.log(`  Tokens: ${result.tokens}`);
    console.log(`  Duration: ${result.duration.toFixed(2)}s`);
    console.log(`  Speed: ${result.tokensPerSecond} tokens/sec`);
    console.log(`  Context ID: ${result.contextId}`);

    console.log('='.repeat(50));

    // Step 6: Test streaming inference
    console.log('\n🌊 Step 6: Testing Streaming Inference...\n');

    const streamPrompt = 'Count from 1 to 5.';
    console.log(`Prompt: "${streamPrompt}"\n`);
    console.log('Streaming response:');
    console.log('-'.repeat(50));

    process.stdout.write('> ');

    const streamResult = await engine.generateStream(
      streamPrompt,
      (token, count) => {
        // Print each token as it's generated
        process.stdout.write(token);
      },
      {
        maxTokens: 50,
        temperature: 0.5,
      }
    );

    console.log('\n' + '-'.repeat(50));
    console.log(`\nStreaming Stats:`);
    console.log(`  Tokens: ${streamResult.tokens}`);
    console.log(`  Duration: ${streamResult.duration.toFixed(2)}s`);
    console.log(`  Speed: ${streamResult.tokensPerSecond} tokens/sec`);

    console.log('='.repeat(50));

    // Cleanup
    console.log('\n🧹 Cleaning up...\n');

    await engine.dispose();
    await loader.unloadModel();

    console.log('='.repeat(50));
    console.log('\n✅ Test completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the example
main();
