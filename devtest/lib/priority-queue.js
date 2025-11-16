/**
 * Priority Queue for Credit-Based Request Processing
 * Higher scores get higher priority
 */

export class PriorityQueue {
  constructor() {
    this.items = [];
  }

  /**
   * Add request with priority based on sender's score
   * @param {Object} request - The request object
   * @param {number} priority - Sender's score (higher = higher priority)
   */
  enqueue(request, priority = 0) {
    const queueItem = {
      request,
      priority,
      timestamp: Date.now() // For FIFO within same priority
    };

    // Find insertion position (higher priority first)
    let added = false;
    for (let i = 0; i < this.items.length; i++) {
      if (priority > this.items[i].priority) {
        this.items.splice(i, 0, queueItem);
        added = true;
        break;
      } else if (priority === this.items[i].priority) {
        // Same priority - use FIFO (older first)
        if (queueItem.timestamp < this.items[i].timestamp) {
          this.items.splice(i, 0, queueItem);
          added = true;
          break;
        }
      }
    }

    // Add to end if lowest priority
    if (!added) {
      this.items.push(queueItem);
    }

    return this.items.length;
  }

  /**
   * Remove and return highest priority request
   */
  dequeue() {
    if (this.isEmpty()) {
      return null;
    }
    return this.items.shift().request;
  }

  /**
   * Peek at highest priority request without removing
   */
  peek() {
    if (this.isEmpty()) {
      return null;
    }
    return this.items[0].request;
  }

  /**
   * Get queue length
   */
  length() {
    return this.items.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Get position of a request in queue
   */
  getPosition(requestId) {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].request.message.requestId === requestId) {
        return i + 1;
      }
    }
    return -1;
  }

  /**
   * Get queue status with priorities
   */
  getStatus() {
    const tiers = {
      master: [], // 10000+
      diamond: [], // 4000-9999
      platinum: [], // 1500-3999
      gold: [], // 500-1499
      silver: [], // 100-499
      bronze: [], // 1-99
      unverified: [] // 0 or unknown
    };

    this.items.forEach(item => {
      const priority = item.priority;
      const tier = this.getTier(priority);
      tiers[tier].push({
        requestId: item.request.message.requestId.substring(0, 8),
        priority,
        waitTime: Date.now() - item.timestamp
      });
    });

    return {
      total: this.items.length,
      tiers,
      topPriority: this.items[0]?.priority || 0,
      avgPriority: this.items.length > 0
        ? Math.round(this.items.reduce((sum, item) => sum + item.priority, 0) / this.items.length)
        : 0
    };
  }

  /**
   * Determine tier based on score
   */
  getTier(score) {
    if (score >= 10000) return 'master';
    if (score >= 4000) return 'diamond';
    if (score >= 1500) return 'platinum';
    if (score >= 500) return 'gold';
    if (score >= 100) return 'silver';
    if (score >= 1) return 'bronze';
    return 'unverified';
  }

  /**
   * Display queue status
   */
  displayStatus() {
    const status = this.getStatus();

    console.log('\n📊 Priority Queue Status:');
    console.log(`   Total requests: ${status.total}`);

    if (status.total > 0) {
      console.log(`   Top priority: ${status.topPriority} (${this.getTier(status.topPriority)})`);
      console.log(`   Average priority: ${status.avgPriority}`);

      console.log('\n   Tier breakdown:');
      Object.entries(status.tiers).forEach(([tier, requests]) => {
        if (requests.length > 0) {
          const emoji = this.getTierEmoji(tier);
          console.log(`   ${emoji} ${tier.charAt(0).toUpperCase() + tier.slice(1)}: ${requests.length} requests`);
        }
      });
    }
  }

  /**
   * Get emoji for tier
   */
  getTierEmoji(tier) {
    const emojis = {
      master: '👑',
      diamond: '💎',
      platinum: '🏆',
      gold: '🥇',
      silver: '🥈',
      bronze: '🥉',
      unverified: '❓'
    };
    return emojis[tier] || '⚪';
  }

  /**
   * Clear the queue
   */
  clear() {
    this.items = [];
  }
}

export default PriorityQueue;