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
 * @param {string} [basePath] - Base path (default: current directory)
 * @returns {string} - Absolute path to llama-server binary
 * @throws {Error} - If binary not found or platform not supported
 */
export function getBinaryPath(basePath = '.') {
  const platform = detectPlatform()

  // Map platform to binary directory
  const binaryPaths = {
    'linux-x64': path.join(basePath, 'bin', 'linux-x64', 'llama-server'),
    'darwin-arm64': path.join(basePath, 'bin', 'darwin-arm64', 'llama-server'),
    'darwin-x64': path.join(basePath, 'bin', 'darwin-x64', 'llama-server'),
    'win32-x64': path.join(basePath, 'bin', 'win32-x64', 'llama-server.exe')
  }

  const binaryPath = binaryPaths[platform]

  if (!binaryPath) {
    throw new Error(
      `Unsupported platform: ${platform}. ` +
      `Supported platforms: ${Object.keys(binaryPaths).join(', ')}`
    )
  }

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
        `Please ensure the binary is bundled correctly.`
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
 * @returns {boolean} - True if binary is available
 */
export function isBinaryAvailable(basePath = '.') {
  try {
    getBinaryPath(basePath)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Get binary info for debugging
 *
 * @param {string} [basePath] - Base path (default: current directory)
 * @returns {object} - Binary information
 */
export function getBinaryInfo(basePath = '.') {
  const platform = detectPlatform()

  try {
    const binaryPath = getBinaryPath(basePath)
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
