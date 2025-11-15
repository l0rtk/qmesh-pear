# QMesh Pear: Comprehensive Guide

## Table of Contents

1. [What is QMesh Pear?](#what-is-qmesh-pear)
2. [Vision & Mission](#vision--mission)
3. [How It Works](#how-it-works)
4. [Current Features](#current-features)
5. [Future Features & Roadmap](#future-features--roadmap)
6. [Use Cases](#use-cases)
7. [Getting Started](#getting-started)
8. [Architecture Overview](#architecture-overview)
9. [Performance & Benchmarks](#performance--benchmarks)
10. [Advanced Usage](#advanced-usage)
11. [Troubleshooting](#troubleshooting)
12. [Contributing](#contributing)
13. [FAQ](#faq)

---

## What is QMesh Pear?

**QMesh Pear** is a **fully decentralized, peer-to-peer network for running AI language models**. It enables anyone to contribute their computing power to a distributed AI inference network or use the network to run AI models without relying on centralized cloud services.

### Key Characteristics

- **100% Peer-to-Peer**: No servers, no cloud infrastructure, no single point of failure
- **Privacy-First**: All inference happens locally on worker machines - prompts never leave the P2P network
- **Distributed by Design**: Built on [Pear Runtime](https://pears.com) and [Hyperswarm DHT](https://docs.holepunch.to)
- **Open Source**: Transparent, auditable, community-driven
- **Cross-Platform**: Works on Linux, macOS, and Windows (binaries for additional platforms coming soon)

### The Big Picture

Imagine if running AI models was as easy as sharing files on BitTorrent - **that's QMesh Pear**.

```
Traditional AI:                    QMesh Pear:
┌─────────────┐                   ┌──────────┐  ┌──────────┐
│   You       │                   │  Worker  │  │  Worker  │
└──────┬──────┘                   │  (You)   │  │ (Friend) │
       │                          └────┬─────┘  └────┬─────┘
       │ API Call                      │             │
       ↓                               └──────┬──────┘
┌─────────────┐                              │
│ OpenAI GPT  │                        P2P Network (DHT)
│ (Centralized│                              │
│  Server)    │                       ┌──────┴──────┐
└─────────────┘                       │   Client    │
                                      │ (Anyone)    │
- Costs money                         └─────────────┘
- Privacy concerns                    - Free & open
- Service dependency                  - Private
- Rate limits                         - Resilient
                                      - No limits
```

---

## Vision & Mission

### Vision

**A world where AI inference is as distributed and resilient as the internet itself.**

No single company should control access to AI. QMesh Pear builds a decentralized alternative where:

- **Anyone can contribute** compute power and earn reputation
- **Anyone can use** AI models without payment or surveillance
- **No single entity** controls the network
- **Privacy is default**, not optional

### Mission

1. **Democratize AI Access**: Remove barriers to running powerful language models
2. **Protect Privacy**: Keep your prompts and data truly private
3. **Build Resilience**: Create infrastructure that can't be shut down
4. **Enable Innovation**: Let developers build on a truly open AI platform

---

## How It Works

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Hyperswarm DHT Network                    │
│         (Distributed Hash Table - like BitTorrent)          │
└────────────────┬──────────────────────┬─────────────────────┘
                 │                      │
         ┌───────┴────────┐     ┌──────┴────────┐
         │  Worker Node   │     │  Worker Node  │
         │  (Your PC)     │     │  (Friend's PC)│
         └───────┬────────┘     └──────┬────────┘
                 │                      │
         ┌───────┴────────────────────────────────┐
         │  1. Announces availability to DHT      │
         │  2. Monitors health (CPU, RAM, queue)  │
         │  3. Runs llama-server subprocess       │
         │  4. Accepts P2P inference requests     │
         │  5. Streams responses back to clients  │
         └────────────────────────────────────────┘
                         ↕
         ┌────────────────────────────────────────┐
         │          Client Application            │
         │  1. Queries DHT for available workers  │
         │  2. Selects healthiest worker          │
         │  3. Sends prompt via P2P connection    │
         │  4. Receives generated text            │
         └────────────────────────────────────────┘
```

### The Sidecar Architecture

QMesh Pear uses a **sidecar pattern** to run LLM inference efficiently:

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

**Why sidecar instead of native Node.js bindings?**

- **Bare Runtime Compatibility**: Node.js native modules don't work in Pear's Bare runtime
- **Official Tooling**: Uses battle-tested `llama-server` from llama.cpp project
- **Lower Memory**: Actually uses less RAM than Node.js bindings (~1.5GB vs ~2.5GB)
- **Easy Updates**: Swap binary without code changes
- **Minimal Overhead**: HTTP communication adds <1ms latency (~2% overhead)

---

## Current Features

### ✅ Phase 1: Local Inference (Complete)

**Core Inference Engine**
- Subprocess management for llama-server
- HTTP client with Server-Sent Events (SSE) streaming support
- Graceful process lifecycle (start, health checks, restart, shutdown)
- Auto-restart on crash (up to 3 attempts)
- Chat history management
- Temperature and max tokens control

**Bare Runtime Compatibility**
- Custom AbortController timeout handling (Bare doesn't support `AbortSignal.timeout()`)
- Platform-aware imports (`bare-fs`, `bare-process`, `bare-os`)
- Graceful CPU/memory monitoring fallbacks

**Developer Experience**
- Simple API matching original QMesh interface
- Comprehensive error handling
- Detailed logging and health monitoring
- Working examples and end-to-end tests

### ✅ Phase 2: P2P Networking (Complete)

**Distributed Discovery**
- Hyperswarm DHT integration for peer discovery
- Topic-based network joining (`qmesh-inference`)
- Automatic NAT traversal (works across the internet)
- Multi-worker discovery and tracking

**Health-Based Load Balancing**
- Real-time health scoring (CPU, memory, queue)
- Worker selection based on availability
- Three health states:
  - 🟢 **Healthy** (score > 60): Ready for requests
  - 🟡 **Busy** (score 20-60): Slower but available
  - 🔴 **Overloaded** (score < 20): Rejecting requests

**Robust Communication**
- Length-prefixed message protocol (handles split TCP packets)
- JSON-based message format
- Request timeout handling
- Concurrent request support

**System Monitoring**
- Bare-compatible CPU and memory tracking
- Process-level metrics when system-wide unavailable
- Queue capacity management
- Automatic health broadcasts every 10 seconds

### ✅ Phase 3: Production Deployment (Complete)

**Binary Bundling**
- Pre-compiled `llama-server` binaries bundled with app
- Automatic platform detection (Linux x64, macOS ARM64/x64, Windows x64)
- 5MB binary size (CPU-only build)

**Model Management**
- Model availability checking before worker starts
- Download instructions with Hugging Face URLs
- Model metadata registry (name, size, checksum, URL)
- Models excluded from Pear staging (keeps bundle ~50MB vs 3GB)

**Distribution Infrastructure**
- Staged to Pear DHT: `pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo`
- Anyone can install and run with one command
- Auto-update support via Pear Runtime
- Cross-platform framework (Linux implemented, macOS/Windows ready)

**Production Configuration**
- `.pearignore` for staging optimization
- Environment-aware binary paths
- Graceful error handling for missing models/binaries
- Production-ready logging

### Supported Models

**Currently Tested:**
- **TinyLlama 1.1B** - 638 MB, Q4_K_M quantization (recommended for testing)
- **Llama 3.2 3B** - 1.9 GB, Q4_K_M quantization (production workloads)

**Framework Supports:**
- Any GGUF-format model from llama.cpp ecosystem
- Q4_K_M quantization recommended (balance of quality and size)
- Larger models supported (7B, 13B, 70B) with sufficient VRAM/RAM

---

## Future Features & Roadmap

### 🚀 Phase 4: GPU Acceleration (Next)

**Goal:** 5-10x inference speedup with GPU support

- [ ] CUDA-enabled llama-server binary
- [ ] GPU detection and automatic GPU/CPU selection
- [ ] Multi-GPU support for large models
- [ ] Apple Metal support for macOS
- [ ] Vulkan support for cross-platform GPU

**Expected Performance:**
- TinyLlama 1B: 50-80 tokens/sec (currently 25-56)
- Llama 3.2 3B: 30-50 tokens/sec (currently 10-15)
- Mistral 7B: 15-25 tokens/sec (new capability)

### 📦 Phase 5: Advanced Distribution

**Model Distribution via Hyperdrive**
- [ ] Share GGUF models P2P (no centralized downloads)
- [ ] Model verification (checksums, signatures)
- [ ] Automatic model discovery from network
- [ ] Model caching and seeding

**Automatic Model Downloads**
- [ ] HTTP download from Hugging Face on first run
- [ ] Progress bar and resume support
- [ ] Background download while worker runs
- [ ] Model version updates

**Cross-Platform Binaries**
- [x] Linux x64 (complete)
- [ ] macOS Apple Silicon (darwin-arm64)
- [ ] macOS Intel (darwin-x64)
- [ ] Windows x64 (win32-x64)
- [ ] ARM Linux (Raspberry Pi, AWS Graviton)

### 🌐 Phase 6: Network Enhancements

**Advanced Worker Selection**
- [ ] Latency-based routing (prefer geographically close workers)
- [ ] Reputation system (track worker reliability)
- [ ] Capability-based selection (GPU vs CPU, model support)
- [ ] Fallback chains (auto-retry with different worker)

**Streaming Improvements**
- [ ] Client-side streaming support in QMeshClient
- [ ] Token-by-token display in examples
- [ ] Streaming abort (cancel mid-generation)
- [ ] Partial result recovery on disconnect

**Multi-Model Support**
- [ ] Workers advertise available models
- [ ] Clients specify desired model in request
- [ ] Model hot-swapping without restart
- [ ] Model-specific routing

### 🔐 Phase 7: Security & Trust

**Authentication & Authorization**
- [ ] Worker whitelisting/blacklisting
- [ ] API key support for private networks
- [ ] Rate limiting per client
- [ ] Request signing and verification

**Privacy Enhancements**
- [ ] End-to-end encryption for prompts (beyond Hyperswarm's transport encryption)
- [ ] Zero-knowledge proofs for worker verification
- [ ] Prompt anonymization options
- [ ] Local-only mode (reject all P2P requests)

**Reputation System**
- [ ] Track worker uptime and response quality
- [ ] Penalize workers that provide bad responses
- [ ] Reward reliable workers with priority
- [ ] Community-driven trust scores

### 📱 Phase 8: Client Ecosystem

**Web Client**
- [ ] WebSocket bridge for browser access
- [ ] React/Vue component library
- [ ] Chat UI example
- [ ] Web-based worker dashboard

**Mobile Builds**
- [ ] Android worker app (Termux or native)
- [ ] iOS client app (inference only, Apple restrictions)
- [ ] Mobile-optimized models (quantization)

**Developer Tools**
- [ ] REST API gateway for traditional HTTP clients
- [ ] Python SDK for QMesh network
- [ ] OpenAI API compatibility layer
- [ ] Grafana dashboard for network monitoring

### 🎯 Phase 9: Production Hardening

**Monitoring & Observability**
- [ ] Prometheus metrics export
- [ ] Structured logging (JSON)
- [ ] Distributed tracing
- [ ] Network health dashboard

**Reliability**
- [ ] Worker heartbeat monitoring
- [ ] Automatic failover on worker crash
- [ ] Request retry with exponential backoff
- [ ] Circuit breaker pattern for unhealthy workers

**Performance**
- [ ] Request batching for efficiency
- [ ] Response caching (identical prompts)
- [ ] Model quantization options
- [ ] Speculative decoding for faster generation

### 🌍 Phase 10: Ecosystem Growth

**Monetization (Optional)**
- [ ] Payment channels for paid inference (Lightning Network?)
- [ ] Worker compensation for contributed compute
- [ ] Premium models marketplace
- [ ] Hosted worker services

**Community Features**
- [ ] Public worker registry website
- [ ] Leaderboards (fastest workers, most reliable, etc.)
- [ ] Model fine-tuning coordination
- [ ] Dataset sharing for training

**Research & Experimentation**
- [ ] Federated learning experiments
- [ ] Multi-worker collaborative generation
- [ ] Mixture of experts (route to specialized models)
- [ ] Benchmark suite for network performance

---

## Use Cases

### 1. Privacy-Conscious AI Users

**Scenario:** You want to use AI but don't trust OpenAI/Google with your data.

**Solution:** Run a QMesh worker locally or use workers from trusted friends/community. Your prompts never leave the P2P network.

**Example:**
```bash
# Run your own worker
pear run pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo

# Or use a client to connect to your worker from another device
pear run --dev examples/p2p/run-p2p-client.js
```

### 2. Developers Building AI Apps

**Scenario:** You're building an AI-powered app but don't want vendor lock-in or API costs.

**Solution:** Build on QMesh's P2P network - your users can run their own inference or contribute compute.

**Example:**
```javascript
import { QMeshClient } from './src/client/qmesh-client.js'

const client = new QMeshClient({ networkTopic: 'qmesh-inference' })
await client.connect()

const result = await client.generate('Translate to French: Hello', {
  maxTokens: 50
})

console.log(result.text)
```

### 3. Researchers & Hobbyists

**Scenario:** You want to experiment with LLMs but can't afford expensive GPUs.

**Solution:** Join the QMesh network and access community-contributed GPU workers.

**Example:**
```bash
# Use the network without running a worker
git clone <qmesh-repo>
cd qmesh-pear
pear run --dev examples/p2p/run-p2p-client.js
```

### 4. Organizations with Private Data

**Scenario:** Your company needs AI but regulations prohibit sending data to external APIs.

**Solution:** Run QMesh workers on internal infrastructure with private network topic.

**Example:**
```javascript
// Private company network
const worker = new WorkerNode({
  networkTopic: 'acme-corp-private-inference',
  modelPath: './models/llama-3.2-3b.gguf'
})
```

### 5. Community AI Projects

**Scenario:** You're running a Discord bot, game, or community project that needs AI.

**Solution:** Contributors can donate compute by running workers with your custom topic.

**Example:**
```bash
# Community members run workers
NETWORK_TOPIC=my-discord-bot-inference pear run pear://...

# Your bot uses the dedicated network
const client = new QMeshClient({ networkTopic: 'my-discord-bot-inference' })
```

### 6. Edge Computing & IoT

**Scenario:** You need AI inference on edge devices (Raspberry Pi, industrial IoT).

**Solution:** Run lightweight workers on edge hardware, coordinate with P2P network.

**Example:**
```bash
# Run on Raspberry Pi with 4GB RAM
pear run pear://... --model tinyllama-1.1b
```

---

## Getting Started

### For End Users: Running a QMesh Worker

#### Prerequisites

1. **Install Pear Runtime:**
   ```bash
   curl -sL https://pears.com/install.sh | bash
   ```

2. **Download a Model** (choose one):

   **Option A: TinyLlama 1.1B (638 MB, recommended for testing)**
   ```bash
   mkdir -p ~/.pear/by-dkey/4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo/models

   wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
     -O ~/.pear/by-dkey/4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

   **Option B: Llama 3.2 3B (1.9 GB, better quality)**
   ```bash
   wget https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf \
     -O ~/.pear/by-dkey/4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf
   ```

#### Run the Worker

```bash
pear run pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo
```

You should see:

```
🌐 QMesh P2P Worker
============================================================
📋 Worker Configuration:
  Model: ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
  Binary: /path/to/bin/linux-x64/llama-server
  Network Topic: qmesh-inference
  Queue Capacity: 10
============================================================

📦 Checking model availability...
✅ Model found: ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

⚙️  Initializing worker node...
============================================================
🟢 Worker Ready!
  Worker ID: abc123...
  Health: 100 (healthy)
============================================================

📡 Listening for P2P requests...
Press Ctrl+C to exit
```

**That's it!** Your worker is now part of the QMesh P2P network and will accept inference requests.

### For Developers: Using the QMesh Client

#### Installation

```bash
git clone https://github.com/your-org/qmesh-pear.git
cd qmesh-pear
npm install
```

#### Basic Usage

```javascript
import { QMeshClient } from './src/client/qmesh-client.js'

// Create client
const client = new QMeshClient({ networkTopic: 'qmesh-inference' })

// Connect to P2P network
await client.connect()

// Discover workers (wait a few seconds)
await client.discoverWorkers()

// Generate text
const result = await client.generate('Explain quantum computing in simple terms', {
  maxTokens: 100,
  temperature: 0.7
})

console.log('Generated:', result.text)
console.log('Worker:', result.workerId)
console.log('Time:', result.generationTime, 'ms')

// Cleanup
await client.disconnect()
```

#### Running the Example Client

```bash
# Start a worker first (in separate terminal)
pear run pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo

# Run example client
pear run --dev examples/p2p/run-p2p-client.js
```

---

## Architecture Overview

### Component Stack

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                     │
│  - WorkerNode (worker orchestration)                    │
│  - QMeshClient (client SDK)                             │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────┐
│                  Coordination Layer                      │
│  - NetworkManager (P2P messaging)                        │
│  - SystemMonitor (health tracking)                       │
│  - InferenceEngineSidecar (API adapter)                  │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────┐
│                   Infrastructure Layer                   │
│  - LlamaProcessManager (subprocess lifecycle)            │
│  - LlamaHttpClient (HTTP communication)                  │
│  - BinaryResolver (platform detection)                   │
│  - ModelDownloader (model management)                    │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────┐
│                    Runtime Layer                         │
│  - Pear Runtime (Bare runtime environment)               │
│  - Hyperswarm (P2P DHT networking)                       │
│  - llama-server subprocess (inference engine)            │
└──────────────────────────────────────────────────────────┘
```

### Key Components

1. **[LlamaProcessManager](src/lib/llama-process-manager.js)** - Manages llama-server subprocess lifecycle
2. **[LlamaHttpClient](src/lib/llama-http-client.js)** - HTTP communication with llama-server
3. **[InferenceEngineSidecar](src/worker/inference-engine-sidecar.js)** - API-compatible inference adapter
4. **[NetworkManager](src/lib/network-manager.js)** - Hyperswarm P2P networking wrapper
5. **[SystemMonitor](src/lib/system-monitor.js)** - Health monitoring and load tracking
6. **[WorkerNode](src/worker/worker-node.js)** - Worker orchestration (combines inference + networking)
7. **[QMeshClient](src/client/qmesh-client.js)** - Client SDK for distributed inference
8. **[BinaryResolver](src/lib/binary-resolver.js)** - Platform detection and binary path resolution
9. **[ModelDownloader](src/lib/model-downloader.js)** - Model availability checking and download

---

## Performance & Benchmarks

### Hardware Tested

- **Platform:** Linux x64
- **CPU:** AMD Ryzen 7 (8 cores)
- **GPU:** NVIDIA RTX 5070 Laptop (8GB VRAM) - *GPU support coming soon*
- **RAM:** 32GB

### Current Performance (CPU-only, TinyLlama 1.1B)

| Metric | Value |
|--------|-------|
| **Model Load Time** | 2-3 seconds |
| **Inference Speed** | 25-56 tokens/sec |
| **Memory Usage (llama-server)** | ~1.5 GB |
| **Memory Usage (Pear app)** | ~52 MB |
| **HTTP Overhead** | <1ms (negligible) |
| **P2P Discovery Time** | 1-3 seconds |
| **P2P Routing Latency** | <50ms |

### Expected Performance (with GPU - Coming Soon)

| Model | Load Time | Speed (GPU) | VRAM Usage |
|-------|-----------|-------------|------------|
| **TinyLlama 1B** | 1-2s | 50-80 tok/s | ~1.5 GB |
| **Llama 3.2 3B** | 2-3s | 30-50 tok/s | ~3 GB |
| **Mistral 7B** | 3-5s | 15-25 tok/s | ~5 GB |
| **Llama 2 13B** | 5-8s | 8-15 tok/s | ~9 GB |

### Scalability

**Single Worker:**
- Handles 1 request at a time (sequential)
- Queue capacity: 10 requests
- Auto-rejects when overloaded (health score < 20)

**Multi-Worker Network:**
- Clients auto-discover all workers
- Load balances based on health scores
- Tested with 3 concurrent workers (more recommended)

---

## Advanced Usage

### Custom Network Topics

Run a private QMesh network:

```javascript
// Worker
const worker = new WorkerNode({
  networkTopic: 'my-private-network',
  modelPath: './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
})

// Client
const client = new QMeshClient({ networkTopic: 'my-private-network' })
```

### Multiple Workers on Same Machine

```bash
# Terminal 1 (default port 8080)
pear run pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo

# Terminal 2 (custom port 8081)
PORT=8081 pear run pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo
```

### Development Mode

```bash
# Clone repository
git clone https://github.com/your-org/qmesh-pear.git
cd qmesh-pear

# Install dependencies
npm install

# Run worker in dev mode
pear run --dev index.js

# Run tests
pear run --dev test-sidecar.js
pear run --dev test-e2e-p2p-inference.js
```

### Custom Model Configuration

Edit [index.js](index.js) or set environment variables:

```javascript
const worker = new WorkerNode({
  modelPath: process.env.MODEL_PATH || './models/custom-model.gguf',
  port: process.env.PORT || 8080,
  gpuLayers: parseInt(process.env.GPU_LAYERS || '0'),
  queueCapacity: parseInt(process.env.QUEUE_CAPACITY || '10')
})
```

Then run:

```bash
MODEL_PATH=./models/llama-3.2-3b.gguf GPU_LAYERS=33 pear run --dev index.js
```

---

## Troubleshooting

### Problem: Model not found

**Error:**
```
⚠️  Model not found: ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

**Solution:**

Download the model to the correct location:

```bash
mkdir -p ~/.pear/by-dkey/4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo/models

wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  -O ~/.pear/by-dkey/4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

### Problem: Binary not found (macOS/Windows)

**Error:**
```
Error: Unsupported platform: darwin-arm64
Binary not found at: /path/to/bin/darwin-arm64/llama-server
```

**Cause:** Only Linux x64 binary is currently bundled.

**Solution:**

**Option A (Recommended):** Use Linux (VM, WSL2, or native)

**Option B:** Build llama-server for your platform:

```bash
# macOS/Windows
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
cmake -B build -DLLAMA_CURL=OFF
cmake --build build --target llama-server -j4

# Copy to QMesh directory
cp build/bin/llama-server /path/to/qmesh-pear/bin/darwin-arm64/
```

### Problem: No clients connecting

**Symptoms:**
- Worker shows "Listening for P2P requests..."
- Client says "Discovering workers..." but finds none

**Solutions:**

1. **Wait for DHT propagation** (5-10 seconds)
2. **Check firewall settings** - Allow UDP traffic for Hyperswarm
3. **Verify same network topic** - Worker and client must use `qmesh-inference`
4. **Try on same machine first** - Eliminate network issues

### Problem: Slow inference speed

**Symptoms:**
- Only getting 5-10 tokens/sec (expected: 25-56)

**Solutions:**

1. **Check CPU usage** - Close other applications
2. **Verify model loaded** - Check llama-server output
3. **Try smaller prompts** - Long context slows generation
4. **Wait for GPU support** - Coming in Phase 4 (5-10x speedup)

### Problem: Worker crashes after a few requests

**Symptoms:**
- Worker exits unexpectedly
- "llama-server process died" in logs

**Solutions:**

1. **Check memory** - Model might exceed available RAM
2. **View llama-server logs** - Set `verbose: true` in LlamaProcessManager
3. **Try smaller model** - Use TinyLlama 1.1B instead of Llama 3.2 3B
4. **Report issue** - Open GitHub issue with logs

### Problem: "AbortSignal.timeout is not a function"

**Cause:** Bare Runtime doesn't support `AbortSignal.timeout()`

**Solution:** This is already handled internally. If you see this error, it's a bug - please report it.

---

## Contributing

We welcome contributions! Here's how to get involved:

### Development Setup

```bash
# Clone repository
git clone https://github.com/your-org/qmesh-pear.git
cd qmesh-pear

# Install dependencies
npm install

# Build llama-server (optional, for development)
cd ~/llama.cpp
cmake -B build -DLLAMA_CURL=OFF
cmake --build build --target llama-server -j4
```

### Running Tests

```bash
# Unit tests
pear run --dev test-sidecar.js
pear run --dev test-inference-engine-sidecar.js
pear run --dev test-network-manager.js
pear run --dev test-system-monitor.js

# Integration tests
pear run --dev test-e2e-p2p-inference.js
bash test-e2e-separate-processes.sh
```

### Code Guidelines

1. **Use ES modules** - `import/export`, not `require()`
2. **Bare Runtime compatible** - No Node.js-specific APIs without fallbacks
3. **Test in Pear** - Always test with `pear run --dev`
4. **Follow existing patterns** - See [ARCHITECTURE.md](ARCHITECTURE.md)
5. **Document decisions** - Update relevant .md files

### Areas Needing Help

- **GPU Support** - Build CUDA-enabled binaries, test on various GPUs
- **Cross-Platform Binaries** - Build for macOS (ARM/Intel), Windows
- **Model Distribution** - Implement Hyperdrive integration for P2P model sharing
- **Web Client** - WebSocket bridge and browser UI
- **Mobile Builds** - Android worker app, iOS client
- **Documentation** - Tutorials, video guides, architecture deep-dives
- **Testing** - Multi-machine P2P tests, performance benchmarks

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly (`pear run --dev` your code)
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request with description of changes

---

## FAQ

### Q: Is this production-ready?

**A:** QMesh Pear is **production-ready for testing and small-scale deployments**. Phase 3 (Production Deployment) is complete, but we recommend:

- ✅ Use for personal projects, experiments, hobbyist apps
- ✅ Run private networks for organizations
- ⚠️ Not yet for mission-critical applications (no GPU, limited platform support)
- 🔜 Wait for Phase 4 (GPU) for production-grade performance

### Q: How private is QMesh?

**A:** Very private:

- ✅ All inference happens locally on worker machines
- ✅ Prompts never sent to external APIs
- ✅ Hyperswarm provides transport-layer encryption
- 🔜 End-to-end encryption coming in Phase 7

**Note:** Workers can log prompts locally. Only run workers you trust, or run your own.

### Q: Can I make money running a worker?

**A:** Not yet. Monetization is planned for Phase 10:

- 🔜 Payment channels (Lightning Network integration)
- 🔜 Worker compensation for contributed compute
- 🔜 Premium model marketplace

Currently, QMesh is a **community-driven, volunteer network**.

### Q: What models are supported?

**A:** Any GGUF-format model from the llama.cpp ecosystem:

- ✅ Llama family (1B, 3B, 7B, 13B, 70B)
- ✅ Mistral, Mixtral
- ✅ Qwen, DeepSeek
- ✅ Phi, Gemma, and more

**Recommended quantization:** Q4_K_M (balance of quality and size)

### Q: Does this work on my Raspberry Pi?

**A:** Not yet officially supported, but theoretically possible:

- TinyLlama 1.1B might run on RPi 4 (4GB RAM)
- Need ARM Linux binary (not bundled yet)
- Expect slow performance (5-10 tokens/sec)
- Better suited as client than worker

### Q: How does this compare to running llama.cpp directly?

**QMesh Pear advantages:**
- ✅ P2P networking built-in (no manual server setup)
- ✅ Worker discovery automatic
- ✅ Distributed across multiple machines
- ✅ Health-based load balancing

**llama.cpp advantages:**
- ✅ More direct control over inference
- ✅ GPU support already available
- ✅ More optimization flags

**Use llama.cpp if:** You only need local inference
**Use QMesh if:** You want distributed, P2P AI network

### Q: Can I use this commercially?

**A:** License TBD (likely permissive open source). For now:

- ✅ Use freely for personal projects
- ✅ Contribute to the network
- ⚠️ Contact maintainers for commercial deployment
- 📜 Official license coming soon

### Q: How do I get help?

1. **Check this guide** - Most common issues covered above
2. **Read [ARCHITECTURE.md](ARCHITECTURE.md)** - Deep technical details
3. **Open GitHub Issue** - Bug reports and feature requests
4. **Join Discord/Matrix** - Community chat (links coming soon)

---

## Appendix: Additional Resources

### Documentation

- [README.md](README.md) - Project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - Detailed sidecar architecture
- [CLAUDE.md](CLAUDE.md) - Developer guide for Claude Code
- [STATUS.md](STATUS.md) - Detailed progress tracking
- [PHASE2_COMPLETE.md](PHASE2_COMPLETE.md) - Phase 2 completion summary
- [PHASE3_PROGRESS.md](PHASE3_PROGRESS.md) - Phase 3 progress details

### External Links

- [Pear Runtime Documentation](https://docs.pears.com)
- [llama.cpp GitHub](https://github.com/ggml-org/llama.cpp)
- [llama-server API Docs](https://github.com/ggml-org/llama.cpp/blob/master/examples/server/README.md)
- [Hyperswarm Documentation](https://docs.holepunch.to/building-blocks/hyperswarm)
- [Hugging Face Models](https://huggingface.co/models?library=gguf)

### Project Links

- **GitHub Repository:** (coming soon)
- **Pear DHT Link:** `pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo`
- **Community Chat:** (coming soon)
- **Website:** (coming soon)

---

**Last Updated:** November 15, 2025
**Status:** Phase 3 Complete - Production Deployment Ready
**Next Milestone:** Phase 4 - GPU Acceleration

**Join the QMesh P2P network and help build the future of distributed AI!**
