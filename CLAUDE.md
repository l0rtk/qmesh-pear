# CLAUDE.md

This file provides guidance to Claude Code when working with the QMesh Pear Runtime migration.

## Project Overview

**QMesh Pear** is a Pear Runtime port of QMesh - a distributed peer-to-peer LLM inference network. This version uses a **sidecar architecture** with llama-server subprocess instead of direct node-llama-cpp bindings.

**Current Status:** Phase 1 Complete (Local Sidecar) - Phase 2 Starting (P2P Networking)

## Core Architecture: Sidecar Pattern

### Why Sidecar?

We chose the sidecar architecture after discovering that `node-llama-cpp` cannot run in Bare Runtime due to module resolution incompatibilities.

**The Sidecar Approach:**
```
┌─────────────────────────────────┐
│  Pear App (Bare Runtime)        │
│  - P2P Networking (Hyperswarm)  │
│  - Worker Discovery             │
│  - Request Routing              │
│  - Process Management           │
└────────┬────────────────────────┘
         │ HTTP (localhost:8080)
         ↓
┌────────┴────────────────────────┐
│  llama-server (subprocess)      │
│  - Model Loading                │
│  - GPU/CPU Inference            │
│  - Streaming Responses          │
└─────────────────────────────────┘
```

**Benefits:**
- ✅ Clean separation of concerns
- ✅ Official llama.cpp tooling (battle-tested)
- ✅ Lower memory footprint than Node.js approach
- ✅ Easy to update (swap binary)
- ✅ HTTP overhead negligible (<1ms, ~2% inference overhead)

## Key Components

### 1. LlamaProcessManager ([src/lib/llama-process-manager.js](src/lib/llama-process-manager.js))

Manages llama-server subprocess lifecycle.

**Key methods:**
```javascript
const manager = new LlamaProcessManager({
  modelPath: './models/model.gguf',
  binaryPath: '/path/to/llama-server',
  port: 8080,
  gpuLayers: 33
})

await manager.start()           // Spawn and wait for ready
const healthy = await manager.isHealthy()  // Check health
await manager.stop()            // Graceful shutdown
```

**Features:**
- Auto-restart on crash (up to 3 attempts)
- Health polling via `/health` endpoint
- Graceful shutdown (SIGTERM → SIGKILL fallback)
- Process monitoring

### 2. LlamaHttpClient ([src/lib/llama-http-client.js](src/lib/llama-http-client.js))

HTTP communication with llama-server.

**Key methods:**
```javascript
const client = new LlamaHttpClient({ port: 8080 })

// Non-streaming
const result = await client.generate('prompt', { maxTokens: 50 })

// Streaming
await client.generateStream('prompt', (token) => {
  console.log(token)
}, { maxTokens: 50 })

// Health check
const healthy = await client.healthCheck()
```

**Important:** Uses Bare-compatible `AbortController` for timeouts (not `AbortSignal.timeout()`).

### 3. InferenceEngineSidecar ([src/worker/inference-engine-sidecar.js](src/worker/inference-engine-sidecar.js))

Drop-in replacement for original `InferenceEngine` that uses HTTP client internally.

**API-compatible methods:**
- `generate(prompt, options)` - Non-streaming inference
- `generateStream(prompt, onToken, options)` - Streaming inference
- `chatStream(userMessage, onToken, options)` - Chat with history
- `dispose()` - Cleanup and shutdown

**Usage:**
```javascript
const engine = new InferenceEngineSidecar({
  modelPath: './models/model.gguf',
  binaryPath: '/path/to/llama-server',
  port: 8080,
  gpuLayers: 0  // 0 for CPU, 33 for GPU
})

await engine.start()
const result = await engine.generate('Hello!', { maxTokens: 50 })
await engine.dispose()
```

## Bare Runtime Compatibility

### Critical Differences from Node.js

**1. AbortSignal.timeout() doesn't exist**

❌ **Don't do this:**
```javascript
const response = await fetch(url, {
  signal: AbortSignal.timeout(2000)  // Error: not a function
})
```

✅ **Do this instead:**
```javascript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 2000)
const response = await fetch(url, { signal: controller.signal })
clearTimeout(timeout)
```

**2. Module Resolution**

Bare Runtime doesn't auto-resolve Node.js modules. Use import maps in `package.json`:

```json
{
  "imports": {
    "#fs": {
      "bare": "bare-fs",
      "default": "node:fs"
    },
    "#process": {
      "bare": "bare-process",
      "default": "node:process"
    }
  }
}
```

Then import like:
```javascript
import process from '#process'  // Works in both Bare and Node.js
import fs from '#fs'
```

**3. No automatic Bare module mapping**

Pre-compiled packages (like `node-llama-cpp`) with hardcoded `import 'os'` won't work in Bare Runtime. This is why we use the sidecar pattern.

## Development Commands

