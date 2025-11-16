# QMesh Technology Integration Documentation

This document explains how QMesh integrates three core technologies to create a distributed LLM inference network: **Hyperswarm** for P2P networking, **QVAC SDK** for LLM inference, and **Pear Runtime** for deployment.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Pear Runtime  │    │   Hyperswarm    │    │   QVAC SDK      │
│                 │    │                 │    │                 │
│ • App packaging │◄───┤ • P2P networking│◄───┤ • LLM inference │
│ • Deployment    │    │ • Discovery     │    │ • Model loading │
│ • bare-* APIs   │    │ • Messaging     │    │ • Completion    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   QMesh Worker  │
                    │                 │
                    │ • Priority Queue│
                    │ • Score System  │
                    │ • Health Monitor│
                    └─────────────────┘
```

## Hyperswarm Integration

### Dual Network Architecture

QMesh operates two separate Hyperswarm networks:

#### 1. Inference Network
- **Topic**: `qmesh-inference-network-v1`
- **Purpose**: Handle LLM inference requests between clients and workers
- **Connections**: Client ↔ Worker

```javascript
// Worker setup
const topic = Buffer.alloc(32).fill('qmesh-inference-network-v1');
const discovery = this.swarm.join(topic);
```

#### 2. Score Sharing Network
- **Topic**: `qmesh-scores-network-v1`
- **Purpose**: Distribute worker scores and health data across the network
- **Connections**: Worker ↔ Worker

```javascript
// Score network setup
this.scoreSwarm = new Hyperswarm();
const scoreTopic = Buffer.alloc(32).fill('qmesh-scores-network-v1');
const scoreDiscovery = this.scoreSwarm.join(scoreTopic);
```

### Message Protocol

All messages use length-prefixed JSON format:

```
┌─────────────┬─────────────────┐
│ Length (4B) │ JSON Message    │
└─────────────┴─────────────────┘
```

#### Inference Messages
```javascript
// Request
{
  type: 'inference',
  requestId: 'hex-string',
  prompt: 'user-prompt',
  senderId: 'client-id',
  senderScore: 150
}

// Response
{
  type: 'inference_result',
  requestId: 'hex-string',
  result: 'llm-response'
}
```

#### Score Messages
```javascript
// Score announcement
{
  type: 'score_announce',
  data: {
    workerId: 'worker-id',
    totalScore: 1250,
    level: 'Gold',
    system: {
      status: 'idle',
      queueLength: 0,
      healthScore: 85
    }
  }
}
```

### Connection Management

```javascript
// Handle new connections
this.swarm.on('connection', (connection, info) => {
  const peerId = info.publicKey.toString('hex').substring(0, 8);
  this.connections.set(peerId, connection);

  // Setup message handling
  this.handleConnection(connection, peerId);
});
```

## QVAC SDK Integration

### Model Loading

QMesh uses QVAC SDK to load and manage the Llama 3.2 1B model:

```javascript
import { loadModel, completion, unloadModel } from '@tetherto/qvac-sdk';

