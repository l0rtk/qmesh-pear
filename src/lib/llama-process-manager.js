/**
 * Llama Process Manager
 *
 * Manages the llama-server subprocess lifecycle:
 * - Spawns llama-server with correct configuration
 * - Monitors process health
 * - Auto-restarts on crash
 * - Graceful shutdown
 */

import { spawn } from 'bare-subprocess'
import process from '#process'
import path from '#path'
import fs from '#fs/promises'

export class LlamaProcessManager {
  constructor(config = {}) {
    this.config = {
      binaryPath: config.binaryPath || this.detectBinaryPath(),
      modelPath: config.modelPath,
      host: config.host || '127.0.0.1',
      port: config.port || 8080,
      gpuLayers: config.gpuLayers || 33,
      ctxSize: config.ctxSize || 2048,
      threads: config.threads || 4,
      parallel: config.parallel || 4,
      ...config
    }

    this.process = null
    this.isRunning = false
    this.startTime = null
    this.restartCount = 0
    this.maxRestarts = 3
  }

  /**
   * Detect llama-server binary path based on platform
   */
  detectBinaryPath() {
    const platform = process.platform
    const arch = process.arch
    const ext = platform === 'win32' ? '.exe' : ''

    // Try bundled binary first
    const bundledPath = path.join(
      process.cwd(),
      'binaries',
      `${platform}-${arch}`,
      `llama-server${ext}`
    )

    // Fallback to system PATH
    return bundledPath
  }

  /**
   * Start llama-server subprocess
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  llama-server already running')
      return
    }

    console.log('🚀 Starting llama-server...')
    console.log('   Binary:', this.config.binaryPath)
    console.log('   Model:', this.config.modelPath)
    console.log('   Port:', this.config.port)
    console.log('   GPU Layers:', this.config.gpuLayers)

    // Build command arguments
    const args = [
      '--model', this.config.modelPath,
      '--host', this.config.host,
      '--port', String(this.config.port),
      '--n-gpu-layers', String(this.config.gpuLayers),
      '--ctx-size', String(this.config.ctxSize),
      '--threads', String(this.config.threads),
      '--parallel', String(this.config.parallel),
      '--log-disable'  // Reduce noise
    ]

    try {
      // Spawn llama-server process
      this.process = spawn(this.config.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      })

      this.isRunning = true
      this.startTime = Date.now()

      // Handle stdout
      this.process.stdout.on('data', (data) => {
        const output = data.toString()
        if (this.config.verbose) {
          console.log('[llama-server]', output.trim())
        }
      })

      // Handle stderr
      this.process.stderr.on('data', (data) => {
        const output = data.toString()
        // Only log errors and important messages
        if (output.includes('error') || output.includes('failed')) {
          console.error('[llama-server ERROR]', output.trim())
        } else if (this.config.verbose) {
          console.log('[llama-server]', output.trim())
        }
      })

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        this.isRunning = false
        console.log(`📉 llama-server exited (code: ${code}, signal: ${signal})`)

        if (code !== 0 && this.restartCount < this.maxRestarts) {
          console.log(`🔄 Auto-restarting (attempt ${this.restartCount + 1}/${this.maxRestarts})...`)
          this.restartCount++
          setTimeout(() => this.start(), 2000)
        }
      })

      // Handle errors
      this.process.on('error', (error) => {
        console.error('❌ llama-server error:', error.message)
        this.isRunning = false
      })

      // Wait for server to be ready
      console.log('⏳ Waiting for llama-server to be ready...')
      await this.waitForReady()

      console.log('✅ llama-server is ready!')
      this.restartCount = 0  // Reset on successful start

    } catch (error) {
      console.error('❌ Failed to start llama-server:', error.message)
      throw error
    }
  }

  /**
   * Wait for server to be ready by polling health endpoint
   */
  async waitForReady(timeout = 30000) {
    const startTime = Date.now()
    const checkInterval = 500

    while (Date.now() - startTime < timeout) {
      if (!this.isRunning) {
        throw new Error('llama-server process died during startup')
      }

      try {
        // Try to connect to health endpoint
        const response = await fetch(`http://${this.config.host}:${this.config.port}/health`)
        if (response.ok) {
          return true
        }
      } catch (error) {
        // Server not ready yet, continue polling
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    throw new Error(`llama-server failed to start within ${timeout}ms`)
  }

  /**
   * Stop llama-server subprocess
   */
  async stop(gracefulTimeout = 5000) {
    if (!this.isRunning || !this.process) {
      console.log('⚠️  llama-server not running')
      return
    }

    console.log('🛑 Stopping llama-server...')

    try {
      // Try graceful shutdown first
      this.process.kill('SIGTERM')

      // Wait for process to exit
      const exited = await this.waitForExit(gracefulTimeout)

      if (!exited) {
        console.log('⚠️  Graceful shutdown timeout, force killing...')
        this.process.kill('SIGKILL')
        await this.waitForExit(1000)
      }

      this.process = null
      this.isRunning = false
      console.log('✅ llama-server stopped')

    } catch (error) {
      console.error('❌ Error stopping llama-server:', error.message)
      throw error
    }
  }

  /**
   * Wait for process to exit
   */
  async waitForExit(timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeout)

      this.process.once('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  /**
   * Check if server is healthy
   */
  async isHealthy() {
    if (!this.isRunning) {
      return false
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)

      const response = await fetch(`http://${this.config.host}:${this.config.port}/health`, {
        signal: controller.signal
      })

      clearTimeout(timeout)
      return response.ok
    } catch (error) {
      return false
    }
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      isRunning: this.isRunning,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      restartCount: this.restartCount,
      config: this.config,
      endpoint: `http://${this.config.host}:${this.config.port}`
    }
  }

  /**
   * Restart server
   */
  async restart() {
    console.log('🔄 Restarting llama-server...')
    await this.stop()
    await new Promise(resolve => setTimeout(resolve, 1000))
    await this.start()
  }
}