```bash
# Run examples
pear run --dev examples/inference/run-worker.js
pear run --dev examples/inference/simple-test.js

# Run tests
pear run --dev test-sidecar.js
pear run --dev test-inference-engine-sidecar.js

# Build llama-server (CPU-only)
cd /home/luka/llama.cpp
cmake -B build -DLLAMA_CURL=OFF
cmake --build build --target llama-server -j4

# Build llama-server (with GPU - requires CUDA toolkit)
sudo apt install nvidia-cuda-toolkit
cmake -B build -DLLAMA_CURL=OFF -DGGML_CUDA=ON
cmake --build build --target llama-server -j4
```

## Project Structure

```
qmesh-pear/
├── index.js                          # Pear entry point
├── package.json                      # Dependencies + import maps
├── CLAUDE.md                         # This file
├── README.md                         # Project overview
├── ARCHITECTURE.md                   # Sidecar design docs
├── STATUS.md                         # Progress tracker
├── DAY1_SUMMARY.md                   # Day 1 achievements
│
├── src/
│   ├── worker/
│   │   └── inference-engine-sidecar.js  # ✅ API-compatible adapter
│   ├── client/                          # (to be implemented)
│   │   └── qmesh-client.js
│   └── lib/
│       ├── llama-process-manager.js     # ✅ Subprocess manager
│       ├── llama-http-client.js         # ✅ HTTP client
│       ├── network-manager.js           # ⏳ TODO: Hyperswarm wrapper
│       └── system-monitor.js            # ⏳ TODO: Health monitoring
│
├── examples/
│   └── inference/
│       ├── run-worker.js                # ✅ Worker startup example
│       └── simple-test.js               # ✅ Quick test
│
├── test-sidecar.js                      # ✅ E2E sidecar test
├── test-inference-engine-sidecar.js     # ✅ Adapter test
├── test-llama-compatibility.js          # Failed compatibility test
└── models/                              # GGUF models (not in git)
    ├── tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
    └── Llama-3.2-3B-Instruct-Q4_K_M.gguf
```

## Performance Benchmarks

**Hardware:** Linux x64, NVIDIA RTX 5070 Laptop (8GB VRAM)

### Actual Performance (CPU-only, TinyLlama 1B)

| Metric | Value |
|--------|-------|
| Model load time | 2-3 seconds |
| Inference speed | 56 tokens/sec |
| Memory usage | ~1.5GB |
| HTTP overhead | <1ms (negligible) |

### Expected Performance (with GPU)

| Model | Load Time | Speed (GPU) | Memory |
|-------|-----------|-------------|--------|
| TinyLlama 1B | 1-2s | 50-80 tok/s | ~1.5GB |
| Llama 3.2 3B | 2-3s | 30-50 tok/s | ~3GB |
| Mistral 7B | 3-5s | 15-25 tok/s | ~5GB |

## Implementation Status

### ✅ Phase 1: Local Sidecar (Week 1) - **COMPLETE**

- [x] Pear Runtime integration
- [x] llama-server subprocess management
- [x] HTTP client with SSE streaming
- [x] Bare Runtime compatibility fixes
- [x] InferenceEngineSidecar adapter
- [x] Working examples
- [x] End-to-end tests passing

**Files Created:**
- `src/lib/llama-process-manager.js` (262 lines)
- `src/lib/llama-http-client.js` (345 lines)
- `src/worker/inference-engine-sidecar.js` (345 lines)
- `examples/inference/run-worker.js`
- `examples/inference/simple-test.js`
- `ARCHITECTURE.md`, `STATUS.md`, `DAY1_SUMMARY.md`

### ⏳ Phase 2: P2P Networking (Week 2) - **IN PROGRESS**

Next tasks:
1. Create `src/lib/network-manager.js` - Hyperswarm wrapper
2. Create `src/lib/system-monitor.js` - CPU/memory/health tracking
3. Create `src/worker/worker-node.js` - P2P orchestrator
4. Create `src/client/qmesh-client.js` - Client SDK
5. Test multi-worker discovery

### 📅 Phase 3: Distribution (Week 3-4) - **PENDING**

- Bundle llama-server binary with Pear app
- Test Pear staging and seeding
- Deploy to different machine
- Test auto-updates

## Common Issues & Solutions

### Issue 1: "AbortSignal.timeout is not a function"

**Cause:** Bare Runtime doesn't support `AbortSignal.timeout()`

**Solution:** Use `AbortController` pattern (see "Bare Runtime Compatibility" section)

### Issue 2: "MODULE_NOT_FOUND" for bare modules

**Cause:** Import maps not configured or module not installed

**Solution:**
1. Check `package.json` imports section
2. Install missing bare modules: `npm install bare-fs bare-process`

### Issue 3: llama-server not found

**Cause:** Binary not built or wrong path

**Solution:**
```bash
# Build binary
cd /home/luka/llama.cpp
cmake -B build -DLLAMA_CURL=OFF && cmake --build build --target llama-server -j4

# Verify location
ls -lh /home/luka/llama.cpp/build/bin/llama-server
```

### Issue 4: Chat endpoint network errors

