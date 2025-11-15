/**
 * Setup Wizard Module
 * Interactive first-time setup for QMesh workers
 */

import { detectHardware, printHardwareInfo } from '../lib/hardware-detector.js';
import { ModelDownloader } from './model-downloader.js';
import { listAvailableModels } from './model-loader.js';
import { select, confirm } from '@inquirer/prompts';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import config from '../config/default.js';

/**
 * Run the complete setup wizard
 * @returns {Promise<Object>} Setup configuration
 */
export async function runSetupWizard() {
  console.log('🚀 QMesh Worker Setup Wizard\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Hardware detection
    console.log('\n📊 Step 1: Detecting Hardware...\n');

    const hardware = await detectHardware();
    printHardwareInfo(hardware);

    // Check minimum requirements
    if (!hardware.requirements.passed) {
      console.error('\n❌ Hardware does not meet minimum requirements:');
      hardware.requirements.errors.forEach(err => {
        console.error(`   • ${err}`);
      });
      console.error('\nSetup cannot continue. Please upgrade your hardware.\n');
      process.exit(1);
    }

    console.log('='.repeat(60));

    // Step 2: Check for existing models
    console.log('\n📦 Step 2: Model Selection...\n');

    const existingModels = await listAvailableModels();

    let modelPath;

    if (existingModels.length > 0) {
      console.log(`Found ${existingModels.length} existing model(s):\n`);
      existingModels.forEach((model, idx) => {
        console.log(`  ${idx + 1}. ${model.name} (${model.size})`);
      });
      console.log('');

      const useExisting = await confirm({
        message: 'Use an existing model?',
        default: true,
      });

      if (useExisting) {
        // Select from existing models
        const choices = existingModels.map(model => ({
          name: `${model.name} (${model.size})`,
          value: model.path,
          description: model.path,
        }));

        modelPath = await select({
          message: 'Select a model:',
          choices,
        });

        console.log(`\n✅ Selected: ${modelPath}`);
      } else {
        // Download new model
        modelPath = await downloadNewModel(hardware);
      }
    } else {
      console.log('No existing models found. Let\'s download one!\n');
      modelPath = await downloadNewModel(hardware);
    }

    console.log('='.repeat(60));

    // Step 3: Generate worker ID
    console.log('\n🆔 Step 3: Worker Identification...\n');

    const workerId = await ensureWorkerId();
    console.log(`Worker ID: ${workerId.slice(0, 16)}...${workerId.slice(-8)}`);

    console.log('='.repeat(60));

    // Step 4: Save configuration
    console.log('\n💾 Step 4: Saving Configuration...\n');

    const setupConfig = {
      modelPath,
      workerId,
      hardware: hardware.summary,
      setupDate: new Date().toISOString(),
    };

    await saveSetupConfig(setupConfig);

    console.log('✅ Configuration saved');

    console.log('='.repeat(60));

    // Step 5: Setup complete
    console.log('\n✅ Setup Complete!\n');
    console.log('Your worker is ready to start. Run:');
    console.log('  npm run worker\n');

    return setupConfig;

  } catch (error) {
    if (error.message === 'Download cancelled by user' || error.message.includes('cancelled')) {
      console.log('\n⚠️  Setup cancelled by user\n');
      process.exit(0);
    }

    console.error('\n❌ Setup failed:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Download a new model using the downloader
 */
async function downloadNewModel(hardware) {
  const downloader = new ModelDownloader();

  try {
    const modelPath = await downloader.interactiveDownload(hardware);
    return modelPath;
  } catch (error) {
    throw new Error(`Model download failed: ${error.message}`);
  }
}

/**
 * Ensure worker has a unique ID
 * @returns {Promise<string>} Worker ID
 */
async function ensureWorkerId() {
  const workerIdPath = config.worker.idFile;

  // Check if worker ID already exists
  if (existsSync(workerIdPath)) {
    try {
      const existingId = await readFile(workerIdPath, 'utf-8');
      const trimmedId = existingId.trim();

      // Validate ID format (64 hex characters)
      if (trimmedId.length === 64 && /^[0-9a-f]+$/i.test(trimmedId)) {
        console.log('Using existing worker ID');
        return trimmedId;
      }
    } catch (error) {
      // Invalid ID file, generate new one
      console.log('Invalid worker ID file, generating new ID...');
    }
  }

  // Generate new worker ID
  console.log('Generating new worker ID...');
  const workerId = randomBytes(32).toString('hex'); // 64 hex characters

  // Save to file
  await writeFile(workerIdPath, workerId, 'utf-8');

  return workerId;
}

/**
 * Save setup configuration
 */
async function saveSetupConfig(setupConfig) {
  const configPath = config.worker.idFile.replace('worker-id.txt', 'worker-config.json');

  await writeFile(configPath, JSON.stringify(setupConfig, null, 2), 'utf-8');
}

/**
 * Load setup configuration
 */
export async function loadSetupConfig() {
  const configPath = config.worker.idFile.replace('worker-id.txt', 'worker-config.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('⚠️  Failed to load setup configuration:', error.message);
    return null;
  }
}

/**
 * Check if initial setup is needed
 * @returns {Promise<boolean>} True if setup is needed
 */
export async function isSetupNeeded() {
  // Check if models exist
  const models = await listAvailableModels();

  if (models.length === 0) {
    return true;
  }

  // Check if worker ID exists
  const workerIdPath = config.worker.idFile;
  if (!existsSync(workerIdPath)) {
    return true;
  }

  return false;
}

/**
 * Quick setup check - runs setup wizard if needed
 */
export async function checkSetup() {
  const needsSetup = await isSetupNeeded();

  if (needsSetup) {
    console.log('\n⚠️  Initial setup required\n');
    await runSetupWizard();
  }
}

export default {
  runSetupWizard,
  loadSetupConfig,
  isSetupNeeded,
  checkSetup,
};
