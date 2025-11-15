/**
 * Model Loader Module
 * Loads GGUF models with automatic GPU detection and configuration
 */

import { getLlama } from 'node-llama-cpp';
import { fileURLToPath } from 'url';
import { access, constants } from 'fs/promises';
import { join } from 'path';
import { detectGPU, GPUType } from '../lib/hardware-detector.js';
import config from '../config/default.js';

/**
 * Model loader class
 * Handles loading and management of GGUF models
 */
export class ModelLoader {
  constructor(options = {}) {
    this.modelPath = options.modelPath || null;
    this.gpuLayers = options.gpuLayers ?? config.model.gpu.layers;
    this.threads = options.threads ?? config.model.inference.threads;
    this.model = null;
    this.gpuInfo = null;
  }

  /**
   * Load a GGUF model from file
   * @param {string} modelPath - Path to GGUF model file
   * @returns {Promise<LlamaModel>} Loaded model instance
   */
  async loadModel(modelPath = this.modelPath) {
    if (!modelPath) {
      throw new Error('Model path is required');
    }

    // Verify model file exists
    await this.verifyModelFile(modelPath);

    console.log(`\n📦 Loading model: ${modelPath}`);

    // Auto-detect GPU if not manually configured
    if (this.gpuLayers === -1) {
      this.gpuInfo = await detectGPU();
      this.gpuLayers = this.gpuInfo.layers;

      const gpuStatus = this.gpuInfo.available
        ? `${this.gpuInfo.name} (${this.gpuLayers} GPU layers)`
        : 'CPU only';

      console.log(`🎮 GPU Detection: ${gpuStatus}`);
    } else if (this.gpuLayers > 0) {
      console.log(`🎮 GPU Layers: ${this.gpuLayers} (manually configured)`);
    } else {
      console.log(`🎮 GPU: Disabled (CPU only)`);
    }

    // Set thread count (auto-detect if not specified)
    if (this.threads === -1) {
      // Use number of physical cores, leave some for system
      const os = await import('os');
      const cores = os.cpus().length;
      this.threads = Math.max(1, cores - 2);
    }

    console.log(`🧵 CPU Threads: ${this.threads}`);

    // Load the model
    console.log(`⏳ Loading model (this may take a few seconds)...`);

    try {
      const startTime = Date.now();

      // Get llama instance (v3 API)
      const llama = await getLlama();

      // Load the model with options
      this.model = await llama.loadModel({
        modelPath: modelPath,
        gpuLayers: this.gpuLayers,
      });

      const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Model loaded successfully in ${loadTime}s`);

      this.modelPath = modelPath;
      return this.model;

    } catch (error) {
      console.error('❌ Failed to load model:', error.message);
      throw new Error(`Model loading failed: ${error.message}`);
    }
  }

  /**
   * Verify model file exists and is readable
   */
  async verifyModelFile(modelPath) {
    try {
      await access(modelPath, constants.R_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Model file not found: ${modelPath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Model file not readable: ${modelPath}`);
      }
      throw new Error(`Cannot access model file: ${error.message}`);
    }

    // Check file extension
    if (!modelPath.toLowerCase().endsWith('.gguf')) {
      console.warn('⚠️  Warning: File does not have .gguf extension');
    }
  }

  /**
   * Get model information
   */
  getModelInfo() {
    if (!this.model) {
      return null;
    }

    return {
      path: this.modelPath,
      gpuLayers: this.gpuLayers,
      threads: this.threads,
      gpuType: this.gpuInfo?.type || GPUType.CPU,
      gpuName: this.gpuInfo?.name || 'CPU',
    };
  }

  /**
   * Unload the model and free resources
   */
  async unloadModel() {
    if (this.model) {
      console.log('🗑️  Unloading model...');

      // node-llama-cpp handles cleanup automatically
      // Just clear the reference
      this.model = null;
      this.modelPath = null;

      console.log('✅ Model unloaded');
    }
  }

  /**
   * Check if model is loaded
   */
  isLoaded() {
    return this.model !== null;
  }
}

/**
 * Helper function to find a model file in the models directory
 * @param {string} modelName - Model filename or partial name
 * @returns {Promise<string>} Full path to model file
 */
export async function findModelFile(modelName) {
  const { readdir } = await import('fs/promises');

  // If it's already a full path, return it
  if (modelName.includes('/') || modelName.endsWith('.gguf')) {
    return modelName;
  }

  // Search in models directory
  const modelsDir = config.model.defaultPath;

  try {
    const files = await readdir(modelsDir);
    const ggufFiles = files.filter(f => f.toLowerCase().endsWith('.gguf'));

    // Exact match
    const exactMatch = ggufFiles.find(f => f === modelName || f === `${modelName}.gguf`);
    if (exactMatch) {
      return join(modelsDir, exactMatch);
    }

    // Partial match (case-insensitive)
    const partialMatch = ggufFiles.find(f =>
      f.toLowerCase().includes(modelName.toLowerCase())
    );
    if (partialMatch) {
      return join(modelsDir, partialMatch);
    }

    throw new Error(`No model file found matching: ${modelName}`);

  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Models directory not found: ${modelsDir}`);
    }
    throw error;
  }
}

/**
 * List available models in the models directory
 * @returns {Promise<Array>} List of available model files
 */
export async function listAvailableModels() {
  const { readdir, stat } = await import('fs/promises');
  const modelsDir = config.model.defaultPath;

  try {
    const files = await readdir(modelsDir);
    const ggufFiles = files.filter(f => f.toLowerCase().endsWith('.gguf'));

    // Get file sizes
    const models = await Promise.all(
      ggufFiles.map(async (file) => {
        const filePath = join(modelsDir, file);
        const stats = await stat(filePath);
        const sizeGB = (stats.size / (1024 ** 3)).toFixed(2);

        return {
          name: file,
          path: filePath,
          size: `${sizeGB}GB`,
          sizeBytes: stats.size,
        };
      })
    );

    return models.sort((a, b) => a.sizeBytes - b.sizeBytes);

  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // Models directory doesn't exist yet
    }
    throw error;
  }
}

/**
 * Print available models (for CLI)
 */
export async function printAvailableModels() {
  const models = await listAvailableModels();

  if (models.length === 0) {
    console.log('\n📂 No models found in models/ directory');
    console.log('\nTo download a model:');
    console.log('  1. Visit https://huggingface.co/models?library=gguf');
    console.log('  2. Download a GGUF file (Q4_K_M or Q4_0 recommended)');
    console.log('  3. Place it in the models/ directory\n');
    return;
  }

  console.log(`\n📂 Available Models (${models.length}):\n`);
  models.forEach((model, idx) => {
    console.log(`  ${idx + 1}. ${model.name} (${model.size})`);
  });
  console.log('');
}

export default ModelLoader;
