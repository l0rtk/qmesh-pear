/**
 * Inference Engine Sidecar Adapter
 *
 * Drop-in replacement for InferenceEngine that uses llama-server HTTP API
 * instead of direct node-llama-cpp bindings.
 *
 * Provides the same public API as InferenceEngine for compatibility
 * with existing code.
 */

import { LlamaProcessManager } from '../lib/llama-process-manager.js';
import { LlamaHttpClient } from '../lib/llama-http-client.js';

/**
 * Sidecar-based inference engine
 * Compatible with the original InferenceEngine API
 */
export class InferenceEngineSidecar {
  /**
   * Create inference engine with sidecar architecture
   *
   * @param {Object} config - Configuration object
   * @param {string} config.modelPath - Path to GGUF model
   * @param {string} config.binaryPath - Path to llama-server binary
   * @param {number} config.port - HTTP port for llama-server
   * @param {number} config.gpuLayers - Number of GPU layers
   * @param {Object} options - Additional options
   */
  constructor(config, options = {}) {
    if (!config || !config.modelPath) {
      throw new Error('modelPath is required for InferenceEngineSidecar');
    }

    this.config = config;
    this.options = options;

    // Create process manager and HTTP client
    this.processManager = new LlamaProcessManager({
      modelPath: config.modelPath,
      binaryPath: config.binaryPath,
      port: config.port || 8080,
      gpuLayers: config.gpuLayers ?? 33,
      ctxSize: options.contextSize ?? 2048,
      threads: config.threads ?? 4,
      verbose: config.verbose ?? false
    });

    this.httpClient = new LlamaHttpClient({
      port: config.port || 8080,
      timeout: options.timeout || 120000
    });

    // Default inference parameters (compatible with InferenceEngine)
    this.defaultParams = {
      temperature: options.temperature ?? 0.7,
      topP: options.topP ?? 0.9,
      topK: options.topK ?? 40,
      repeatPenalty: options.repeatPenalty ?? 1.1,
      maxTokens: options.maxTokens ?? 200,
    };

    // Track if we've started the server
    this.started = false;

    // Chat history for persistent chat (emulate chatStream behavior)
    this.chatHistory = [];
  }

  /**
   * Start the llama-server subprocess
   * Must be called before inference
   */
  async start() {
    if (this.started) {
      console.log('⚠️  Inference engine already started');
      return;
    }

    console.log('🚀 Starting inference engine (sidecar mode)...');
    await this.processManager.start();
    this.started = true;
    console.log('✅ Inference engine ready');
  }

  /**
   * Ensure server is started (auto-start if needed)
   */
  async ensureStarted() {
    if (!this.started) {
      await this.start();
    }
  }

