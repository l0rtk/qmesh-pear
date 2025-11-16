#!/usr/bin/env node

/**
 * Credit-Based Priority Demo
 * Demonstrates how contribution scores grant priority access
 */

import QMeshClient from '../qmesh-client-node.js';
import { existsSync } from 'fs';

async function main() {
  console.log('💳 QMesh Credit-Based Priority System Demo');
  console.log('==========================================\n');

  const client = new QMeshClient({
    timeout: 60000
  });

  try {
    // Check if user has a worker ID (contributor)
    const hasWorkerIdentity = existsSync('./worker-id.txt');

    if (hasWorkerIdentity) {
      console.log('✅ Worker identity found - you are a contributor!');
    } else {
      console.log('⚠️ No worker identity found - running as unverified client');
      console.log('   💡 Tip: Run as worker first to earn contribution credits!\n');
    }

    // Connect to network
    console.log('📡 Connecting to QMesh network...');
    await client.connect();
    console.log(`✅ Connected with ID: ${client.customerId.substring(0, 8)}...\n`);

    // Wait for score data to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Display user's contribution status
    const myStats = client.getMyStats();
    console.log('👤 Your Contribution Status:');
    console.log(`   Client ID: ${myStats.clientId.substring(0, 8)}...`);
    console.log(`   Contribution Score: ${myStats.contributionScore} points`);
    console.log(`   Tier: ${myStats.tier}`);

    // Explain the tier system
    console.log('\n📊 Priority Tiers:');
    console.log('   👑 Master (10000+)   - Instant processing');
    console.log('   💎 Diamond (4000+)   - Highest priority');
    console.log('   🏆 Platinum (1500+)  - High priority');
    console.log('   🥇 Gold (500+)       - Medium priority');
    console.log('   🥈 Silver (100+)     - Normal priority');
    console.log('   🥉 Bronze (1-99)     - Low priority');
    console.log('   ❓ Unverified (0)    - Lowest priority\n');

    // Show how priority affects queue position
    console.log('🎯 How Priority Works:');
    console.log('   • Higher contributors get processed first');
    console.log('   • Same tier? First-come-first-served');
    console.log('   • Contribute more = Better service!\n');

    // Test with multiple requests
    console.log('📤 Sending test requests to see priority in action...\n');

    const testPrompts = [
      'What is artificial intelligence?',
      'Explain blockchain in simple terms',
      'How does quantum computing work?'
    ];

    for (let i = 0; i < testPrompts.length; i++) {
      const prompt = testPrompts[i];
      console.log(`\n📨 Request ${i + 1}: "${prompt.substring(0, 40)}..."`);
      console.log(`   Your priority score: ${myStats.contributionScore}`);

      const startTime = Date.now();

      try {
        // Send request with our contribution score
        const result = await client.sendPrompt(prompt);
        const responseTime = Date.now() - startTime;

        console.log(`   ✅ Response received in ${responseTime}ms`);

        // Show position benefit
        if (myStats.contributionScore >= 1500) {
          console.log(`   ⚡ Priority processing - ${myStats.tier} tier benefit!`);
        } else if (myStats.contributionScore >= 100) {
          console.log(`   🚀 Normal priority - ${myStats.tier} tier`);
        } else {
          console.log(`   ⏳ Low priority - Earn more credits by contributing!`);
        }

        console.log(`   📝 Answer: ${result.substring(0, 60)}...`);
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Show network status
    console.log('\n📊 Network Status:');
    const leaderboard = client.getLeaderboard(5);
    console.log('\n🏆 Top Contributors (They get priority!):');
    leaderboard.forEach((worker, index) => {
      const medal = index === 0 ? '🥇' :
                    index === 1 ? '🥈' :
                    index === 2 ? '🥉' : '  ';
      const isMe = worker.workerId === client.customerId;
      const marker = isMe ? ' ← You!' : '';
      console.log(`${medal} #${worker.rank}. ${worker.workerId.substring(0, 8)}... - ${worker.totalScore || 0} pts (${client.getScoreTier(worker.totalScore)} tier)${marker}`);
    });

    // Show how to improve priority
    if (myStats.contributionScore < 100) {
      console.log('\n💡 How to Get Better Priority:');
      console.log('   1. Run as worker: node worker-scored.js');
      console.log('   2. Process requests for others');
      console.log('   3. Earn contribution points');
      console.log('   4. Get priority when YOU need inference!');
      console.log('\n   It\'s fair: Help others → Get helped faster! 🤝');
    } else {
      console.log(`\n✨ You're a ${myStats.tier} contributor!`);
      console.log(`   Current benefits: ${
        myStats.contributionScore >= 10000 ? 'Instant processing - skip all queues!' :
        myStats.contributionScore >= 4000 ? 'Highest priority processing' :
        myStats.contributionScore >= 1500 ? 'High priority processing' :
        myStats.contributionScore >= 500 ? 'Medium priority processing' :
        myStats.contributionScore >= 100 ? 'Normal priority processing' :
        'Low priority - keep contributing!'
      }`);
    }

    // Final stats
    const finalStats = client.getStats();
    console.log('\n📈 Session Summary:');
    console.log(`   Requests sent: ${finalStats.requestsProcessed}`);
    console.log(`   Average response time: ${finalStats.avgResponseTime}ms`);
    console.log(`   Failed requests: ${finalStats.failedRequests}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n👋 Disconnecting from network...');
    await client.disconnect();
    console.log('✅ Disconnected');
  }
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Run the demo
console.log('🎯 This demo shows how your contribution score affects request priority.\n');
main().catch(console.error);