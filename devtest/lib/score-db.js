/**
 * Score Database using Hyperbee
 * Persistent, distributed score storage for QMesh
 */

import Hyperbee from 'hyperbee';
import Hypercore from 'hypercore';
import { randomBytes } from 'bare-crypto';

export class ScoreDatabase {
  constructor(options = {}) {
    this.storagePath = options.storagePath || './qmesh-scores';
    this.db = null;
    this.core = null;
    this.isReady = false;
  }

  /**
   * Initialize the database
   */
  async init() {
    // Create hypercore for the database
    this.core = new Hypercore(this.storagePath, {
      valueEncoding: 'json'
    });

    await this.core.ready();

    // Create Hyperbee database
    this.db = new Hyperbee(this.core, {
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    });

    await this.db.ready();
    this.isReady = true;

    console.log('📊 Score database initialized');
    console.log(`   Key: ${this.core.key.toString('hex').substring(0, 16)}...`);

    return this.core.key;
  }

  /**
   * Save worker score
   */
  async saveWorkerScore(workerId, scoreData) {
    if (!this.isReady) throw new Error('Database not initialized');

    const key = `workers/${workerId}`;
    const existing = await this.db.get(key);

    const data = {
      ...scoreData,
      lastUpdated: Date.now(),
      version: (existing?.value?.version || 0) + 1
    };

    await this.db.put(key, data);
    return data;
  }

  /**
   * Get worker score
   */
  async getWorkerScore(workerId) {
    if (!this.isReady) throw new Error('Database not initialized');

    const key = `workers/${workerId}`;
    const entry = await this.db.get(key);

    return entry?.value || null;
  }

  /**
   * Update leaderboard
   */
  async updateLeaderboard(leaderboard) {
    if (!this.isReady) throw new Error('Database not initialized');

    const batch = this.db.batch();

    // Clear old leaderboard
    for await (const entry of this.db.createReadStream({
      gte: 'leaderboard/',
      lt: 'leaderboard/~'
    })) {
      batch.del(entry.key);
    }

    // Add new leaderboard
    leaderboard.forEach((entry, index) => {
      const key = `leaderboard/${String(index).padStart(4, '0')}`;
      batch.put(key, entry);
    });

    await batch.flush();
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit = 10) {
    if (!this.isReady) throw new Error('Database not initialized');

    const leaderboard = [];

    for await (const entry of this.db.createReadStream({
      gte: 'leaderboard/',
      lt: `leaderboard/${String(limit).padStart(4, '0')}`,
      limit
    })) {
      leaderboard.push(entry.value);
    }

    return leaderboard;
  }

  /**
   * Record request history
   */
  async recordRequest(requestId, requestData) {
    if (!this.isReady) throw new Error('Database not initialized');

    const key = `history/${requestId}`;
    await this.db.put(key, {
      ...requestData,
      timestamp: Date.now()
    });
  }

  /**
   * Get request history
   */
  async getRequestHistory(requestId) {
    if (!this.isReady) throw new Error('Database not initialized');

    const key = `history/${requestId}`;
    const entry = await this.db.get(key);

    return entry?.value || null;
  }

  /**
   * Get all worker scores
   */
  async getAllWorkerScores() {
    if (!this.isReady) throw new Error('Database not initialized');

    const scores = new Map();

    for await (const entry of this.db.createReadStream({
      gte: 'workers/',
      lt: 'workers/~'
    })) {
      const workerId = entry.key.split('/')[1];
      scores.set(workerId, entry.value);
    }

    return scores;
  }

  /**
   * Sync scores with another peer
   */
  async syncWithPeer(peerKey) {
    if (!this.isReady) throw new Error('Database not initialized');

    console.log(`🔄 Syncing scores with peer: ${peerKey.substring(0, 8)}...`);

    // This would implement Hypercore replication
    // For now, just log the intention
    console.log('   Score sync implementation pending...');
  }

  /**
   * Watch for score updates
   */
  async watchScores(callback) {
    if (!this.isReady) throw new Error('Database not initialized');

    const watcher = this.db.watch('workers/');

    watcher.on('update', async () => {
      const scores = await this.getAllWorkerScores();
      callback(scores);
    });

    return watcher;
  }

  /**
   * Get worker achievements
   */
  async getAchievements(workerId) {
    const score = await this.getWorkerScore(workerId);
    return score?.achievements || [];
  }

  /**
   * Add achievement
   */
  async addAchievement(workerId, achievement) {
    const score = await this.getWorkerScore(workerId);
    if (!score) return null;

    if (!score.achievements) {
      score.achievements = [];
    }

    if (!score.achievements.includes(achievement)) {
      score.achievements.push(achievement);
      await this.saveWorkerScore(workerId, score);
    }

    return score.achievements;
  }

  /**
   * Export database for backup
   */
  async exportDatabase() {
    if (!this.isReady) throw new Error('Database not initialized');

    const data = {
      workers: {},
      leaderboard: [],
      timestamp: Date.now()
    };

    // Export workers
    for await (const entry of this.db.createReadStream({
      gte: 'workers/',
      lt: 'workers/~'
    })) {
      const workerId = entry.key.split('/')[1];
      data.workers[workerId] = entry.value;
    }

    // Export leaderboard
    data.leaderboard = await this.getLeaderboard(100);

    return data;
  }

  /**
   * Import database from backup
   */
  async importDatabase(data) {
    if (!this.isReady) throw new Error('Database not initialized');

    const batch = this.db.batch();

    // Import workers
    for (const [workerId, scoreData] of Object.entries(data.workers)) {
      batch.put(`workers/${workerId}`, scoreData);
    }

    // Import leaderboard
    data.leaderboard.forEach((entry, index) => {
      batch.put(`leaderboard/${String(index).padStart(4, '0')}`, entry);
    });

    await batch.flush();
    console.log('✅ Database imported successfully');
  }

  /**
   * Clear all data (use with caution!)
   */
  async clearAll() {
    if (!this.isReady) throw new Error('Database not initialized');

    const batch = this.db.batch();

    for await (const entry of this.db.createReadStream()) {
      batch.del(entry.key);
    }

    await batch.flush();
    console.log('🗑️ Database cleared');
  }

  /**
   * Close the database
   */
  async close() {
    if (this.db) {
      await this.db.close();
    }
    if (this.core) {
      await this.core.close();
    }
    this.isReady = false;
  }
}

export default ScoreDatabase;