#!/usr/bin/env pear

/**
 * CRITICAL TEST: Can Bare Runtime load node-llama-cpp?
 *
 * This test will determine our migration path:
 * - SUCCESS → Continue with Approach 1 (Bare + compatibility)
 * - FAILURE → Pivot to Approach 3 (sidecar process)
 */

// Enable Node.js compatibility for Bare Runtime
import 'bare-node-runtime/global'
import process from '#process'

console.log('\n🧪 Testing node-llama-cpp compatibility with Bare Runtime\n')
console.log('Runtime:', typeof Pear !== 'undefined' ? 'Bare (Pear)' : 'Node.js')
console.log('Version:', process.version)
console.log('Platform:', process.platform, process.arch)
console.log('\n' + '='.repeat(60) + '\n')

// Pear teardown
if (typeof Pear !== 'undefined') {
  Pear.teardown(() => {
    console.log('\n👋 Test complete - shutting down...')
  })
}

async function testLlamaCppLoading() {
  console.log('📦 Step 1: Attempting to import node-llama-cpp...')

  try {
    // Try to import node-llama-cpp
    const { getLlama } = await import('node-llama-cpp')
    console.log('✅ SUCCESS: node-llama-cpp module loaded!')
    console.log('   getLlama function:', typeof getLlama)

    console.log('\n📦 Step 2: Attempting to get llama instance...')
    const llama = await getLlama()
    console.log('✅ SUCCESS: llama instance created!')
    console.log('   llama type:', typeof llama)

    console.log('\n📦 Step 3: Checking GPU support...')
    console.log('   Build info:', llama)

    console.log('\n🎉 BREAKTHROUGH: node-llama-cpp works in Bare Runtime!')
    console.log('\n📋 Next steps:')
    console.log('   ✅ Approach 1 (Bare + compatibility) is viable')
    console.log('   → Continue porting modules to use Bare imports')
    console.log('   → Test model loading')
    console.log('   → Test inference')

    return true

  } catch (error) {
    console.error('\n❌ FAILED: node-llama-cpp cannot load in Bare Runtime')
    console.error('\nError details:')
    console.error('  Name:', error.name)
    console.error('  Message:', error.message)

    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }

    console.log('\n📋 Fallback options:')
    console.log('   ❌ Approach 1 blocked')
    console.log('   → Pivot to Approach 3 (llama.cpp sidecar process)')
    console.log('   → Or: Create bare-llama-cpp bindings (4-6 weeks)')

    return false
  }
}

// Run the test
testLlamaCppLoading()
  .then(success => {
    if (success) {
      console.log('\n✅ Compatibility test PASSED')
      process.exit(0)
    } else {
      console.log('\n⚠️  Compatibility test FAILED - migration strategy needed')
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('\n💥 Unexpected error:', error)
    process.exit(2)
  })
