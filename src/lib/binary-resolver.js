/**
 * Binary Resolver - Auto-detect and locate llama-server binary
 *
 * Handles platform detection and binary path resolution for bundled binaries.
 *
 * Supported platforms:
 * - Linux x86-64
 * - macOS ARM64 (M1/M2) - TODO
 * - macOS x86-64 (Intel) - TODO
 * - Windows x86-64 - TODO
 *
 * Usage:
 *   import { getBinaryPath } from './binary-resolver.js'
 *
 *   const binaryPath = getBinaryPath()
 *   // Returns: './bin/linux-x64/llama-server' or throws error
 */

import os from '#os'
import path from '#path'
import fs from '#fs'
import { extractBinary } from './binary-extractor.js'
import { downloadBinary } from './llama-binary-downloader.js'

/**
 * Detect current platform
 *
 * @returns {string} - Platform identifier (e.g., 'linux-x64', 'darwin-arm64')
 */
export function detectPlatform() {
  const platform = os.platform() // 'linux', 'darwin', 'win32'
  const arch = os.arch()         // 'x64', 'arm64'

  // Normalize platform names
  const platformMap = {
    linux: 'linux',
    darwin: 'darwin',
    win32: 'win32'
  }

  // Normalize architecture names
  const archMap = {
    x64: 'x64',
    arm64: 'arm64',
    aarch64: 'arm64'
  }

  const normalizedPlatform = platformMap[platform] || platform
  const normalizedArch = archMap[arch] || arch

  return `${normalizedPlatform}-${normalizedArch}`
}

/**
 * Get bundled binary path for current platform
 *
 * @param {string} [basePath] - Base path (default: auto-detect from Pear.config.storage or cwd)
 * @returns {Promise<string>} - Absolute path to llama-server binary
 * @throws {Error} - If binary not found or platform not supported
 */
export async function getBinaryPath(basePath = null) {
  const platform = detectPlatform()

  // Validate platform support
  const supportedPlatforms = ['linux-x64', 'darwin-arm64', 'darwin-x64', 'win32-x64']
  if (!supportedPlatforms.includes(platform)) {
    throw new Error(
      `Unsupported platform: ${platform}. ` +
      `Supported platforms: ${supportedPlatforms.join(', ')}`
    )
  }

  // Binary name varies by platform
  const binaryName = platform === 'win32-x64' ? 'llama-server.exe' : 'llama-server'

  // Auto-detect base path
  if (!basePath) {
    if (typeof Pear !== 'undefined' && Pear.config) {
      // Running in Pear Runtime - use storage directory
      basePath = Pear.config.storage
      console.log('📦 Running in Pear Runtime')
      console.log(`   Storage: ${basePath}`)

      // Check if binary already extracted
      const binaryPath = path.join(basePath, 'bin', binaryName)

      try {
        const stats = fs.statSync(binaryPath)
        if (stats.isFile() && stats.size > 1000000) {
          console.log(`   ✓ Binary already extracted: ${binaryPath}`)
          return path.resolve(binaryPath)
        }
      } catch (error) {
        // Binary not found, need to extract
      }

      // Try to extract binaries from Pear app bundle to storage
      console.log('   📥 Extracting binaries from app bundle...')
      try {
        const extractedPath = await extractBinary(basePath, import.meta.url)
        console.log(`   ✓ Extraction complete: ${extractedPath}`)
        return path.resolve(extractedPath)
      } catch (error) {
        console.log(`   ⚠️  Extraction failed: ${error.message}`)
        console.log('   📥 Attempting binary download instead...')

        // Fallback: Download binaries if extraction fails
        const targetDir = path.join(basePath, 'bin')
        try {
          const downloadedPath = await downloadBinary(targetDir)
          return path.resolve(downloadedPath)
        } catch (downloadError) {
          throw new Error(
            `Failed to obtain llama-server binary for platform ${platform}.\n` +
            `Extraction error: ${error.message}\n` +
            `Download error: ${downloadError.message}\n` +
            `Storage path: ${basePath}`
          )
        }
      }
    } else {
      // Dev mode - use current working directory
      basePath = process.cwd()
    }
  }

  // Dev mode: look for binary in bundled location
  const binaryPath = path.join(basePath, 'bin', platform, binaryName)

  // Check if binary exists
  try {
    const stats = fs.statSync(binaryPath)
    if (!stats.isFile()) {
      throw new Error(`Binary path is not a file: ${binaryPath}`)
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `llama-server binary not found for platform ${platform}.\n` +
        `Expected location: ${binaryPath}\n` +
        `Base path: ${basePath}\n` +
        `Please ensure the binary is bundled in bin/${platform}/`
      )
    }
    throw error
  }

  // Return absolute path
  return path.resolve(binaryPath)
}

/**
 * Check if bundled binary is available for current platform
 *
 * @param {string} [basePath] - Base path (default: current directory)
 * @returns {Promise<boolean>} - True if binary is available
 */
export async function isBinaryAvailable(basePath = '.') {
  try {
    await getBinaryPath(basePath)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Get binary info for debugging
 *
 * @param {string} [basePath] - Base path (default: current directory)
 * @returns {Promise<object>} - Binary information
 */
export async function getBinaryInfo(basePath = '.') {
  const platform = detectPlatform()

  try {
    const binaryPath = await getBinaryPath(basePath)
    const stats = fs.statSync(binaryPath)

    return {
      platform,
      binaryPath,
      exists: true,
      size: stats.size,
      sizeHuman: `${(stats.size / 1024 / 1024).toFixed(1)}MB`,
      executable: !!(stats.mode & 0o111)
    }
  } catch (error) {
    return {
      platform,
      binaryPath: null,
      exists: false,
      error: error.message
    }
  }
}
