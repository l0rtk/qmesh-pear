#!/usr/bin/env pear

/**
 * Test fetch in Bare Runtime
 */

import 'bare-node-runtime/global'

console.log('Testing fetch in Bare Runtime...\n')

// Test if fetch exists
console.log('1. fetch exists:', typeof fetch !== 'undefined')
console.log('2. fetch type:', typeof fetch)

// Try to fetch from health endpoint
console.log('\n3. Attempting to fetch http://127.0.0.1:8080/health...')

try {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  const response = await fetch('http://127.0.0.1:8080/health', {
    signal: controller.signal
  })

  clearTimeout(timeout)

  console.log('✅ Fetch succeeded!')
  console.log('   Status:', response.status)
  console.log('   StatusText:', response.statusText)
  console.log('   OK:', response.ok)
  console.log('   Headers:', Object.fromEntries(response.headers.entries()))

  const text = await response.text()
  console.log('   Body:', text)
} catch (error) {
  clearTimeout(timeout)
  console.log('❌ Fetch failed:', error.message)
  console.log('   Error type:', error.constructor.name)
  console.log('   Stack:', error.stack)
}
