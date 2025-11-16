/**
 * Global Score Manager for QMesh Network
 * Manages scores from all workers in the P2P network
 */

export class GlobalScoreManager {
  constructor(silent = false) {
    this.peerScores = new Map(); // Map<workerId, scoreData>
    this.lastUpdate = new Map(); // Map<workerId, timestamp>
    this.staleTimeout = 5 * 60 * 1000; // 5 minutes
    this.silent = silent;
  }

  /**
   * Update or add a peer's score and health data
   */
  updatePeerScore(scoreData) {
    const { workerId, timestamp = Date.now() } = scoreData;

    // Check if we have a more recent update
    const lastUpdate = this.lastUpdate.get(workerId);
    if (lastUpdate && lastUpdate > timestamp) {
      console.log(`⏭️ Ignoring stale score from ${workerId.substring(0, 8)}`);
      return false;
    }

    // Update score data including health metrics
    this.peerScores.set(workerId, {
      ...scoreData,
      lastSeen: Date.now()
    });
    this.lastUpdate.set(workerId, timestamp);

    // Log update with health status if available
    if (!this.silent) {
      const healthEmoji = scoreData.system?.status === 'idle' ? '🟢' :
                          scoreData.system?.status === 'moderate' ? '🟡' :
                          scoreData.system?.status === 'busy' ? '🟠' :
                          scoreData.system?.status === 'overloaded' ? '🔴' : '';

      console.log(`📊 Updated worker ${workerId.substring(0, 8)}: ${scoreData.totalScore} pts ${healthEmoji}`);
    }
    return true;
  }

  /**
   * Update multiple peer scores at once
   */
  updateMultiplePeerScores(scoresArray) {
    let updatedCount = 0;
    scoresArray.forEach(scoreData => {
      if (this.updatePeerScore(scoreData)) {
        updatedCount++;
      }
    });
    console.log(`📊 Updated ${updatedCount} peer scores`);
    return updatedCount;
  }

  /**
   * Get all active peer scores (not stale)
   */
  getActivePeerScores() {
    const now = Date.now();
    const activeScores = new Map();

    for (const [workerId, scoreData] of this.peerScores) {
      const lastSeen = scoreData.lastSeen || 0;
      if (now - lastSeen < this.staleTimeout) {
        activeScores.set(workerId, scoreData);
      }
    }

    return activeScores;
  }

  /**
   * Get combined leaderboard (including local worker)
   */
  getGlobalLeaderboard(localWorkerScore = null, limit = 10) {
    const activeScores = this.getActivePeerScores();

    // Add local worker if provided
    if (localWorkerScore && localWorkerScore.workerId) {
      activeScores.set(localWorkerScore.workerId, {
        ...localWorkerScore,
        isLocal: true,
        lastSeen: Date.now()
      });
    }

    // Convert to array and sort by total score
    const leaderboard = Array.from(activeScores.values())
      .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
      .map((worker, index) => ({
        ...worker,
        rank: index + 1,
        globalRank: index + 1
      }))
      .slice(0, limit);

    return leaderboard;
  }

  /**
   * Get a specific worker's global rank
   */
  getWorkerGlobalRank(workerId) {
    const leaderboard = this.getGlobalLeaderboard(null, Infinity);
    const worker = leaderboard.find(w => w.workerId === workerId);
    return worker ? worker.globalRank : null;
  }