// Load model with persistent configuration
this.modelId = await loadModel(
  'pear://afa79ee07c0a138bb9f11bfaee771fb1bdfca8c82d961cff0474e49827bd1de3/Llama-3.2-1B-Instruct-Q4_0.gguf',
  {
    modelType: 'llm',
    modelConfig: {
      ctx_size: 512,        // Context window
      gpu_layers: 0,        // CPU-only inference
      device: 'cpu',
      use_mlock: true,      // Memory locking
      persistent: true      // Keep loaded between requests
    }
  }
);
```

### Model Configuration Details

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `ctx_size` | 512 | Context window size for token processing |
| `gpu_layers` | 0 | Use CPU-only inference for compatibility |
| `device` | 'cpu' | Target device for inference |
| `use_mlock` | true | Lock model in memory to prevent swapping |
| `persistent` | true | Keep model loaded between requests |

### Inference Processing

```javascript
// Process inference request
const response = await completion(
  this.modelId,
  prompt,
  {
    max_tokens: 100,
    temperature: 0.7,
    stop: ['</s>']
  }
);
```

### Model Resource Management

- **Single Load**: Model is loaded once at startup and kept in memory
- **Shared Access**: All requests use the same loaded model instance
- **Graceful Shutdown**: Model is unloaded when worker terminates

```javascript
// Cleanup on shutdown
await unloadModel(this.modelId);
```

## Pear Runtime Integration

### Application Structure

```json
{
  "name": "qmesh",
  "type": "module",
  "pear": {
    "name": "qmesh",
    "type": "terminal"
  }
}
```

### Bare Runtime Compatibility

QMesh uses Pear's bare runtime APIs instead of Node.js APIs:

#### File System
```javascript
// Instead of Node.js 'fs'
import { readFileSync, writeFileSync, existsSync } from 'bare-fs';
```

#### Cryptography
```javascript
// Instead of Node.js 'crypto'
import { randomBytes } from 'bare-crypto';
```

#### OS Information
```javascript
// Instead of Node.js 'os' - removed for Pear compatibility
// process.memoryUsage() - removed for Pear compatibility
```

### Deployment and Distribution

#### Development
```bash
pear dev .
```

#### Staging
```bash
pear stage .
```

#### Distribution
```bash
pear run pear://4amnw4kw5pwnwqsk6wrj343f1dfs1o71u6qdja3xytxiisx3ofjo
```

### Entry Point

```javascript
// main.js - Pear entry point
async function main() {
  const module = await import("./worker-scored.js");
}
```

## Data Flow Architecture

### Request Processing Flow

```
1. Client connects to inference network via Hyperswarm
2. Client sends inference request with sender score
3. Worker receives request and checks queue capacity
4. Worker adds request to priority queue based on sender score
5. Worker processes request using QVAC SDK
6. Worker sends response back through Hyperswarm connection
7. Worker updates scores and broadcasts to score network
```

### Score Synchronization Flow

```
1. Worker calculates performance scores locally
2. Worker broadcasts scores to score network
3. Other workers receive and validate scores
4. Global leaderboard updates across network
5. Updated scores influence future request prioritization
```

## Network Discovery and Topology

### Worker Discovery

```javascript
// Workers automatically discover each other via Hyperswarm DHT
const topic = Buffer.alloc(32).fill('qmesh-inference-network-v1');
this.swarm.join(topic, { server: true, client: false });
```

### Client Discovery

```javascript
// Clients discover available workers
const topic = Buffer.alloc(32).fill('qmesh-inference-network-v1');
this.swarm.join(topic, { client: true, server: false });
```

### Network Topology

```
        Score Network (Worker ↔ Worker)
              qmesh-scores-network-v1
                     │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
┌───▼───┐        ┌────▼────┐        ┌───▼───┐
│Worker1│        │Worker2  │        │Worker3│
└───┬───┘        └────┬────┘        └───┬───┘
    │                 │                 │
    └─────────────────┼─────────────────┘
                      │
           Inference Network (Client ↔ Worker)
            qmesh-inference-network-v1
                      │
                ┌─────┴─────┐
                │  Clients  │
                └───────────┘
```

## Configuration and Environment

### Required Environment

```bash
# GitHub Personal Access Token for QVAC SDK
export PAT_TOKEN=your_github_personal_access_token
```

### NPM Registry Configuration

```ini
# .npmrc
@tetherto:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${PAT_TOKEN}
```

### Dependencies

```json
{
  "@tetherto/qvac-sdk": "^0.1.0",   // LLM inference
  "hyperswarm": "^4.14.0",          // P2P networking
  "hyperbee": "^2.26.5",           // Persistent storage
  "hypercore": "^11.16.1",         // Data structures
  "b4a": "^1.7.1"                  // Buffer utilities
}
```

## Performance Characteristics

### Network Performance
- **Connection Time**: ~1-2 seconds for worker discovery
- **Message Latency**: ~10-50ms for local network requests
- **Throughput**: Limited by QVAC inference speed (~2-5 seconds per request)

### Resource Usage
- **Memory**: ~200-500MB per worker (model + runtime)
- **CPU**: Varies by inference load (10-90% during processing)
- **Network**: ~1-10KB per request (excluding model data)

### Scalability
- **Workers**: Tested with 3-5 concurrent workers
- **Clients**: Supports multiple concurrent clients per worker
- **Queue**: Dynamic queue sizing based on system health

## Error Handling and Resilience

### Connection Recovery
```javascript
// Automatic reconnection on connection loss
connection.on('close', () => {
  this.connections.delete(peerId);
  // Hyperswarm automatically attempts reconnection
});
```

### Model Recovery
```javascript
// Reload model if inference fails
catch (error) {
  console.error('Inference failed, reloading model...');
  await this.loadModelSafely();
}
```

### Network Resilience
- **Automatic Discovery**: Workers rejoin network automatically
- **Score Persistence**: Scores saved to Hyperbee database
- **Graceful Degradation**: System continues with fewer workers

## Future Integration Opportunities

### QVAC Expansion
- **Multi-Model Support**: Load multiple models per worker
- **Specialized Services**: Transcription, translation, embeddings
- **Model Switching**: Dynamic model selection based on request type

### Hyperswarm Enhancements
- **Custom Protocols**: Specialized message types for different services
- **Load Balancing**: Advanced routing algorithms
- **Security**: Encrypted channels and authentication

### Pear Platform Features
- **Auto-Updates**: Seamless application updates
- **Resource Management**: Better system integration
- **Performance Monitoring**: Built-in telemetry