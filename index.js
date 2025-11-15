#!/usr/bin/env pear

/**
 * QMesh Worker - Pear Runtime Entry Point
 *
 * Distributed P2P LLM Inference Network
 * Running on Bare JavaScript Runtime via Pear
 */

// Import Bare-compatible process module via import map
import process from '#process'

console.log('🍐 QMesh Worker starting on Pear Runtime...')
console.log('Runtime:', typeof Pear !== 'undefined' ? 'Bare (Pear)' : 'Node.js')

// Pear-specific teardown hook
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('👋 QMesh Worker shutting down...')
  })
}

// Test basic functionality
async function main() {
  try {
    console.log('\n📋 System Information:')
    console.log('  Platform:', process.platform)
    console.log('  Architecture:', process.arch)
    console.log('  Node/Bare version:', process.version)

    if (typeof Pear !== 'undefined') {
      console.log('  Pear config:', Pear.config)
    }

    console.log('\n✅ Basic setup complete!')
    console.log('\n📦 Next steps:')
    console.log('  1. Copy source files from qmesh/')
    console.log('  2. Install dependencies')
    console.log('  3. Test node-llama-cpp compatibility')
    console.log('  4. Port modules to use Bare imports')

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Check if running as main module
if (import.meta.url === `file://${process.argv[1]}` || typeof Pear !== 'undefined') {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { main }
