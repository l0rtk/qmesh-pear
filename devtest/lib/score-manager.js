/**
 * Score Manager for QMesh Network
 * Handles worker scoring, achievements, and leaderboard
 */

export class ScoreManager {
  constructor() {
    this.scores = new Map();
    this.achievements = new Map();
    this.leaderboard = [];
  }

  /**
   * Calculate score for a request based on multiple factors
   */
  calculateRequestScore(metrics) {
    let score = 0;

    // Speed Score (max 5 points)
    const { processingTime, promptLength, resultLength, success } = metrics;

    if (processingTime < 500) score += 5;
    else if (processingTime < 1000) score += 4;
    else if (processingTime < 2000) score += 3;
    else if (processingTime < 3000) score += 2;
    else if (processingTime < 5000) score += 1;

    // Complexity Score (max 3 points)
    const complexity = Math.min(3, Math.floor(promptLength / 50));
    score += complexity;

    // Quality Score (max 2 points)
    if (success) {
      score += 2;
      if (resultLength > 100) score += 1;
    }

    return score;
  }

  /**
   * Update worker score
   */
  updateWorkerScore(workerId, points, metrics) {
    if (!this.scores.has(workerId)) {
      this.scores.set(workerId, {
        totalScore: 0,
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        totalResponseTime: 0,
        achievements: [],
        level: 'Bronze',
        joinedAt: Date.now()
      });
    }

    const workerData = this.scores.get(workerId);

    // Update scores
    workerData.totalScore += points;
    workerData.requestCount++;

    if (metrics.success) {
      workerData.successCount++;
    } else {
      workerData.failureCount++;
    }

    workerData.totalResponseTime += metrics.processingTime;
    workerData.averageResponseTime = Math.round(
      workerData.totalResponseTime / workerData.requestCount
    );

    workerData.successRate = workerData.successCount / workerData.requestCount;

    // Check for achievements
    this.checkAchievements(workerId, workerData, metrics);

    // Update level
    workerData.level = this.calculateLevel(workerData.totalScore);

    // Update leaderboard
    this.updateLeaderboard();

    return {
      requestScore: points,
      totalScore: workerData.totalScore,
      level: workerData.level,
      rank: this.getWorkerRank(workerId)
    };
  }

  /**
   * Check and award achievements
   */
  checkAchievements(workerId, workerData, metrics) {
    const achievements = workerData.achievements || [];

    // Speed Demon - Average response time < 500ms (after 10+ requests)
    if (workerData.requestCount >= 10 &&
        workerData.averageResponseTime < 500 &&
        !achievements.includes('speed-demon')) {
      achievements.push('speed-demon');
      workerData.totalScore += 100;
      console.log(`🏆 Achievement Unlocked: Speed Demon!`);
    }

    // Centurion - Complete 100 requests
    if (workerData.requestCount >= 100 && !achievements.includes('centurion')) {
      achievements.push('centurion');
      workerData.totalScore += 200;
      console.log(`🏆 Achievement Unlocked: Centurion!`);
    }

    // Perfectionist - 100% success rate (min 20 requests)
    if (workerData.requestCount >= 20 &&
        workerData.successRate === 1 &&
        !achievements.includes('perfectionist')) {
      achievements.push('perfectionist');
      workerData.totalScore += 150;
      console.log(`🏆 Achievement Unlocked: Perfectionist!`);
    }

    // Marathoner - 24 hours uptime
    const uptimeHours = (Date.now() - workerData.joinedAt) / (1000 * 60 * 60);
    if (uptimeHours >= 24 && !achievements.includes('marathoner')) {
      achievements.push('marathoner');
      workerData.totalScore += 300;
      console.log(`🏆 Achievement Unlocked: Marathoner!`);
    }

    workerData.achievements = achievements;
  }

  /**
   * Calculate worker level based on score
   */
  calculateLevel(score) {
    if (score >= 10000) return 'Master';
    if (score >= 5000) return 'Diamond';
    if (score >= 1000) return 'Platinum';
    if (score >= 500) return 'Gold';
    if (score >= 100) return 'Silver';
    return 'Bronze';
  }

  /**
   * Update the leaderboard
   */
  updateLeaderboard() {
    this.leaderboard = Array.from(this.scores.entries())
      .map(([workerId, data]) => ({
        workerId,
        ...data
      }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((worker, index) => ({
        ...worker,
        rank: index + 1
      }));
  }

  /**
   * Get worker rank
   */
  getWorkerRank(workerId) {
    const worker = this.leaderboard.find(w => w.workerId === workerId);
    return worker ? worker.rank : null;
  }

  /**
   * Get top workers
   */
  getTopWorkers(limit = 10) {
    return this.leaderboard.slice(0, limit);
  }

  /**
   * Get worker stats
   */
  getWorkerStats(workerId) {
    const worker = this.scores.get(workerId);
    if (!worker) return null;

    return {
      ...worker,
      rank: this.getWorkerRank(workerId)
    };
  }

  /**
   * Add uptime score
   */
  addUptimeScore(workerId, hours) {
    const points = hours * 10;
    if (this.scores.has(workerId)) {
      const workerData = this.scores.get(workerId);
      workerData.totalScore += points;
      workerData.uptimeHours = (workerData.uptimeHours || 0) + hours;
      this.updateLeaderboard();
    }
  }

  /**
   * Get formatted leaderboard display
   */
  getLeaderboardDisplay(limit = 5) {
    const top = this.getTopWorkers(limit);

    let display = '\n🏆 QMesh Leaderboard\n';
    display += '==================\n\n';

    top.forEach((worker, index) => {
      const medal = index === 0 ? '🥇' :
                    index === 1 ? '🥈' :
                    index === 2 ? '🥉' : '  ';

      display += `${medal} #${worker.rank}. Worker ${worker.workerId.substring(0, 8)}...\n`;
      display += `      Score: ${worker.totalScore} | Level: ${worker.level}\n`;
      display += `      Requests: ${worker.requestCount} | Success: ${(worker.successRate * 100).toFixed(1)}%\n`;

      if (worker.achievements && worker.achievements.length > 0) {
        display += `      🏅 ${worker.achievements.join(', ')}\n`;
      }
      display += '\n';
    });

    return display;
  }

  /**
   * Export scores for backup
   */
  exportScores() {
    return {
      scores: Array.from(this.scores.entries()),
      leaderboard: this.leaderboard,
      timestamp: Date.now()
    };
  }

  /**
   * Import scores from backup
   */
  importScores(data) {
    if (data.scores) {
      data.scores.forEach(([workerId, scoreData]) => {
        this.scores.set(workerId, scoreData);
      });
      this.updateLeaderboard();
    }
  }

  /**
   * Reset all scores (use with caution!)
   */
  resetAllScores() {
    this.scores.clear();
    this.leaderboard = [];
    console.log('⚠️ All scores have been reset!');
  }
}

export default ScoreManager;