  /**
   * Remove stale workers
   */
  cleanupStaleWorkers() {
    const now = Date.now();
    let removed = 0;

    for (const [workerId, scoreData] of this.peerScores) {
      const lastSeen = scoreData.lastSeen || 0;
      if (now - lastSeen > this.staleTimeout) {
        this.peerScores.delete(workerId);
        this.lastUpdate.delete(workerId);
        removed++;
        console.log(`🗑️ Removed stale worker: ${workerId.substring(0, 8)}`);
      }
    }

    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} stale workers`);
    }
    return removed;
  }

  /**
   * Get statistics about the network
   */
  getNetworkStats() {
    const activeScores = this.getActivePeerScores();
    const allScores = Array.from(activeScores.values());

    if (allScores.length === 0) {
      return {
        totalWorkers: 0,
        averageScore: 0,
        totalRequests: 0,
        topScore: 0,
        networkSuccessRate: 0
      };
    }

    const totalScore = allScores.reduce((sum, w) => sum + (w.totalScore || 0), 0);
    const totalRequests = allScores.reduce((sum, w) => sum + (w.requestCount || 0), 0);
    const totalSuccess = allScores.reduce((sum, w) => sum + (w.successCount || 0), 0);

    return {
      totalWorkers: activeScores.size,
      averageScore: Math.round(totalScore / activeScores.size),
      totalRequests,
      topScore: Math.max(...allScores.map(w => w.totalScore || 0)),
      networkSuccessRate: totalRequests > 0 ? (totalSuccess / totalRequests) : 0
    };
  }

  /**
   * Export current global scores
   */
  exportGlobalScores() {
    return {
      scores: Array.from(this.peerScores.entries()),
      lastUpdates: Array.from(this.lastUpdate.entries()),
      timestamp: Date.now()
    };
  }

  /**
   * Import global scores
   */
  importGlobalScores(data) {
    if (data.scores) {
      data.scores.forEach(([workerId, scoreData]) => {
        this.peerScores.set(workerId, scoreData);
      });
    }
    if (data.lastUpdates) {
      data.lastUpdates.forEach(([workerId, timestamp]) => {
        this.lastUpdate.set(workerId, timestamp);
      });
    }
    console.log(`📥 Imported ${this.peerScores.size} global scores`);
  }

  /**
   * Format leaderboard for display
   */
  formatLeaderboard(limit = 5, localWorkerId = null) {
    const leaderboard = this.getGlobalLeaderboard(null, limit);

    let display = '\n🌐 Global QMesh Leaderboard\n';
    display += '==========================\n\n';

    if (leaderboard.length === 0) {
      display += '   No active workers in network\n';
      return display;
    }

    leaderboard.forEach((worker, index) => {
      const medal = index === 0 ? '🥇' :
                    index === 1 ? '🥈' :
                    index === 2 ? '🥉' : '  ';

      const isLocal = worker.workerId === localWorkerId;
      const marker = isLocal ? ' ← You' : '';

      display += `${medal} #${worker.rank}. Worker ${worker.workerId.substring(0, 8)}...${marker}\n`;
      display += `      Score: ${worker.totalScore || 0} | Level: ${worker.level || 'Bronze'}\n`;

      if (worker.requestCount) {
        const successRate = worker.successRate ? (worker.successRate * 100).toFixed(1) : '0.0';
        display += `      Requests: ${worker.requestCount} | Success: ${successRate}%`;

        if (worker.averageResponseTime) {
          display += ` | Avg: ${worker.averageResponseTime}ms`;
        }
        display += '\n';
      }

      if (worker.achievements && worker.achievements.length > 0) {
        display += `      🏅 ${worker.achievements.join(', ')}\n`;
      }

