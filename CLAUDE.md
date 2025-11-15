# CLAUDE.md

This file provides guidance to Claude Code when working with the QMesh Pear Runtime migration.

## Project Overview

**QMesh Pear** is a Pear Runtime port of QMesh - a distributed peer-to-peer LLM inference network. This version uses a **sidecar architecture** with llama-server subprocess instead of direct node-llama-cpp bindings.

**Current Status:** ✅ Phase 3 Complete (Production Deployment) - Ready for Multi-Machine Testing

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

### 4. NetworkManager ([src/lib/network-manager.js](src/lib/network-manager.js))

P2P networking layer wrapping Hyperswarm with length-prefixed message protocol.

**Key methods:**
```javascript
const manager = new NetworkManager()

// Join P2P network
const topicKey = await manager.joinNetwork('qmesh-inference')

// Send to specific peer
manager.sendMessage(peerId, { type: 'prompt', data: '...' })

// Broadcast to all peers
manager.broadcast({ type: 'status', health: { ... } })

// Clean shutdown
await manager.destroy()
```

**Features:**
- Length-prefixed JSON protocol (4-byte big-endian + JSON)
- Event-based (peer-connected, peer-disconnected, message)
- Handles split TCP packets correctly
- Multi-topic support

### 5. SystemMonitor ([src/lib/system-monitor.js](src/lib/system-monitor.js))

Health tracking and load management with Bare-compatible fallbacks.

**Key methods:**
```javascript
const monitor = new SystemMonitor({ queueCapacity: 10 })

// Start monitoring
monitor.startMonitoring(5000) // Update every 5 seconds

// Get health status
const health = monitor.getHealth()
// { score: 85, state: 'healthy', cpu: 15, memory: 20, queue: { size: 2, capacity: 10 } }

// Update queue
monitor.incrementQueue()
monitor.decrementQueue()
```

**Health Score:**
```javascript
score = (100 - cpuUsage) * 0.4 + (100 - memoryUsage) * 0.4 + queueAvailability * 0.2
```

**States:**
- 🟢 Healthy (score > 60): Accept requests
- 🟡 Busy (score 20-60): Accept but slower
- 🔴 Overloaded (score < 20): Reject requests

### 6. WorkerNode ([src/worker/worker-node.js](src/worker/worker-node.js))

Worker orchestrator integrating inference, networking, and health monitoring.

**Usage:**
```javascript
const worker = new WorkerNode({
  modelPath: './models/model.gguf',
  binaryPath: '/path/to/llama-server',
  port: 8080,
  networkTopic: 'qmesh-inference',
  queueCapacity: 10
})

await worker.start()
// Worker now accepts P2P inference requests
```

**Message types handled:**
- `prompt` - Inference request from client
- `status_request` - Health status query

**Message types sent:**
- `status` - Availability broadcast (every 10 seconds)
- `inference_result` - Response with generated text
- `inference_error` - Error message

### 7. QMeshClient ([src/client/qmesh-client.js](src/client/qmesh-client.js))

Client SDK for distributed LLM inference.

**Usage:**
```javascript
const client = new QMeshClient({ networkTopic: 'qmesh-inference' })

await client.connect()
await client.discoverWorkers() // Wait for discovery

const result = await client.generate('Tell me a joke', {
  maxTokens: 100,
  temperature: 0.7
})

console.log(result.text)
await client.disconnect()
```

**Features:**
- Automatic worker discovery via status broadcasts
- Health-based worker selection (picks highest health score)
- Request timeout handling
- Event-based progress tracking

### 8. BinaryResolver ([src/lib/binary-resolver.js](src/lib/binary-resolver.js))

Platform detection and bundled binary path resolution.

**Usage:**
```javascript
import { getBinaryPath, getBinaryInfo } from './src/lib/binary-resolver.js'

// Auto-detect platform and get binary path
const binaryPath = getBinaryPath()
// Returns: '/path/to/bin/linux-x64/llama-server' (on Linux x64)

// Get debug information
const info = getBinaryInfo()
// { platform: 'linux-x64', binaryPath: '...', exists: true,
//   size: 5242880, sizeHuman: '5.0MB', executable: true }
```

**Supported Platforms:**
- `linux-x64` - Linux 64-bit
- `darwin-arm64` - macOS Apple Silicon
- `darwin-x64` - macOS Intel
- `win32-x64` - Windows 64-bit

**Auto-Detection:**
- Uses `os.platform()` and `os.arch()`
- Validates binary exists and is executable
- Throws error if platform unsupported

### 9. ModelDownloader ([src/lib/model-downloader.js](src/lib/model-downloader.js))

Model availability checking and download infrastructure.

**Usage:**
```javascript
import { ensureModel } from './src/lib/model-downloader.js'

// Check if model exists, show instructions if missing
await ensureModel('./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf')
// If missing: Shows Hugging Face download URL
```

**Available Models:**
- `tinyllama-1.1b` - TinyLlama 1.1B Chat (638 MB, Q4_K_M)
- `llama-3.2-3b` - Llama 3.2 3B Instruct (1.9 GB, Q4_K_M)