**Cause:** Known issue with `/v1/chat/completions` endpoint timing

**Workaround:** Use `generate()` or `generateStream()` instead of `chatStream()` for now

## Testing Strategy

### Unit Tests (TODO)
- Worker selection logic
- Health score calculations
- Message parsing

### Integration Tests
- ✅ `test-sidecar.js` - E2E sidecar test
- ✅ `test-inference-engine-sidecar.js` - Adapter test
- ⏳ Multi-worker coordination
- ⏳ P2P discovery and routing

### Manual Testing
```bash
# Quick sidecar test
pear run --dev test-sidecar.js

# Full worker test
pear run --dev examples/inference/run-worker.js

# Simple inference
pear run --dev examples/inference/simple-test.js
```

## Key Design Decisions

### 1. Sidecar over Direct Integration

**Decision:** Use llama-server subprocess instead of node-llama-cpp bindings

**Rationale:**
- node-llama-cpp incompatible with Bare Runtime
- Sidecar uses official, maintained tooling
- Actually lower memory footprint
- Easy to update independently

**Trade-offs:**
- +1 extra process to manage
- +~50MB memory overhead
- HTTP communication (negligible latency)

### 2. Bare-compatible AbortController Pattern

**Decision:** Create helper method for timeout signals

**Implementation:**
```javascript
_createTimeoutSignal(timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  controller.signal.addEventListener('abort', () => clearTimeout(timeout))
  return controller.signal
}
```

### 3. API Compatibility Layer

**Decision:** Create `InferenceEngineSidecar` with same API as original

**Benefits:**
- Minimal code changes for migration
- Easy to test (drop-in replacement)
- Familiar patterns for developers

## Next Steps (Phase 2)

### Immediate Tasks

1. **Implement network-manager.js**
   - Wrap Hyperswarm for P2P connectivity
   - Handle peer discovery and connections
   - Message protocol (length-prefixed JSON)

2. **Implement system-monitor.js**
   - CPU usage tracking
   - Memory monitoring
   - Health score calculation

3. **Implement worker-node.js**
   - Combine inference + networking
   - Handle incoming requests
   - Broadcast availability

4. **Test P2P networking**
   - Start 2-3 workers locally
   - Verify discovery works
   - Test request routing

### Future Enhancements

- GPU support (requires CUDA toolkit)
- Model distribution via Hyperdrive
- Multi-model support
- Mobile builds (Android/iOS)
- Production hardening

## Resources

### Documentation
- [Pear Runtime Docs](https://docs.pears.com)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [llama-server API](https://github.com/ggml-org/llama.cpp/blob/master/examples/server/README.md)
- [Hyperswarm](https://docs.holepunch.to/building-blocks/hyperswarm)

### Related Files
- Original QMesh: `/home/luka/qmesh/qmesh/`
- llama.cpp: `/home/luka/llama.cpp/`
- Binary: `/home/luka/llama.cpp/build/bin/llama-server`

### Key References
- [ARCHITECTURE.md](ARCHITECTURE.md) - Complete sidecar design
- [STATUS.md](STATUS.md) - Detailed progress tracking
- [DAY1_SUMMARY.md](DAY1_SUMMARY.md) - Day 1 achievements

## Important Notes

### Model Files
- Models stored in `models/` directory
- **Not committed to git** (too large)
- Use GGUF format (Q4_K_M recommended)
- Download from Hugging Face

### llama-server Binary
- Currently CPU-only (no GPU support yet)
- Size: 5.0M
- Version: b7070-4dca015b7
- Built without CURL support

### Worker IDs
- Not yet implemented (Phase 2)
- Will be persistent 64-char hex strings
- Stored in `worker-id.txt` (not committed)

### Security
- All inference is 100% local (localhost only)
- No external API calls
- P2P connections will be encrypted (Hyperswarm)

## Contributing Guidelines

When implementing new features:

1. **Test in Bare Runtime** - Always test with `pear run --dev`
2. **Use import maps** - Never use direct Node.js imports
3. **Avoid AbortSignal.timeout()** - Use AbortController pattern
4. **Follow existing patterns** - ES modules, async/await, error handling
5. **Document decisions** - Update ARCHITECTURE.md and STATUS.md
6. **Test thoroughly** - Create test files for major components

## Debugging Tips

### Enable verbose logging
```javascript
const manager = new LlamaProcessManager({
  verbose: true  // Shows llama-server output
})
```

### Check llama-server health
```bash
curl http://localhost:8080/health
curl http://localhost:8080/props
```

### Monitor process
```bash
ps aux | grep llama-server
lsof -i :8080
```

### View Pear logs
```bash
# Check Pear runtime version
pear --version

# Run with debug output
DEBUG=* pear run --dev test-sidecar.js
```

## License

[To be determined - inherit from QMesh]

---

**Status:** Phase 1 Complete (100%) - Ready for Phase 2!
**Last Updated:** November 15, 2025
**Next Milestone:** P2P Networking Implementation
