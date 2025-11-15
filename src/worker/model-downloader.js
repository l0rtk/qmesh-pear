/**
 * Model Downloader Module
 * Downloads GGUF models from Hugging Face with progress tracking
 */

import https from 'https';
import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { select, confirm } from '@inquirer/prompts';
import config from '../config/default.js';

/**
 * Model catalog with download URLs and metadata
 */
export const MODEL_CATALOG = {
  'qwen-0.5b-q4': {
    id: 'qwen-0.5b-q4',
    name: 'Qwen 2.5 0.5B Q4_K_M',
    size: 352 * 1024 * 1024, // 352MB in bytes
    sizeFormatted: '352MB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    tier: ['minimal', 'low-end', 'mid-range', 'high-end'],
    description: 'Smallest model - works on very limited hardware',
    license: 'Apache 2.0',
  },
  'tinyllama-1b-q4': {
    id: 'tinyllama-1b-q4',
    name: 'TinyLlama 1.1B Q4_K_M',
    size: 681 * 1024 * 1024, // 681MB
    sizeFormatted: '681MB',
    url: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    filename: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    tier: ['low-end', 'mid-range', 'high-end'],
    description: 'Fast for testing - good CPU performance',
    license: 'Apache 2.0',
    recommended: true, // Default for testing
  },
  'llama-3.2-3b-q4': {
    id: 'llama-3.2-3b-q4',
    name: 'Llama 3.2 3B Q4_K_M',
    size: 2.0 * 1024 * 1024 * 1024, // 2.0GB
    sizeFormatted: '2.0GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    tier: ['mid-range', 'high-end'],
    description: 'Best balance of quality and speed',
    license: 'Llama 3.2 Community License',
  },
  'mistral-7b-q4': {
    id: 'mistral-7b-q4',
    name: 'Mistral 7B Instruct Q4_K_M',
    size: 4.4 * 1024 * 1024 * 1024, // 4.4GB
    sizeFormatted: '4.4GB',
    url: 'https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/mistral-7b-instruct-v0.3.Q4_K_M.gguf',
    filename: 'mistral-7b-instruct-v0.3.Q4_K_M.gguf',
    tier: ['high-end'],
    description: 'High quality - requires good GPU',
    license: 'Apache 2.0',
  },
};

/**
 * Model Downloader class
 */
export class ModelDownloader {
  constructor(options = {}) {
    this.modelsDir = options.modelsDir || config.model.defaultPath;
  }

  /**
   * Download a model with progress tracking
   * @param {string} modelId - Model ID from catalog
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<string>} Path to downloaded model
   */
  async downloadModel(modelId, onProgress = null) {
    const model = MODEL_CATALOG[modelId];

    if (!model) {
      throw new Error(`Unknown model ID: ${modelId}`);
    }

    // Ensure models directory exists
    await mkdir(this.modelsDir, { recursive: true });

    const destination = join(this.modelsDir, model.filename);

    // Check if file already exists
    if (existsSync(destination)) {
      const stats = statSync(destination);

      // If file exists and size matches, skip download
      if (stats.size === model.size) {
        console.log(`✅ Model already exists: ${destination}`);
        return destination;
      }

      // File exists but size doesn't match - delete and re-download
      console.log('⚠️  Existing file size mismatch. Re-downloading...');
      unlinkSync(destination);
    }

    console.log(`\n📥 Downloading ${model.name}...`);
    console.log(`   Size: ${model.sizeFormatted}`);
    console.log(`   Source: ${model.url}\n`);

    return await this.downloadFile(model.url, destination, model.size, onProgress);
  }

  /**
   * Download a file from URL with progress tracking
   */
  async downloadFile(url, destination, expectedSize, onProgress) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let downloadedBytes = 0;
      let lastUpdate = Date.now();
      let lastBytes = 0;
      let idleTimeout = null;

      const request = https.get(url, {
        headers: {
          'User-Agent': 'QMesh/1.0'
        }
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          console.log(`Following redirect to: ${redirectUrl}`);
          return this.downloadFile(redirectUrl, destination, expectedSize, onProgress)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10) || expectedSize;
        const fileStream = createWriteStream(destination);

        // Reset idle timeout when data is received
        const resetIdleTimeout = () => {
          if (idleTimeout) clearTimeout(idleTimeout);
          idleTimeout = setTimeout(() => {
            request.destroy();
            reject(new Error('Download stalled - no data received for 30 seconds'));
          }, 30000); // 30 second idle timeout
        };

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          resetIdleTimeout(); // Reset timeout on each data chunk

          // Update progress every 500ms to avoid too many updates
          const now = Date.now();
          if (now - lastUpdate >= 500 || downloadedBytes === totalSize) {
            const elapsed = (now - startTime) / 1000; // seconds
            const speed = downloadedBytes / elapsed; // bytes/sec
            const remaining = totalSize - downloadedBytes;
            const eta = remaining / speed; // seconds

            const progress = {
              downloaded: downloadedBytes,
              total: totalSize,
              percent: (downloadedBytes / totalSize) * 100,
              speed: speed,
              eta: eta,
              elapsed: elapsed,
            };

            if (onProgress) {
              onProgress(progress);
            } else {
              // Default progress display
              this.displayProgress(progress);
            }

            lastUpdate = now;
            lastBytes = downloadedBytes;
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          if (idleTimeout) clearTimeout(idleTimeout);
          fileStream.close();
          console.log('\n\n✅ Download completed successfully!');
          console.log(`   Path: ${destination}`);
          console.log(`   Size: ${formatBytes(downloadedBytes)}`);

          // Verify file size
          const stats = statSync(destination);
          if (stats.size !== totalSize) {
            console.warn(`⚠️  Warning: File size mismatch (expected ${formatBytes(totalSize)}, got ${formatBytes(stats.size)})`);
          }

          resolve(destination);
        });