  /**
   * Generate text from a prompt (non-streaming)
   * Compatible with InferenceEngine.generate()
   *
   * @param {string} prompt - The input prompt
   * @param {Object} options - Inference parameters
   * @returns {Promise<Object>} Generated text and metadata
   */
  async generate(prompt, options = {}) {
    await this.ensureStarted();

    const startTime = Date.now();

    try {
      // Merge parameters
      const params = {
        ...this.defaultParams,
        ...options,
      };

      // Call HTTP client
      const result = await this.httpClient.generate(prompt, {
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        maxTokens: params.maxTokens,
        stop: params.stop || []
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokensPerSecond = result.tokens > 0
        ? Math.round(result.tokens / duration)
        : 0;

      return {
        text: result.text,
        tokens: result.tokens,
        duration,
        tokensPerSecond,
        sessionId: 'http-session', // llama-server manages sessions internally
      };

    } catch (error) {
      throw new Error(`Inference failed: ${error.message}`);
    }
  }

  /**
   * Generate text from a prompt (streaming)
   * Compatible with InferenceEngine.generateStream()
   *
   * @param {string} prompt - The input prompt
   * @param {Function} onToken - Callback for each generated token
   * @param {Object} options - Inference parameters
   * @returns {Promise<Object>} Generation metadata
   */
  async generateStream(prompt, onToken, options = {}) {
    await this.ensureStarted();

    const startTime = Date.now();
    let totalTokens = 0;

    try {
      // Merge parameters
      const params = {
        ...this.defaultParams,
        ...options,
      };

      // Wrap onToken to count tokens
      const wrappedOnToken = (text) => {
        totalTokens++;
        if (onToken) {
          onToken(text, totalTokens);
        }
      };

      // Call HTTP client streaming
      await this.httpClient.generateStream(prompt, wrappedOnToken, {
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        maxTokens: params.maxTokens,
        stop: params.stop || []
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokensPerSecond = totalTokens > 0
        ? Math.round(totalTokens / duration)
        : 0;

      return {
        tokens: totalTokens,
        duration,
        tokensPerSecond,
        sessionId: 'http-session',
      };

    } catch (error) {
      throw new Error(`Streaming inference failed: ${error.message}`);
    }
  }

  /**
   * Generate chat response (streaming) with persistent history
   * Compatible with InferenceEngine.chatStream()
   *
   * @param {string} userMessage - The user's message
   * @param {Function} onToken - Callback for each generated text chunk
   * @param {Object} options - Inference parameters
   * @returns {Promise<Object>} Generation metadata
   */
  async chatStream(userMessage, onToken, options = {}) {
    await this.ensureStarted();

    const startTime = Date.now();
    let totalTokens = 0;
    let assistantResponse = '';

    try {
      // Add user message to history
      this.chatHistory.push({
        role: 'user',
        content: userMessage
      });

      // Merge parameters
      const params = {
        ...this.defaultParams,
        ...options,
      };

      // Wrap onToken to accumulate response
      const wrappedOnToken = (text) => {
        assistantResponse += text;
        totalTokens++;
        if (onToken) {
          onToken(text, totalTokens);
        }
      };

      // Use chat completions endpoint with history
      await this.httpClient.chatStream(this.chatHistory, wrappedOnToken, {
        temperature: params.temperature,
        topP: params.topP,
        maxTokens: params.maxTokens,
        stop: params.stop || []
      });

      // Add assistant response to history
      this.chatHistory.push({
        role: 'assistant',
        content: assistantResponse
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokensPerSecond = totalTokens > 0
        ? Math.round(totalTokens / duration)
        : 0;

      return {
        tokens: totalTokens,
        duration,
        tokensPerSecond,
        sessionId: 'chat-session',
      };

    } catch (error) {
      throw new Error(`Chat streaming failed: ${error.message}`);
    }
  }

  /**
   * Reset chat history
   */
  resetChatHistory() {
    this.chatHistory = [];
    console.log('🗑️  Chat history cleared');
  }

  /**
   * Get chat history
   */
  getChatHistory() {
    return this.chatHistory;
  }

  /**
   * Get pool statistics (simplified for sidecar)
   * Compatible with InferenceEngine.getStats()
   */
  getStats() {
    return {
      totalSessions: 1, // llama-server manages its own session pool
      busySessions: this.processManager.isRunning ? 1 : 0,
      availableSessions: this.processManager.isRunning ? 0 : 1,
      maxSessions: 1,
      sessions: [{
        id: 'http-session',
        busy: this.processManager.isRunning,
        requestCount: 0, // llama-server tracks this internally
        idleTime: 0,
      }],
      serverInfo: this.processManager.getInfo(),
    };
  }

  /**
   * Check if server is healthy
   */
  async isHealthy() {
    if (!this.started) {
      return false;
    }
    return await this.processManager.isHealthy();
  }

  /**
   * Stop llama-server and cleanup
   * Compatible with InferenceEngine.dispose()
   */
  async dispose() {
    console.log('🛑 Disposing inference engine (sidecar mode)...');

    if (this.started) {
      await this.processManager.stop();
      this.started = false;
    }

    this.chatHistory = [];
    console.log('✅ Inference engine disposed');
  }
}
