# QMesh - Pear Runtime Edition

Distributed peer-to-peer LLM inference network running on **Pear Runtime** (Bare JavaScript).

## About This Version

This is the **Pear Runtime migration** of QMesh, designed to leverage:
- 🍐 **Pear Runtime** - Bare JavaScript runtime for true P2P deployment
- 📦 **Zero-infrastructure** distribution via Hypercore
- 🌐 **Hyperswarm** for P2P worker discovery
- 🤖 **node-llama-cpp** for local LLM inference (testing compatibility)
- 📱 **Cross-platform** - Desktop, mobile (future)

## Project Status

**Week 1 Day 1:** Initial setup and compatibility testing

- [x] Create Pear project structure
- [ ] Copy source files from original qmesh/
- [ ] Install dependencies
- [ ] **Critical Test:** Can Bare runtime load node-llama-cpp?
- [ ] Port modules to use Bare imports
- [ ] Test inference in Pear environment

## Quick Start

### Development

```bash
# Run in development mode
pear run --dev .

# Or use npm script
npm run dev
```

### Testing Compatibility

```bash
# Test if node-llama-cpp works in Bare
pear run --dev . --test
```

### Distribution (Future)

```bash
# Stage changes
npm run stage

# Seed to P2P network
npm run seed

# Others can run via:
pear run pear://your-key-here
```

## Architecture

### Import Maps for Cross-Runtime Compatibility

The `package.json` includes import maps that automatically resolve to Bare or Node.js modules:

```javascript
import fs from '#fs'        // → bare-fs in Pear, node:fs in Node.js
import process from '#process'  // → bare-process in Pear, node:process in Node.js
```

### Directory Structure

```
qmesh-pear/
├── index.js           # Pear entry point
├── package.json       # Pear config + import maps
├── src/              # Source code (to be copied from qmesh/)
│   ├── worker/
│   ├── client/
│   └── lib/
└── models/           # GGUF models (local storage)
```

## Migration Strategy

### Approach 1: Bare + Node Compatibility (Current)
- Use `bare-node` compatibility modules
- Leverage N-API support in Bare
- Minimal code changes (import statements)

### Fallback: Sidecar Process
- If node-llama-cpp doesn't load in Bare
- Run llama.cpp server as subprocess
- Communicate via HTTP/IPC

## Development Timeline

- **Week 1:** Setup + compatibility testing
- **Week 2:** Port core modules
- **Week 3:** P2P networking
- **Week 4:** Distribution testing

## Resources

- [Pear Documentation](https://docs.pears.com)
- [Bare Runtime](https://bare.pears.com)
- [Hyperswarm](https://github.com/holepunchto/hyperswarm)
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp)

## License

MIT
