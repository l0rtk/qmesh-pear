#!/usr/bin/env pear
import 'bare-node-runtime/global'
import os from '#os'

console.log('resourceUsage():')
console.log(JSON.stringify(os.resourceUsage(), null, 2))
