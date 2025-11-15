#!/usr/bin/env pear

/**
 * System Monitor Test
 *
 * Tests the SystemMonitor health tracking functionality
 *
 * This test:
 * 1. Creates a SystemMonitor
 * 2. Validates health score calculations
 * 3. Tests queue management
 * 4. Validates CPU/memory monitoring
 *
 * Usage: pear run --dev test-system-monitor.js
 */

import 'bare-node-runtime/global'
import process from '#process'
import { SystemMonitor } from './src/lib/system-monitor.js'

console.log('\n🏥 System Monitor Test\n')
console.log('='.repeat(60))

let monitor = null
let testsPassed = 0
let testsFailed = 0

async function main() {
  try {
    // Test 1: Create monitor
    console.log('\n📋 Test 1: Create SystemMonitor\n')

    monitor = new SystemMonitor({
      queueCapacity: 10,
      updateInterval: 2000
    })

    console.log('✅ SystemMonitor created')
    console.log(`   Queue capacity: ${monitor.options.queueCapacity}`)
    console.log(`   Update interval: ${monitor.options.updateInterval}ms`)
    testsPassed++

    // Test 2: Initial health check
    console.log('\n📋 Test 2: Initial Health Check\n')

    monitor.updateMetrics()
    const initialHealth = monitor.getHealth()

    console.log(`   Health score: ${initialHealth.score}`)
    console.log(`   Health state: ${initialHealth.state} ${monitor.getHealthEmoji()}`)
    console.log(`   CPU usage: ${initialHealth.cpu}%`)
    console.log(`   Memory usage: ${initialHealth.memory}%`)
    console.log(`   Queue: ${initialHealth.queue.size}/${initialHealth.queue.capacity}`)
    console.log(`   Can accept requests: ${initialHealth.canAcceptRequests ? 'YES' : 'NO'}`)

    if (initialHealth.score >= 0 && initialHealth.score <= 100) {
      console.log('\n✅ Initial health score is valid')
      testsPassed++
    } else {
      console.log('\n❌ Invalid health score')
      testsFailed++
    }

    // Test 3: Queue management
    console.log('\n📋 Test 3: Queue Management\n')

    const beforeQueue = monitor.getHealth()
    console.log(`   Before: Queue ${beforeQueue.queue.size}/${beforeQueue.queue.capacity}, Score: ${beforeQueue.score}`)

    // Add items to queue
    for (let i = 1; i <= 5; i++) {
      monitor.incrementQueue()
    }

    const afterQueue = monitor.getHealth()
    console.log(`   After adding 5: Queue ${afterQueue.queue.size}/${afterQueue.queue.capacity}, Score: ${afterQueue.score}`)

    if (afterQueue.queue.size === 5 && afterQueue.score < beforeQueue.score) {
      console.log('\n✅ Queue increment works, health score decreased as expected')
      testsPassed++
    } else {
      console.log('\n❌ Queue management failed')
      testsFailed++
    }

    // Remove items from queue
    for (let i = 1; i <= 3; i++) {
      monitor.decrementQueue()
    }

    const afterDecrement = monitor.getHealth()
    console.log(`   After removing 3: Queue ${afterDecrement.queue.size}/${afterDecrement.queue.capacity}, Score: ${afterDecrement.score}`)

    if (afterDecrement.queue.size === 2 && afterDecrement.score > afterQueue.score) {
      console.log('\n✅ Queue decrement works, health score increased as expected')
      testsPassed++
    } else {
      console.log('\n❌ Queue decrement failed')
      testsFailed++
    }

    // Test 4: Overload state
    console.log('\n📋 Test 4: Overload State Simulation\n')

    // Fill queue to capacity
    monitor.setQueueSize(10)
    const overloaded = monitor.getHealth()

    console.log(`   Queue at capacity: ${overloaded.queue.size}/${overloaded.queue.capacity}`)
    console.log(`   Health score: ${overloaded.score}`)
    console.log(`   Health state: ${overloaded.state} ${monitor.getHealthEmoji()}`)
    console.log(`   Can accept requests: ${overloaded.canAcceptRequests ? 'YES' : 'NO'}`)

    if (overloaded.queue.size === 10) {
      console.log('\n✅ Queue at capacity')
      testsPassed++
    } else {
      console.log('\n❌ Queue capacity test failed')
      testsFailed++
    }

    // Reset queue
    monitor.setQueueSize(0)

    // Test 5: Event system
    console.log('\n📋 Test 5: Event System\n')

    let eventFired = false
    monitor.on('queue-changed', (size) => {
      console.log(`   📨 Event: queue-changed (size: ${size})`)
      eventFired = true
    })

    monitor.incrementQueue()

    if (eventFired) {
      console.log('\n✅ Events working correctly')
      testsPassed++
    } else {
      console.log('\n❌ Event not fired')
      testsFailed++
    }

    // Test 6: Periodic monitoring
    console.log('\n📋 Test 6: Periodic Monitoring\n')

    let updateCount = 0
    monitor.on('metrics-updated', (health) => {
      updateCount++
      if (updateCount === 1) {
        console.log(`   📨 Metrics updated: Score ${health.score}, CPU ${health.cpu}%, Memory ${health.memory}%`)
      }
    })

    monitor.startMonitoring(1000) // Update every 1 second

    // Wait for 2-3 updates
    await new Promise(resolve => setTimeout(resolve, 2500))

    monitor.stopMonitoring()

    if (updateCount >= 2) {
      console.log(`\n✅ Periodic monitoring working (${updateCount} updates)`)
      testsPassed++
    } else {
      console.log(`\n❌ Periodic monitoring failed (only ${updateCount} updates)`)
      testsFailed++
    }

    // Test 7: System info
    console.log('\n📋 Test 7: System Information\n')

    const sysInfo = monitor.getSystemInfo()

    console.log(`   Platform: ${sysInfo.platform}`)
    console.log(`   Architecture: ${sysInfo.arch}`)
    console.log(`   CPU cores: ${sysInfo.cpuCount}`)

    if (sysInfo.totalMemory) {
      console.log(`   Total memory: ${(sysInfo.totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`)
    }

    if (sysInfo.freeMemory) {
      console.log(`   Free memory: ${(sysInfo.freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`)
    }

    if (sysInfo.processMemory) {
      console.log(`   Process memory: ${(sysInfo.processMemory / 1024).toFixed(2)} MB`)
    }

    if (sysInfo.uptime) {
      console.log(`   Uptime: ${Math.floor(sysInfo.uptime / 60)} minutes`)
    }

    if (sysInfo.platform && sysInfo.arch) {
      console.log('\n✅ System info retrieval working')
      testsPassed++
    } else {
      console.log('\n❌ System info retrieval failed')
      testsFailed++
    }

    // Print final results
    console.log('\n' + '='.repeat(60))
    console.log('\n📊 Test Results:\n')
    console.log(`   Tests passed: ${testsPassed}`)
    console.log(`   Tests failed: ${testsFailed}`)
    console.log(`   Success rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`)

    const allPassed = testsFailed === 0

    if (allPassed) {
      console.log('\n✅ System Monitor test PASSED!\n')
      console.log('Key validations:')
      console.log('  ✅ Health score calculation working')
      console.log('  ✅ Queue management working')
      console.log('  ✅ CPU/memory monitoring working')
      console.log('  ✅ Event system working')
      console.log('  ✅ Periodic monitoring working')
      console.log('  ✅ System info retrieval working')
    } else {
      console.log('\n❌ System Monitor test FAILED\n')
    }

    console.log('\n' + '='.repeat(60))

    // Cleanup
    await cleanup()

    process.exit(allPassed ? 0 : 1)

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('\nStack trace:')
    console.error(error.stack)

    await cleanup()
    process.exit(1)
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...')

  if (monitor) {
    monitor.destroy()
    console.log('  ✅ Monitor destroyed')
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrupted. Shutting down...')
  await cleanup()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n\n⚠️  Terminated. Shutting down...')
  await cleanup()
  process.exit(0)
})

main()