      display += '\n';
    });

    const stats = this.getNetworkStats();
    display += `📊 Network Stats: ${stats.totalWorkers} workers | ${stats.totalRequests} total requests\n`;

    return display;
  }

  /**
   * Check if a worker exists in global scores
   */
  hasWorker(workerId) {
    return this.peerScores.has(workerId);
  }

  /**
   * Get specific worker's data
   */
  getWorkerScore(workerId) {
    return this.peerScores.get(workerId) || null;
  }

  /**
   * Get available workers (not overloaded and accepting work)
   */
  getAvailableWorkers() {
    const activeScores = this.getActivePeerScores();
    const available = [];

    for (const [workerId, data] of activeScores) {
      // Skip if system data not available
      if (!data.system) continue;

      // Skip if not accepting or overloaded
      if (!data.system.isAccepting || data.system.status === 'overloaded') continue;

      // Skip if queue is full
      if (data.system.queueLength >= data.system.maxQueue) continue;

      available.push(data);
    }

    return available;
  }

  /**
   * Select best worker based on health and performance
   *
   * @example
   * // Scenario 1: Mixed queue states
   * // Workers:
   * // - Worker A: Score 1000, Queue 2/5, Health 80
   * // - Worker B: Score 500,  Queue 0/5, Health 70  <- Selected (empty queue)
   * // - Worker C: Score 750,  Queue 1/5, Health 90
   *
   * @example
   * // Scenario 2: All have empty queues
   * // Workers:
   * // - Worker A: Score 1000, Queue 0/5, Health 80
   * // - Worker B: Score 500,  Queue 0/5, Health 70
   * // - Worker C: Score 750,  Queue 0/5, Health 95  <- Selected (best health)
   *
   * @example
   * // Scenario 3: All have items in queue
   * // Workers:
   * // - Worker A: Score 1000, Queue 4/5, Health 80
   * // - Worker B: Score 500,  Queue 1/5, Health 70  <- Selected (least loaded)
   * // - Worker C: Score 750,  Queue 3/5, Health 90
   *
   * @example
   * // Scenario 4: Some overloaded (not in available list)
   * // Workers:
   * // - Worker A: Score 1000, Queue 5/5, Status: overloaded  <- Skipped
   * // - Worker B: Score 500,  Queue 0/5, Health 70           <- Selected
   * // - Worker C: Score 750,  Queue 4/5, Status: busy        <- Available but not selected
   */
  selectBestWorker() {
    const available = this.getAvailableWorkers();

    if (available.length === 0) {
      console.log('⚠️ No available workers');
      return null;
    }

    // First priority: Find workers with empty queues
    const emptyQueueWorkers = available.filter(w => w.system.queueLength === 0);

    if (emptyQueueWorkers.length > 0) {
      // Among workers with empty queues, pick the healthiest one
      const best = emptyQueueWorkers.reduce((best, worker) => {
        const workerHealth = worker.system.healthScore || 50;
        const bestHealth = best.system.healthScore || 50;
        return workerHealth > bestHealth ? worker : best;
      });

      console.log(`🎯 Selected worker ${best.workerId.substring(0, 8)} (empty queue, health: ${best.system.healthScore})`);
      return best;
    }

    // If no workers have empty queues, score them normally
    const scored = available.map(worker => {
      let score = 0;

      // Queue availability (60%) - Higher weight for queue
      const queueRatio = 1 - (worker.system.queueLength / worker.system.maxQueue);
      score += queueRatio * 60;

      // System health (30%)
      const healthScore = worker.system.healthScore || 50;
      score += (healthScore / 100) * 30;

      // Performance history (10%)
      const perfScore = worker.successRate ? worker.successRate * 10 : 5;
      score += perfScore;

      return { worker, score };
    });

    // Sort by score and return best
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    console.log(`🎯 Selected worker ${best.worker.workerId.substring(0, 8)} (queue: ${best.worker.system.queueLength}/${best.worker.system.maxQueue}, score: ${best.score.toFixed(1)})`);

    return best.worker;
  }

  /**
   * Get health statistics for all workers
   */
  getNetworkHealth() {
    const activeScores = this.getActivePeerScores();
    let idle = 0, light = 0, moderate = 0, busy = 0, overloaded = 0;

    for (const [workerId, data] of activeScores) {
      if (!data.system) continue;

      switch (data.system.status) {
        case 'idle': idle++; break;
        case 'light': light++; break;
        case 'moderate': moderate++; break;
        case 'busy': busy++; break;
        case 'overloaded': overloaded++; break;
      }
    }

    return {
      total: activeScores.size,
      idle,
      light,
      moderate,
      busy,
      overloaded,
      available: idle + light + moderate,
      unavailable: busy + overloaded
    };
  }

  /**
   * Clear all scores
   */
  clearAll() {
    this.peerScores.clear();
    this.lastUpdate.clear();
    console.log('🗑️ Cleared all global scores');
  }
}

export default GlobalScoreManager;