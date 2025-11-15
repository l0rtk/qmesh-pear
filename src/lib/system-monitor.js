/**
 * System Monitor - Health and Resource Tracking
 *
 * Monitors system resources and calculates worker health scores.
 *
 * Tracks:
 * - CPU usage (0-100%)
 * - Memory usage (0-100%)
 * - Queue fullness (current/capacity)
 *
 * Health Score Calculation:
 *   healthScore = (100 - cpuUsage) * 0.4
 *               + (100 - memoryUsage) * 0.4
 *               + queueAvailability * 0.2
 *
 * Health States:
 *   - 🟢 Healthy (score > 60): Accept requests
 *   - 🟡 Busy (score 20-60): Accept but slower
 *   - 🔴 Overloaded (score < 20): Reject new requests
 *
 * Usage:
 *   const monitor = new SystemMonitor({ queueCapacity: 10 })
 *   monitor.startMonitoring(5000) // Update every 5 seconds
 *
 *   const health = monitor.getHealth()
 *   console.log(health.score, health.state)
 */

import EventEmitter from 'bare-events'
import os from '#os'

/**
 * SystemMonitor - Tracks system resources and health
 */
export class SystemMonitor extends EventEmitter {
  constructor(options = {}) {
    super()

    this.options = {
      queueCapacity: options.queueCapacity || 10,
      updateInterval: options.updateInterval || 5000, // 5 seconds default
      ...options
    }

    // State
    this.cpuUsage = 0
    this.memoryUsage = 0
    this.queueSize = 0
    this.healthScore = 100
    this.healthState = 'healthy'

    // CPU tracking state
    this.previousCpuInfo = null
    this.monitoringInterval = null
  }

  /**
   * Start periodic monitoring
   *
   * @param {number} [interval] - Update interval in milliseconds (default: from options)
   */
  startMonitoring(interval = null) {
    const updateInterval = interval || this.options.updateInterval

    // Initial update
    this.updateMetrics()

    // Periodic updates
    this.monitoringInterval = setInterval(() => {
      this.updateMetrics()
    }, updateInterval)

    this.emit('monitoring-started', updateInterval)
  }

  /**
   * Stop periodic monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      this.emit('monitoring-stopped')
    }
  }

  /**
   * Update all metrics and calculate health score
   */
  updateMetrics() {
    this.cpuUsage = this._calculateCpuUsage()
    this.memoryUsage = this._calculateMemoryUsage()
    this.healthScore = this._calculateHealthScore()
    this.healthState = this._determineHealthState()

    this.emit('metrics-updated', this.getHealth())
  }

  /**
   * Calculate CPU usage percentage
   *
   * Note: bare-os doesn't provide CPU timing info like Node.js os.cpus()
   * For now, we return 0% (CPU monitoring not available in Bare Runtime)
   * TODO: Implement via /proc/stat on Linux or alternative methods
   *
   * @private
   * @returns {number} - CPU usage (0-100)
   */
  _calculateCpuUsage() {
    // Check if os.cpus() is available (Node.js)
    if (typeof os.cpus === 'function') {
      const cpus = os.cpus()

      if (!cpus || cpus.length === 0) {
        return 0
      }

      // Calculate total CPU time and idle time
      let totalIdle = 0
      let totalTick = 0

      for (const cpu of cpus) {
        // Times are in milliseconds
        totalIdle += cpu.times.idle
        totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq
      }

      // If we have previous measurements, calculate usage
      if (this.previousCpuInfo) {
        const idleDiff = totalIdle - this.previousCpuInfo.idle
        const totalDiff = totalTick - this.previousCpuInfo.total

        if (totalDiff > 0) {
          const usage = 100 - (100 * idleDiff / totalDiff)
          this.previousCpuInfo = { idle: totalIdle, total: totalTick }
          return Math.max(0, Math.min(100, usage))
        }
      }

      // First measurement - store and return 0
      this.previousCpuInfo = { idle: totalIdle, total: totalTick }
      return 0
    }

    // Bare Runtime fallback: CPU monitoring not available
    // Return 0% (optimistic assumption - won't penalize health score)
    return 0
  }

