#!/usr/bin/env node

/**
 * Load-Aware Routing Example
 * Demonstrates intelligent work distribution based on worker health
 */

import QMeshClient from '../qmesh-client-node.js';

async function main() {
  const client = new QMeshClient({
    timeout: 60000,
    silent: false
  });

  console.log('🚀 QMesh Load-Aware Routing Example');
  console.log('=====================================\n');

  try {
    // Connect to network with health monitoring
    console.log('📡 Connecting to QMesh network with health monitoring...');
    await client.connect();
    console.log(`✅ Connected as customer: ${client.customerId.substring(0, 8)}...\n`);

    // Wait a bit for health data to populate
    console.log('⏳ Gathering worker health data...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Show network health
    const networkHealth = client.getNetworkHealth();
    console.log('\n📊 Network Health Status:');
    console.log(`   Total Workers: ${networkHealth.total}`);
    console.log(`   🟢 Idle/Light: ${networkHealth.idle + networkHealth.light}`);
    console.log(`   🟡 Moderate: ${networkHealth.moderate}`);
    console.log(`   🟠 Busy: ${networkHealth.busy}`);
    console.log(`   🔴 Overloaded: ${networkHealth.overloaded}`);
    console.log(`   ✅ Available: ${networkHealth.available}`);
    console.log(`   ❌ Unavailable: ${networkHealth.unavailable}\n`);

    // Show available workers
    const availableWorkers = client.getAvailableWorkers();
    console.log('🎯 Available Workers for Smart Routing:');
    if (availableWorkers.length === 0) {
      console.log('   No available workers (all busy or overloaded)');
    } else {
      availableWorkers.forEach(worker => {
        const healthEmoji = worker.system?.status === 'idle' ? '🟢' :
                            worker.system?.status === 'light' ? '🟢' :
                            worker.system?.status === 'moderate' ? '🟡' : '🟠';
        console.log(`   ${healthEmoji} ${worker.workerId.substring(0, 8)}... - Queue: ${worker.system?.queueLength}/${worker.system?.maxQueue} | CPU: ${worker.system?.cpuUsage}% | Mem: ${worker.system?.memoryUsage}%`);
      });
    }

    // Show leaderboard with health
    console.log('\n🏆 Worker Leaderboard with Health:');
    const leaderboard = client.getLeaderboard(5);
    leaderboard.forEach((worker, index) => {
      const medal = index === 0 ? '🥇' :
                    index === 1 ? '🥈' :
                    index === 2 ? '🥉' : '  ';
      const healthEmoji = worker.system?.status === 'idle' ? '🟢' :
                         worker.system?.status === 'light' ? '🟢' :
                         worker.system?.status === 'moderate' ? '🟡' :
                         worker.system?.status === 'busy' ? '🟠' :
                         worker.system?.status === 'overloaded' ? '🔴' : '⚪';
      console.log(`${medal} #${worker.rank}. ${worker.workerId.substring(0, 8)}... ${healthEmoji} - Score: ${worker.totalScore || 0} | Status: ${worker.system?.status || 'unknown'}`);
    });

    // Test smart routing
    console.log('\n🧪 Testing Smart Routing:');
    console.log('Sending requests with smart routing enabled (default)...\n');

    // Send test requests
    const testPrompts = [
      'What is the capital of France?',
      'Explain quantum computing in simple terms',
      'Write a haiku about coding',
      'What is 2+2?',
      'Tell me about machine learning'
    ];

    // Monitor which workers handle requests
    const workerUsage = new Map();

    client.on('request-sent', ({ workerId }) => {
      const count = workerUsage.get(workerId) || 0;
      workerUsage.set(workerId, count + 1);
    });

    console.log('📤 Sending 5 test prompts with smart routing...\n');

    for (let i = 0; i < testPrompts.length; i++) {
      const prompt = testPrompts[i];
      console.log(`📨 Request ${i + 1}: "${prompt.substring(0, 30)}..."`);

      try {
        const startTime = Date.now();
        const result = await client.sendPrompt(prompt);
        const responseTime = Date.now() - startTime;

        console.log(`   ✅ Response received in ${responseTime}ms`);
        console.log(`   📝 Answer: ${result.substring(0, 50)}...\n`);
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Show distribution
    console.log('📊 Request Distribution:');
    for (const [workerId, count] of workerUsage) {
      console.log(`   Worker ${workerId}: ${count} requests`);
    }

    // Test with smart routing disabled
    console.log('\n🔀 Testing Random Routing (smart routing disabled):');

    // Clear usage stats
    workerUsage.clear();

    console.log('📤 Sending 5 test prompts with random routing...\n');

    for (let i = 0; i < testPrompts.length; i++) {
      const prompt = testPrompts[i];
      console.log(`📨 Request ${i + 1}: "${prompt.substring(0, 30)}..."`);

      try {
        const startTime = Date.now();
        const result = await client.sendPrompt(prompt, { smartRouting: false });
        const responseTime = Date.now() - startTime;

        console.log(`   ✅ Response received in ${responseTime}ms`);
        console.log(`   📝 Answer: ${result.substring(0, 50)}...\n`);
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Show distribution for random routing
    console.log('📊 Request Distribution (Random):');
    for (const [workerId, count] of workerUsage) {
      console.log(`   Worker ${workerId}: ${count} requests`);
    }

    // Show final stats
    const stats = client.getStats();
    console.log('\n📈 Session Statistics:');
    console.log(`   Total Requests: ${stats.requestsProcessed}`);
    console.log(`   Failed Requests: ${stats.failedRequests}`);
    console.log(`   Average Response Time: ${stats.avgResponseTime}ms`);
    console.log(`   Active Workers: ${stats.activeWorkers}`);

    // Monitor real-time health updates
    console.log('\n💓 Monitoring worker health updates (10 seconds)...\n');

    client.on('worker-health-update', (data) => {
      const healthEmoji = data.system?.status === 'idle' ? '🟢' :
                         data.system?.status === 'light' ? '🟢' :
                         data.system?.status === 'moderate' ? '🟡' :
                         data.system?.status === 'busy' ? '🟠' :
                         data.system?.status === 'overloaded' ? '🔴' : '⚪';
      console.log(`${healthEmoji} Worker ${data.workerId.substring(0, 8)} - Status: ${data.system?.status} | Queue: ${data.system?.queueLength}/${data.system?.maxQueue} | CPU: ${data.system?.cpuUsage}% | Mem: ${data.system?.memoryUsage}%`);
    });

    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n👋 Disconnecting from network...');
    await client.disconnect();
    console.log('✅ Disconnected');
    process.exit(0);
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

// Run the example
main().catch(console.error);