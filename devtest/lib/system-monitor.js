/**
 * System Monitor for QMesh Workers
 * Monitors CPU, memory, and system health for intelligent load distribution
 */

import os from 'bare-os';

export class SystemMonitor {
  constructor() {
    this.history = {
      cpu: [],
      memory: [],
      responseTime: []
    };
    this.maxHistory = 10;
  }

  /**
   * Get current CPU usage percentage
   */
  getCPUUsage() {
    const cpus = os.cpus();

    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return Math.min(100, Math.max(0, usage));
  }

  /**
   * Get system load average
   */
  getLoadAverage() {
    const loadAvg = os.loadavg();
    const numCPUs = os.cpus().length;

    // Normalize load average by number of CPUs
    return {
      one: loadAvg[0] / numCPUs,
      five: loadAvg[1] / numCPUs,
      fifteen: loadAvg[2] / numCPUs,
      raw: loadAvg[0]
    };
  }

  /**
   * Get memory usage percentage
   */
  getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      percentage: Math.round((usedMem / totalMem) * 100),
      used: usedMem,
      free: freeMem,
      total: totalMem
    };
  }

  /**
   * Get process-specific memory usage
   */
  getProcessMemory() {
    // Process memory not available in Pear runtime
    // Return system memory as fallback
    const memoryUsage = this.getMemoryUsage();

    return {
      heapUsed: 0,
      heapTotal: 0,
      rss: memoryUsage.used,
      percentage: memoryUsage.percentage
    };
  }

  /**
   * Calculate overall system health status
   */
  getSystemStatus(queueLength = 0, maxQueue = 5) {
    const cpu = this.getCPUUsage();
    const memory = this.getMemoryUsage();
    const load = this.getLoadAverage();
    const queueUsage = (queueLength / maxQueue) * 100;

    // Calculate health score (0-100, higher is better)
    const cpuScore = 100 - cpu;
    const memScore = 100 - memory.percentage;
    const loadScore = Math.max(0, 100 - (load.one * 100));
    const queueScore = 100 - queueUsage;

    const healthScore = (cpuScore * 0.3 + memScore * 0.3 + loadScore * 0.2 + queueScore * 0.2);

    let status;
    if (healthScore > 80) status = 'idle';
    else if (healthScore > 60) status = 'light';
    else if (healthScore > 40) status = 'moderate';
    else if (healthScore > 20) status = 'busy';
    else status = 'overloaded';

    return {
      status,
      healthScore: Math.round(healthScore),
      metrics: {
        cpu,
        memory: memory.percentage,
        load: load.one,
        queue: queueUsage
      }
    };
  }

  /**
   * Determine if system can accept more work
   */
  canAcceptWork(queueLength = 0, maxQueue = 5) {
    const status = this.getSystemStatus(queueLength, maxQueue);

    // Don't accept if overloaded
    if (status.status === 'overloaded') return false;

    // Don't accept if queue is full
    if (queueLength >= maxQueue) return false;

    // Don't accept if CPU or memory critically high
    if (status.metrics.cpu > 90 || status.metrics.memory > 90) return false;

    return true;
  }

  /**
   * Calculate dynamic queue capacity based on system load
   */
  getDynamicQueueCapacity(baseCapacity = 5) {
    const status = this.getSystemStatus();

    switch (status.status) {
      case 'idle':
        return baseCapacity;
      case 'light':
        return Math.max(3, Math.floor(baseCapacity * 0.8));
      case 'moderate':
        return Math.max(2, Math.floor(baseCapacity * 0.6));
      case 'busy':
        return Math.max(1, Math.floor(baseCapacity * 0.4));
      case 'overloaded':
        return 0;
      default:
        return baseCapacity;
    }
  }

  /**
   * Add response time to history and calculate average
   */
  addResponseTime(ms) {
    this.history.responseTime.push(ms);
    if (this.history.responseTime.length > this.maxHistory) {
      this.history.responseTime.shift();
    }
  }

  /**
   * Get average response time from history
   */
  getAverageResponseTime() {
    if (this.history.responseTime.length === 0) return 0;

    const sum = this.history.responseTime.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.history.responseTime.length);
  }

  /**
   * Get complete system health report
   */
  getHealthReport(queueLength = 0, maxQueue = 5) {
    const cpu = this.getCPUUsage();
    const memory = this.getMemoryUsage();
    const load = this.getLoadAverage();
    const status = this.getSystemStatus(queueLength, maxQueue);
    const dynamicCapacity = this.getDynamicQueueCapacity(maxQueue);

    return {
      system: {
        cpuUsage: cpu,
        memoryUsage: memory.percentage,
        processMemory: memory.percentage,
        loadAverage: load.one,
        loadAverages: [load.one, load.five, load.fifteen]
      },
      queue: {
        current: queueLength,
        capacity: maxQueue,
        dynamicCapacity,
        percentage: Math.round((queueLength / maxQueue) * 100)
      },
      health: {
        status: status.status,
        score: status.healthScore,
        canAccept: this.canAcceptWork(queueLength, maxQueue)
      },
      performance: {
        avgResponseTime: this.getAverageResponseTime(),
        recentTimes: this.history.responseTime.slice(-5)
      }
    };
  }

  /**
   * Format health status for display
   */
  getStatusEmoji(status) {
    switch (status) {
      case 'idle': return '🟢';
      case 'light': return '🟢';
      case 'moderate': return '🟡';
      case 'busy': return '🟠';
      case 'overloaded': return '🔴';
      default: return '⚪';
    }
  }

  /**
   * Get a brief health summary
   */
  getHealthSummary(queueLength = 0, maxQueue = 5) {
    const report = this.getHealthReport(queueLength, maxQueue);
    const emoji = this.getStatusEmoji(report.health.status);

    return {
      emoji,
      status: report.health.status,
      cpu: report.system.cpuUsage,
      memory: report.system.memoryUsage,
      queue: `${queueLength}/${maxQueue}`,
      accepting: report.health.canAccept
    };
  }
}

export default SystemMonitor;