  /**
   * Calculate memory usage percentage
   *
   * Note: bare-os doesn't provide system-wide memory info like Node.js
   * We use resourceUsage().maxRSS (process memory in KB) as a proxy
   * For Bare Runtime, we estimate based on process memory footprint
   *
   * @private
   * @returns {number} - Memory usage (0-100)
   */
  _calculateMemoryUsage() {
    // Check if Node.js os.totalmem() is available
    if (typeof os.totalmem === 'function' && typeof os.freemem === 'function') {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()

      if (totalMem === 0) {
        return 0
      }

      const usedMem = totalMem - freeMem
      const usage = (usedMem / totalMem) * 100

      return Math.max(0, Math.min(100, usage))
    }

    // Bare Runtime fallback: Use process memory as indicator
    // resourceUsage().maxRSS gives process memory in KB
    if (typeof os.resourceUsage === 'function') {
      const usage = os.resourceUsage()
      const processMemMB = usage.maxRSS / 1024 // Convert KB to MB

      // Simplified heuristic:
      // - < 500MB: 0% usage (healthy)
      // - 500MB-2GB: Linear scale to 50%
      // - > 2GB: Cap at 50% (we don't penalize too much for process memory)
      if (processMemMB < 500) {
        return 0
      } else if (processMemMB < 2048) {
        return ((processMemMB - 500) / (2048 - 500)) * 50
      } else {
        return 50
      }
    }

    // No memory monitoring available - return 0% (optimistic)
    return 0
  }

  /**
   * Calculate queue availability percentage
   *
   * @private
   * @returns {number} - Queue availability (0-100)
   */
  _calculateQueueAvailability() {
    if (this.options.queueCapacity === 0) {
      return 100
    }

    const fullness = (this.queueSize / this.options.queueCapacity) * 100
    const availability = 100 - fullness

    return Math.max(0, Math.min(100, availability))
  }

  /**
   * Calculate overall health score
   *
   * @private
   * @returns {number} - Health score (0-100)
   */
  _calculateHealthScore() {
    const cpuScore = (100 - this.cpuUsage) * 0.4
    const memoryScore = (100 - this.memoryUsage) * 0.4
    const queueScore = this._calculateQueueAvailability() * 0.2

    const score = cpuScore + memoryScore + queueScore

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Determine health state based on score
   *
   * @private
   * @returns {string} - Health state: 'healthy', 'busy', or 'overloaded'
   */
  _determineHealthState() {
    if (this.healthScore > 60) {
      return 'healthy'
    } else if (this.healthScore >= 20) {
      return 'busy'
    } else {
      return 'overloaded'
    }
  }

  /**
   * Update queue size (called by worker when queue changes)
   *
   * @param {number} size - Current queue size
   */
  setQueueSize(size) {
    this.queueSize = Math.max(0, size)

    // Recalculate health immediately when queue changes
    this.healthScore = this._calculateHealthScore()
    this.healthState = this._determineHealthState()

    this.emit('queue-changed', this.queueSize)
  }

  /**
   * Increment queue size
   */
  incrementQueue() {
    this.setQueueSize(this.queueSize + 1)
  }

  /**
   * Decrement queue size
   */
  decrementQueue() {
    this.setQueueSize(this.queueSize - 1)
  }

  /**
   * Get current health status
   *
   * @returns {object} - Health status
   */
  getHealth() {
    return {
      score: Math.round(this.healthScore),
      state: this.healthState,
      cpu: Math.round(this.cpuUsage),
      memory: Math.round(this.memoryUsage),
      queue: {
        size: this.queueSize,
        capacity: this.options.queueCapacity,
        fullness: Math.round((this.queueSize / this.options.queueCapacity) * 100)
      },
      canAcceptRequests: this.healthScore >= 20,
      timestamp: Date.now()
    }
  }

  /**
   * Get detailed system information
   *
   * @returns {object} - System information
   */
  getSystemInfo() {
    const info = {
      platform: os.platform(),
      arch: os.arch(),
      cpuCount: typeof os.cpus === 'function' ? os.cpus().length : 0,
      loadAverage: typeof os.loadavg === 'function' ? os.loadavg() : [0, 0, 0]
    }

    // Add Node.js-specific fields if available
    if (typeof os.totalmem === 'function') {
      info.totalMemory = os.totalmem()
    }

    if (typeof os.freemem === 'function') {
      info.freeMemory = os.freemem()
    }

    if (typeof os.uptime === 'function') {
      info.uptime = os.uptime()
    }

    // Add Bare Runtime process info if available
    if (typeof os.resourceUsage === 'function') {
      info.processMemory = os.resourceUsage().maxRSS // In KB
    }

    return info
  }

  /**
   * Check if worker can accept new requests
   *
   * @returns {boolean} - True if health score >= 20
   */
  canAcceptRequests() {
    return this.healthScore >= 20
  }

  /**
   * Get health emoji based on state
   *
   * @returns {string} - Emoji: 🟢, 🟡, or 🔴
   */
  getHealthEmoji() {
    switch (this.healthState) {
      case 'healthy':
        return '🟢'
      case 'busy':
        return '🟡'
      case 'overloaded':
        return '🔴'
      default:
        return '⚪'
    }
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.cpuUsage = 0
    this.memoryUsage = 0
    this.queueSize = 0
    this.healthScore = 100
    this.healthState = 'healthy'
    this.previousCpuInfo = null

    this.emit('reset')
  }

  /**
   * Clean shutdown
   */
  destroy() {
    this.stopMonitoring()
    this.reset()
    this.emit('destroyed')
  }
}
