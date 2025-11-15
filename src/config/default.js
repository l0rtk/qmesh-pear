/**
 * QMesh Configuration
 * Default settings for the PoC implementation
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../');

export default {
  // Model configuration
  model: {
    // Default model path (relative to project root)
    defaultPath: join(projectRoot, 'models'),

    // Model inference parameters
    inference: {
      contextSize: 2048,        // Context window size (tokens)
      temperature: 0.7,         // Randomness (0.0 = deterministic, 1.0 = creative)
      topP: 0.9,               // Nucleus sampling threshold
      topK: 40,                // Top-K sampling
      repeatPenalty: 1.1,      // Penalty for repeating tokens
      maxTokens: 512,          // Maximum tokens to generate per request
      seed: -1,                // Random seed (-1 = random)
      threads: -1,             // CPU threads (-1 = auto-detect)
    },

    // GPU configuration
    gpu: {
      // Number of layers to offload to GPU
      // -1 = auto-detect, 0 = CPU only, 33+ = GPU acceleration
      layers: process.env.GPU_LAYERS ? parseInt(process.env.GPU_LAYERS) : -1,

      // GPU memory budget (MB) - null = auto
      memoryBudget: null,
    },

    // Context pool settings
    contextPool: {
      maxContexts: 3,          // Maximum concurrent contexts
      reuseContexts: true,     // Reuse contexts across requests
      contextTimeout: 300000,  // Context idle timeout (5 minutes)
    },
  },

  // Hardware detection
  hardware: {
    // Minimum requirements
    minRamGB: 4,               // Minimum system RAM (GB)
    minDiskSpaceGB: 5,         // Minimum disk space for models (GB)

    // Model recommendations based on hardware
    recommendations: {
      // GPU with 8GB+ VRAM
      highEnd: {
        vram: 8,
        models: ['llama-3.2-7b-q4', 'mistral-7b-q4'],
      },
      // GPU with 4-8GB VRAM
      midRange: {
        vram: 4,
        models: ['llama-3.2-3b-q4', 'phi-3-mini-q4'],
      },
      // CPU or low VRAM
      lowEnd: {
        vram: 0,
        models: ['tinyllama-1b-q4', 'qwen-0.5b-q4'],
      },
    },
  },

  // P2P Network configuration (for future phases)
  network: {
    // Network topics (SHA-256 hash or string)
    topics: {
      inference: 'qmesh-inference',      // Main inference network
      // Excluded from PoC:
      // score: 'qmesh-scores',
      // models: 'qmesh-models',
    },

    // Discovery settings
    discovery: {
      announceInterval: 10000,   // Broadcast availability every 10s
      discoveryTimeout: 30000,   // Wait 30s for peer discovery
      maxPeers: 50,             // Maximum connected peers
    },

    // Message settings
    message: {
      maxSize: 10 * 1024 * 1024, // 10MB max message size
      timeout: 60000,            // Request timeout (60s)
    },
  },

  // Worker configuration
  worker: {
    // Worker identification
    idFile: join(projectRoot, 'worker-id.txt'),

    // Queue settings
    queue: {
      maxSize: 10,              // Maximum queued requests
      timeout: 120000,          // Request processing timeout (2 minutes)
    },

    // Health monitoring
    health: {
      updateInterval: 5000,     // Update health every 5s

      // Health score weights
      weights: {
        cpu: 0.4,              // CPU usage weight
        memory: 0.4,           // Memory usage weight
        queue: 0.2,            // Queue availability weight
      },

      // Health thresholds
      thresholds: {
        healthy: 60,           // Score > 60 = healthy
        busy: 20,              // Score 20-60 = busy
        overloaded: 20,        // Score < 20 = overloaded (reject)
      },
    },
  },

  // Client configuration
  client: {
    // Worker selection
    selection: {
      retries: 3,               // Retry failed requests
      retryDelay: 1000,         // Delay between retries (ms)
      workerTimeout: 5000,      // Timeout for worker response
    },

    // Request settings
    request: {
      defaultMaxTokens: 256,    // Default max tokens for requests
      streamChunkSize: 16,      // Tokens per streaming chunk
    },
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
    namespace: 'qmesh',
  },

  // Development settings
  development: {
    mockGPU: process.env.MOCK_GPU === 'true',
    verboseLogging: process.env.VERBOSE === 'true',
  },
};