        fileStream.on('error', (error) => {
          if (idleTimeout) clearTimeout(idleTimeout);
          unlinkSync(destination);
          reject(error);
        });

        // Start idle timeout
        resetIdleTimeout();
      });

      request.on('error', (error) => {
        if (idleTimeout) clearTimeout(idleTimeout);
        if (existsSync(destination)) {
          unlinkSync(destination);
        }
        reject(error);
      });
    });
  }

  /**
   * Display download progress
   */
  displayProgress(progress) {
    const percent = progress.percent.toFixed(1);
    const downloaded = formatBytes(progress.downloaded);
    const total = formatBytes(progress.total);
    const speed = formatBytes(progress.speed) + '/s';
    const eta = formatTime(progress.eta);

    // Simple one-line progress with spinner
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const spinner = spinnerFrames[Math.floor(Date.now() / 100) % spinnerFrames.length];

    // Clear line and print progress
    process.stdout.write(`\r${spinner} Downloading... ${percent}% | ${downloaded}/${total} | ${speed} | ETA: ${eta}   `);
  }

  /**
   * Interactive model download with hardware-aware recommendations
   * @param {Object} hardware - Hardware detection results
   * @returns {Promise<string>} Path to downloaded model
   */
  async interactiveDownload(hardware) {
    const tier = hardware.recommendation.tier;

    // Filter models by hardware tier
    const availableModels = Object.values(MODEL_CATALOG)
      .filter(model => model.tier.includes(tier))
      .sort((a, b) => a.size - b.size); // Sort by size

    if (availableModels.length === 0) {
      throw new Error(`No models available for hardware tier: ${tier}`);
    }

    // Find recommended model (smallest with recommended flag, or just smallest)
    const recommendedModel = availableModels.find(m => m.recommended) || availableModels[0];

    // Create choices for inquirer
    const choices = availableModels.map(model => {
      const isRecommended = model.id === recommendedModel.id;
      const name = isRecommended
        ? `${model.name} (${model.sizeFormatted}) - Recommended ⭐`
        : `${model.name} (${model.sizeFormatted})`;

      return {
        name,
        value: model.id,
        description: model.description,
      };
    });

    // Add "custom" option
    choices.push({
      name: 'Custom model (enter URL manually)',
      value: 'custom',
      description: 'Download from a custom Hugging Face URL',
    });

    console.log(`\n💡 Recommended models for your hardware (${tier}):`);
    console.log(`   ${hardware.recommendation.reason}\n`);

    // Select model
    const selectedId = await select({
      message: 'Select a model to download:',
      choices,
      default: recommendedModel.id,
    });

    if (selectedId === 'custom') {
      // TODO: Implement custom URL download
      throw new Error('Custom model download not yet implemented');
    }

    const model = MODEL_CATALOG[selectedId];

    // Check disk space
    const requiredSpace = model.size / (1024 ** 3); // GB
    if (hardware.disk.available < requiredSpace + 1) { // +1GB buffer
      const proceed = await confirm({
        message: `⚠️  Low disk space: ${hardware.disk.available.toFixed(1)}GB available, ${requiredSpace.toFixed(1)}GB required. Continue?`,
        default: false,
      });

      if (!proceed) {
        throw new Error('Download cancelled due to insufficient disk space');
      }
    }

    // Confirm download
    const shouldDownload = await confirm({
      message: `Download ${model.name} (${model.sizeFormatted})?`,
      default: true,
    });

    if (!shouldDownload) {
      throw new Error('Download cancelled by user');
    }

    // Download with progress
    return await this.downloadModel(selectedId);
  }

  /**
   * Get recommended models for hardware tier
   */
  getRecommendedModels(tier) {
    return Object.values(MODEL_CATALOG)
      .filter(model => model.tier.includes(tier))
      .sort((a, b) => a.size - b.size);
  }

  /**
   * List all available models in catalog
   */
  listCatalog() {
    return Object.values(MODEL_CATALOG);
  }
}

/**
 * Helper: Format bytes to human-readable string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Helper: Format seconds to human-readable time
 */
export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}h ${m}m`;
  } else if (m > 0) {
    return `${m}m ${s}s`;
  } else {
    return `${s}s`;
  }
}

/**
 * Helper: Create ASCII progress bar
 */
export function createProgressBar(percent, width = 40) {
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return bar;
}

export default ModelDownloader;
