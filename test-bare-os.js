#!/usr/bin/env pear
import 'bare-node-runtime/global'
import os from '#os'

console.log('bare-os available methods:')
console.log(Object.getOwnPropertyNames(os).sort())
console.log('\nTesting methods:')
console.log('platform():', os.platform())
console.log('arch():', os.arch())
console.log('uptime():', os.uptime())
