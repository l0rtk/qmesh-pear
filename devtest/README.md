# QMesh - Distributed LLM Inference Network

## Problem

Current LLM and AI platforms operate with centralized architecture. When a user makes a request, the platform processes everything on their servers using their computational resources. This means the platform bears all infrastructure costs while users pay premium prices for the service.

## Solution

Distribute computational workload to peer devices. Instead of processing everything centrally, users become nodes in a distributed P2P system, running computations on their own hardware.

**Benefits:**

- Utilizes idle computational power on user devices
- Reduces infrastructure costs for platforms
- Lowers service costs for users
- Enables faster local processing without network latency
- Improves data privacy by keeping processing local

## Quick Start

### Prerequisites

1. **Install Pear Runtime**

```bash
npm install -g pear
```

2. **GitHub Personal Access Token Required**
   - Generate a [GitHub PAT](https://github.com/settings/tokens) with `read:packages` scope
   - Export as environment variable: `export PAT_TOKEN=your_token_here`
   - This is required to access the @tetherto/qvac-sdk package

### Run Worker Node

```bash
# Set your GitHub PAT token first (required)
export PAT_TOKEN=your_github_personal_access_token
pear run pear://4amnw4kw5pwnwqsk6wrj343f1dfs1o71u6qdja3xytxiisx3ofjo
```

### Use as Client

```bash
# Run examples
node examples/basic-usage.js
node examples/sentiment-analysis.js
node examples/load-aware-routing.js

# Or use the API programmatically
```

## Architecture

```
Customer (needs inference) ──> P2P Network ──> Worker (has GPU/CPU)
                                    ↓
                            Priority Queue (based on contribution score)
                                    ↓
                              LLM Inference (QVAC SDK)
                                    ↓
                              Response back to customer
```

**Components:**

- **Workers** - Nodes that provide LLM compute power
- **Customers** - Users who need inference services
- **P2P Network** - Hyperswarm-based decentralized networking
- **Priority Queue** - Credit-based request processing
- **Score System** - Tracks contributions and grants priority

## Economic Model

Users can participate in three ways:

1. **Contribute & Earn** - Run as worker, process requests, earn credits
2. **Use Credits** - Need inference? Your contribution history = priority
3. **Fair Exchange** - More contribution = faster service

This creates a self-sustaining economy where everyone benefits from participation.

## Setup Instructions

### 1. Environment Setup

```bash
# Install dependencies
npm install

# Create .npmrc file for QVAC SDK access
cat > .npmrc << EOF
@tetherto:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=\${PAT_TOKEN}
EOF

# Set your GitHub PAT token
export PAT_TOKEN=your_github_personal_access_token
```

### 2. Running the Network

As a **Worker** (contribute GPU/CPU):

```bash
node worker-scored.js
```

As a **Client** (use the network):

```bash
node examples/basic-usage.js
```

## Programmatic API

```javascript
import QMeshClient from "./qmesh-client.js";

const client = new QMeshClient();
await client.connect();
const answer = await client.sendPrompt("What is AI?");
console.log(answer);
await client.disconnect();
```

## Testing

### Terminal 1 - Run Worker:

```bash
export PAT_TOKEN=your_github_personal_access_token
node worker-scored.js
```

### Terminal 2 - Test API:

```bash
node test.js
```

## Scoring System

QMesh uses a comprehensive scoring system to track worker performance and enable intelligent load distribution:

### How Workers Earn Points:

| Action                  | Points   | Description                                             |
| ----------------------- | -------- | ------------------------------------------------------- |
| **Speed Score**         | 0-5      | Based on response time (< 1s = 5pts, < 2s = 4pts, etc.) |
| **Complexity Score**    | 0-3      | Based on prompt length (>500 chars = 3pts)              |
| **Quality Bonus**       | +3       | Successful inference completion                         |
| **Achievement Bonuses** | Variable | Special rewards for milestones                          |

### Achievements:

- 🏃 **Speed Demon** - 10 requests under 2 seconds (+20 pts)
- 💯 **Centurion** - 100 total requests processed (+50 pts)
- ✨ **Perfectionist** - 50 consecutive successes (+30 pts)
- 🏃 **Marathoner** - 1 hour continuous uptime (+25 pts)

### Worker Levels:

- **Bronze** (0-99 pts)
- **Silver** (100-499 pts)
- **Gold** (500-1499 pts)
- **Platinum** (1500-3999 pts)
- **Diamond** (4000-9999 pts)
- **Master** (10000+ pts)

## Credit-Based Priority System

QMesh implements a fair reciprocity system: **Contribute resources to get priority access!**

### How It Works:

1. **Run as Worker** → Earn contribution points
2. **Use as Client** → Your points determine queue priority
3. **Higher Score** = **Faster Service**

### Priority Tiers:

| Tier              | Score Required | Queue Priority            |
| ----------------- | -------------- | ------------------------- |
| 👑 **Master**     | 10000+         | Instant - Skip all queues |
| 💎 **Diamond**    | 4000-9999      | Highest priority          |
| 🏆 **Platinum**   | 1500-3999      | High priority             |
| 🥇 **Gold**       | 500-1499       | Medium priority           |
| 🥈 **Silver**     | 100-499        | Normal priority           |
| 🥉 **Bronze**     | 1-99           | Low priority              |
| ❓ **Unverified** | 0              | Lowest priority           |

### Fair Exchange:

- **No freeloading**: Everyone must contribute to use the network efficiently
- **Unified identity**: Same ID for worker and client roles
- **Verified scores**: Network validates contribution claims
- **Queue jumping**: High contributors process first, even if others waiting

### Test Credit System:

```bash
node examples/credit-priority-demo.js
```

## Intelligent Worker Selection

The network uses smart routing to distribute work fairly and efficiently:

### Selection Priority:

1. **Empty Queue First**

   - Workers with 0 items in queue are always selected first
   - Even if they have lower scores than busy workers

2. **Health-Based Selection** (when all have empty queues)

   - System health score determines selection
   - Based on CPU, memory, and load averages

3. **Load-Based Selection** (when all have items in queue)
   - Queue availability: 60% weight
   - System health: 30% weight
   - Performance history: 10% weight

### Worker Health Status:

- 🟢 **Idle/Light** - Ready for work (0-40% load)
- 🟡 **Moderate** - Can accept work (40-60% load)
- 🟠 **Busy** - Limited capacity (60-80% load)
- 🔴 **Overloaded** - Rejecting requests (80%+ load)

### Example Selection Scenarios:

```
Scenario 1: Mixed Queue States
- Worker A: Score 1000, Queue 2/5, Health 80
- Worker B: Score 500,  Queue 0/5, Health 70  ← Selected (empty queue)
- Worker C: Score 750,  Queue 1/5, Health 90

Scenario 2: All Busy
- Worker A: Score 1000, Queue 4/5, Health 80
- Worker B: Score 500,  Queue 1/5, Health 70  ← Selected (least loaded)
- Worker C: Score 750,  Queue 3/5, Health 90
```

## Monitoring Tools

### View Live Leaderboard:

```bash
node examples/leaderboard.js
```

### Test Load-Aware Routing:

```bash
node examples/load-aware-routing.js
```

## Files

- `worker-scored.js` - Worker with scoring and health monitoring
- `qmesh-client-node.js` - Client API with smart routing
- `lib/score-manager.js` - Local scoring system
- `lib/global-score-manager.js` - Network-wide score tracking
- `lib/system-monitor.js` - System health monitoring
- `main.js` - Pear entry point

## Known Issues

### Bugs to Fix:

- **Context Overflow** - Long conversations or large prompts can exceed model context limits
- **Score Persistence** - Occasional issues with score database synchronization
- **Network Discovery** - Sometimes workers don't discover each other immediately
- **Queue Processing** - Rare cases where queue gets stuck requiring manual trigger

## Future Plans

### User as a Service (UaaS) - Platform Model:

**The Problem**: Platforms pay millions for cloud infrastructure while users have idle devices

**The Solution**: Users' devices become the infrastructure

- **For Platforms**:

  - Eliminate AWS/Google Cloud costs
  - No GPU clusters needed
  - Pay users instead of cloud providers
  - Automatic scaling with user growth

- **For Users**:

  - Free or heavily discounted service
  - Earn money from idle device time
  - Complete data privacy (local processing)
  - Contribute to the platform they use

- **Real Applications**:
  - Grammarly → Grammar checking on user devices
  - Notion AI → Document AI on user laptops
  - Translation apps → Local translation processing
  - Code assistants → IDE inference on developer machines

### Payment Integration (QVAC + Tether Ecosystem):

- **USDT Native Integration** - Built-in Tether stablecoin payments for stable pricing
- **Tether Gold (XAUT)** - Premium services paid with gold-backed tokens
- **Cross-Chain USDT** - Support Ethereum, Tron, Polygon for global accessibility
- **Lightning Network** - Instant micropayments for per-request billing
- **Tether Wallet Integration** - Seamless payments through official Tether infrastructure
- **Enterprise USDT Credits** - Bulk stablecoin purchases for B2B platform integration
- **Smart Contracts** - Automated escrow and worker payment distribution
- **Yield + Compute** - Stake USDT while earning from worker services

### Technical Improvements (QVAC Opportunities):

- **Multi-Service Workers** - Transcription, translation, embeddings in addition to LLM
- **Voice Processing** - Add Whisper.cpp transcription for audio-to-text services
- **Translation Network** - Neural translation with Marian OPUS models
- **RAG Implementation** - Distributed knowledge base with embeddings
- **Multimodal Support** - Vision capabilities for image analysis
- **Service Marketplace** - Workers offer specialized AI services beyond just LLM

### Economic Features:

- **Staking System** - Stake tokens to guarantee worker availability
- **Reputation System** - Beyond scores, track reliability and quality
- **Market Pricing** - Dynamic pricing based on supply and demand
- **Worker Pools** - Form collectives for guaranteed uptime

### Use Cases:

- **Enterprise API** - B2B inference services
- **Mobile Support** - Run workers on mobile devices
- **Edge Computing** - Deploy at network edges for IoT
- **Federated Learning** - Distributed model training