**Features:**
- Model metadata registry (name, size, URL, checksum)
- File existence checking
- Download instructions with URLs
- Framework ready for automatic downloads

**Note:** Currently shows download instructions. Automatic HTTP download will be implemented in future update.

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

**4. Missing os.cpus(), os.totalmem(), os.freemem()**

`bare-os` doesn't provide the same APIs as Node.js `os` module. Use graceful fallbacks:

```javascript
// Check if Node.js APIs are available
if (typeof os.totalmem === 'function') {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  // Use system-wide memory info
}

// Bare Runtime fallback
if (typeof os.resourceUsage === 'function') {
  const usage = os.resourceUsage()
  const processMemMB = usage.maxRSS / 1024 // KB to MB
  // Use process memory as proxy
}
```

**Available in bare-os:**
- `platform()`, `arch()`, `resourceUsage()`
- No: `cpus()`, `totalmem()`, `freemem()`, `uptime()`, `loadavg()`

**Solution:** Implement graceful fallbacks that work in both environments. See [SystemMonitor](src/lib/system-monitor.js) for complete implementation.

## Development Commands

```bash
# Phase 1: Local Inference Examples
pear run --dev examples/inference/run-worker.js
pear run --dev examples/inference/simple-test.js

# Phase 2: P2P Networking Examples
pear run --dev examples/p2p/run-p2p-worker.js  # Start worker
pear run --dev examples/p2p/run-p2p-client.js  # Start client (in separate terminal)

# Phase 3: Production Deployment
pear run --dev .                               # Run production worker (index.js)
pear stage main                                # Stage to Pear DHT
pear run pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo  # Run from DHT

# Unit Tests
pear run --dev test-sidecar.js                      # Sidecar architecture
pear run --dev test-inference-engine-sidecar.js     # Inference engine
pear run --dev test-network-manager.js              # P2P networking
pear run --dev test-system-monitor.js               # Health monitoring

# End-to-End Tests
pear run --dev test-e2e-p2p-inference.js            # Single process (limited)
bash test-e2e-separate-processes.sh                 # Separate processes (recommended)

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
├── index.js                          # ✅ Production entry point
├── package.json                      # Dependencies + import maps + Pear config
├── .pearignore                       # ✅ Staging exclusions
├── CLAUDE.md                         # This file
├── README.md                         # Project overview
├── ARCHITECTURE.md                   # Sidecar design docs
├── STATUS.md                         # Progress tracker
├── DAY1_SUMMARY.md                   # Day 1 achievements
├── PHASE2_COMPLETE.md                # Phase 2 summary
├── PHASE3_PROGRESS.md                # ✅ Phase 3 progress tracking
│
├── bin/                              # ✅ Bundled binaries
│   └── linux-x64/
│       └── llama-server              # ✅ 5.0MB executable
│
├── src/
│   ├── worker/
│   │   ├── inference-engine-sidecar.js  # ✅ API-compatible adapter
│   │   └── worker-node.js               # ✅ P2P worker orchestrator
│   ├── client/
│   │   └── qmesh-client.js              # ✅ Client SDK for P2P inference
│   └── lib/
│       ├── llama-process-manager.js     # ✅ Subprocess manager
│       ├── llama-http-client.js         # ✅ HTTP client
│       ├── network-manager.js           # ✅ Hyperswarm P2P wrapper
│       ├── system-monitor.js            # ✅ Health monitoring
│       ├── binary-resolver.js           # ✅ Platform detection
│       └── model-downloader.js          # ✅ Auto-download infrastructure
│
├── examples/
│   ├── inference/
│   │   ├── run-worker.js                # ✅ Local worker example
│   │   └── simple-test.js               # ✅ Quick test
│   └── p2p/
│       ├── run-p2p-worker.js            # ✅ P2P worker example
│       └── run-p2p-client.js            # ✅ P2P client example
│
├── test-sidecar.js                      # ✅ E2E sidecar test
├── test-inference-engine-sidecar.js     # ✅ Adapter test
├── test-network-manager.js              # ✅ P2P networking test
├── test-system-monitor.js               # ✅ Health monitoring test
├── test-e2e-p2p-inference.js            # ✅ End-to-end P2P test
├── test-e2e-separate-processes.sh       # ✅ Multi-process E2E test
├── PHASE2_COMPLETE.md                   # Phase 2 summary
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
| Inference speed | 25-56 tokens/sec |
| Memory usage | ~1.5GB (llama-server) + ~52MB (Pear app) |
| HTTP overhead | <1ms (negligible) |
| P2P discovery | 1-3 seconds |
| P2P latency | <50ms for routing |

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

### ✅ Phase 2: P2P Networking (Week 2) - **COMPLETE**

- [x] NetworkManager - Hyperswarm P2P wrapper with length-prefixed protocol
- [x] SystemMonitor - Health tracking with Bare-compatible fallbacks
- [x] WorkerNode - P2P worker orchestrator
- [x] QMeshClient - Client SDK for distributed inference
- [x] Multi-worker discovery and selection
- [x] End-to-end P2P inference working
- [x] Unit tests passing (NetworkManager, SystemMonitor)
- [x] Integration tests passing (E2E P2P inference)

**Files Created:**
- `src/lib/network-manager.js` (386 lines)
- `src/lib/system-monitor.js` (360 lines)
- `src/worker/worker-node.js` (425 lines)
- `src/client/qmesh-client.js` (396 lines)
- `examples/p2p/run-p2p-worker.js` (202 lines)
- `examples/p2p/run-p2p-client.js` (215 lines)
- `test-network-manager.js`, `test-system-monitor.js`
- `test-e2e-p2p-inference.js`, `test-e2e-separate-processes.sh`
- `PHASE2_COMPLETE.md`

**Key Achievements:**
- ✅ Full P2P networking layer working
- ✅ Health-based worker selection
- ✅ Length-prefixed message protocol
- ✅ Concurrent request handling
- ✅ Bare Runtime compatibility solved (CPU/memory monitoring)

### ✅ Phase 3: Production Deployment (Week 3) - **COMPLETE**

- [x] Bundle llama-server binary with Pear app
- [x] Binary platform detection (linux-x64, darwin-arm64, darwin-x64, win32-x64)
- [x] Production entry point ([index.js](index.js))
- [x] Pear staging configuration
- [x] Model auto-download infrastructure
- [x] Exclude models from bundle (3GB → 50MB)
- [x] Test Pear staging
- [ ] Multi-machine deployment test (pending user testing)

**Files Created:**
- `bin/linux-x64/llama-server` (5.0 MB, bundled binary)
- `src/lib/binary-resolver.js` (platform detection)
- `src/lib/model-downloader.js` (auto-download infrastructure)
- `.pearignore` (exclude large files from staging)
- `PHASE3_PROGRESS.md` (detailed progress tracking)

**Production Deployment:**
```bash
# Staged to Pear DHT:
pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo

# Anyone can install and run:
pear run pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo
```

**Key Achievements:**
- ✅ Automatic platform detection (no manual binary path configuration)
- ✅ Bundle size reduced from 3GB to ~50MB (models excluded)
- ✅ Model checking before worker starts
- ✅ Production-ready configuration
- ✅ Cross-platform binary support (framework ready, linux-x64 implemented)

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

**Cause:** Bundled binary missing or platform not supported

**Solution (Production):**
```javascript
// Binary path is auto-detected:
import { getBinaryPath } from './src/lib/binary-resolver.js'
const binaryPath = getBinaryPath()  // Automatic!
```

**Solution (Development):**
```bash
# Build binary manually for development
cd /home/luka/llama.cpp
cmake -B build -DLLAMA_CURL=OFF && cmake --build build --target llama-server -j4

# Copy to bundled location
cp build/bin/llama-server /path/to/qmesh-pear/bin/linux-x64/
```

**Supported Platforms:**
- ✅ linux-x64 (bundled)
- ⏳ darwin-arm64 (framework ready, binary needed)
- ⏳ darwin-x64 (framework ready, binary needed)
- ⏳ win32-x64 (framework ready, binary needed)

### Issue 4: Model not found

**Cause:** Model file missing from `models/` directory

**Solution:**
```javascript
// Models are checked automatically before worker starts:
import { ensureModel } from './src/lib/model-downloader.js'

await ensureModel('./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf')
// If missing, shows download instructions with Hugging Face URL
```

**Manual Download:**
```bash
# Download TinyLlama 1.1B (638 MB)
wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  -O models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

**Note:** Models are excluded from Pear staging to keep bundle size small (~50MB vs 3GB).

### Issue 5: Chat endpoint network errors

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

## Next Steps (Phase 3)

### Immediate Tasks (Distribution)

1. **Bundle llama-server binary**
   - Include binary in Pear app staging
   - Handle platform-specific binaries (Linux/macOS/Windows)
   - Test binary extraction and execution

2. **Pear staging and seeding**
   - Configure `pear.json` for production
   - Stage app with `pear stage --channel main`
   - Seed to DHT network

3. **Multi-machine testing**
   - Deploy to different machines
   - Test cross-machine P2P discovery
   - Validate NAT traversal

4. **Auto-update testing**
   - Push app updates
   - Verify auto-update mechanism
   - Test rollback scenarios

### Immediate Improvements

- **Streaming responses** - Add streaming support to QMeshClient
- **Better error handling** - More detailed error messages and recovery
- **Multi-worker load balancing** - Test with 3-5 workers simultaneously
- **Model auto-download** - Download models on first run if missing

### Future Enhancements

- **GPU support** (requires CUDA toolkit)
- **Model distribution** via Hyperdrive
- **Multi-model support** (1B, 3B, 7B models)
- **Advanced worker selection** (consider latency, reputation, capabilities)
- **Web client** (WebSocket support for browsers)
- **Mobile builds** (Android/iOS)
- **Production hardening** (rate limiting, authentication, monitoring)

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

**Status:** ✅ Phase 2 Complete (100%) - Ready for Phase 3!
**Last Updated:** November 15, 2025
**Next Milestone:** Distribution & Deployment

See [PHASE2_COMPLETE.md](PHASE2_COMPLETE.md) for detailed Phase 2 summary.
