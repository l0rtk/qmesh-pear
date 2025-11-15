/**
 * Model Downloader - Auto-download GGUF models from Hugging Face
 *
 * Handles missing models by downloading them on demand
 */

import fs from '#fs'
import path from '#path'
import process from '#process'

/**
 * Available models for download
 */
export const MODELS = {
  'tinyllama-1.1b': {
    id: 'tinyllama-1.1b',
    name: 'TinyLlama 1.1B Chat (Q4_K_M)',
    filename: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    size: 668851200, // bytes
    sizeHuman: '638 MB',
    url: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    description: 'Fast, works on CPU. Good for testing and low-resource devices.',
    recommended: true
  },
  'llama-3.2-3b': {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B Instruct (Q4_K_M)',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    size: 2000000000, // approximate
    sizeHuman: '1.9 GB',
    url: 'https://huggingface.co/lmstudio-community/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    description: 'Better quality, requires more resources.',
    recommended: false
  }
}

/**
 * Check if a model file exists
 *
 * @param {string} modelPath - Path to model file
 * @returns {boolean} - True if model exists
 */
export function modelExists(modelPath) {
  try {
    const stats = fs.statSync(modelPath)
    return stats.isFile() && stats.size > 0
  } catch (error) {
    return false
  }
}

/**
 * Get model info by path
 *
 * @param {string} modelPath - Path to model file
 * @returns {object|null} - Model info or null if not recognized
 */
export function getModelInfo(modelPath) {
  const filename = path.basename(modelPath)

  for (const model of Object.values(MODELS)) {
    if (model.filename === filename) {
      return model
    }
  }

  return null
}

/**
 * Download a model file from Hugging Face
 *
 * Uses fetch() with streaming to show progress
 *
 * @param {object} model - Model metadata from MODELS
 * @param {string} destPath - Destination path for downloaded file
 * @param {function} [onProgress] - Progress callback (bytesDownloaded, totalBytes)
 * @returns {Promise<void>}
 */
export async function downloadModel(model, destPath, onProgress = null) {
  // Ensure models directory exists
  const modelsDir = path.dirname(destPath)
  try {
    fs.mkdirSync(modelsDir, { recursive: true })
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error
    }
  }

  console.log(`\n📥 Downloading ${model.name}...`)
  console.log(`   URL: ${model.url}`)
  console.log(`   Size: ${model.sizeHuman}`)
  console.log(`   Destination: ${destPath}`)
  console.log('')

  try {
    const response = await fetch(model.url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const totalBytes = parseInt(response.headers.get('content-length') || model.size, 10)
    let downloadedBytes = 0

    // Create write stream
    const fileStream = fs.createWriteStream(destPath)

    // Process stream chunks
    const reader = response.body.getReader()

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      // Write chunk to file
      fileStream.write(value)
      downloadedBytes += value.length

      // Report progress
      if (onProgress) {
        onProgress(downloadedBytes, totalBytes)
      } else {
        // Default progress display
        const percent = Math.round((downloadedBytes / totalBytes) * 100)
        const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(1)
        const totalMB = (totalBytes / 1024 / 1024).toFixed(1)

        process.stdout.write(`\r   Progress: ${percent}% (${downloadedMB} MB / ${totalMB} MB)`)
      }
    }

    // Close file stream
    fileStream.end()

    // Wait for file stream to finish
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve)
      fileStream.on('error', reject)
    })

    console.log('\n\n✅ Download complete!')

  } catch (error) {
    // Clean up partial download
    try {
      fs.unlinkSync(destPath)
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    throw new Error(`Download failed: ${error.message}`)
  }
}

/**
 * Prompt user to select a model for download
 *
 * @returns {Promise<object>} - Selected model info
 */
export async function promptModelSelection() {
  // For now, just return the default model
  // In the future, this could use @inquirer/prompts for interactive selection
  return MODELS['tinyllama-1.1b']
}

/**
 * Ensure model is available (download if missing)
 *
 * @param {string} modelPath - Path where model should be
 * @param {object} [options] - Options
 * @param {boolean} [options.autoDownload=false] - Auto-download without prompting
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<boolean>} - True if model is ready, false if user declined download
 */
export async function ensureModel(modelPath, options = {}) {
  const { autoDownload = false, onProgress = null } = options

  // Check if model already exists
  if (modelExists(modelPath)) {
    console.log(`✅ Model found: ${modelPath}`)
    return true
  }

  console.log(`\n⚠️  Model not found: ${modelPath}`)

  // Get model info
  const modelInfo = getModelInfo(modelPath)

  if (!modelInfo) {
    console.log(`\n❌ Unknown model file: ${path.basename(modelPath)}`)
    console.log('   Available models:')
    for (const model of Object.values(MODELS)) {
      console.log(`   - ${model.name} (${model.sizeHuman})`)
    }
    throw new Error(`Model not recognized: ${path.basename(modelPath)}`)
  }

  // Prompt for download (or auto-download)
  if (!autoDownload) {
    console.log(`\n📦 ${modelInfo.name} (${modelInfo.sizeHuman})`)
    console.log(`   ${modelInfo.description}`)
    console.log(`\n⚠️  Auto-download will be implemented in the next update.`)
    console.log(`\n📥 For now, please download manually:`)
    console.log(`   ${modelInfo.url}`)
    console.log(`\n   Save to: ${modelPath}`)
    throw new Error('Model download required (manual for now)')
  }

  // Download model
  await downloadModel(modelInfo, modelPath, onProgress)

  return true
}

/**
 * List available models
 *
 * @returns {object[]} - Array of model info
 */
export function listModels() {
  return Object.values(MODELS)
}
