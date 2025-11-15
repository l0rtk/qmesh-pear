/**
 * Simple Inference Engine
 * Direct text completion without chat formatting
 * Works with any GGUF model
 */

import { LlamaCompletion } from 'node-llama-cpp';
import config from '../config/default.js';

/**
 * Simple inference engine for text completion
 */
export class SimpleInferenceEngine {
  constructor(model, options = {}) {
    if (!model) {
      throw new Error('Model is required for SimpleInferenceEngine');
    }

    this.model = model;
    this.context = null;

    // Default inference parameters
    this.defaultParams = {
      contextSize: options.contextSize ?? config.model.inference.contextSize,
      temperature: options.temperature ?? config.model.inference.temperature,
      topP: options.topP ?? config.model.inference.topP,
      topK: options.topK ?? config.model.inference.topK,
      repeatPenalty: options.repeatPenalty ?? config.model.inference.repeatPenalty,
      maxTokens: options.maxTokens ?? config.model.inference.maxTokens,
    };
  }

  /**
   * Initialize context if not exists
   */
  async ensureContext() {
    if (!this.context) {
      this.context = await this.model.createContext({
        contextSize: this.defaultParams.contextSize,
      });
    }
    return this.context;
  }

  /**
   * Generate text completion (non-streaming)
   */
  async generate(prompt, options = {}) {
    const startTime = Date.now();

    try {
      const context = await this.ensureContext();
      const params = { ...this.defaultParams, ...options };

      // Create completion instance
      const completion = new LlamaCompletion({
        contextSequence: context.getSequence(),
      });

      // Generate text
      const result = await completion.generateCompletion(prompt, {
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        repeatPenalty: params.repeatPenalty,
        maxTokens: params.maxTokens,
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokens = Math.ceil(result.length / 4); // Rough estimate
      const tokensPerSecond = Math.round(tokens / duration);

      return {
        text: result,
        tokens,
        duration,
        tokensPerSecond,
      };

    } catch (error) {
      throw new Error(`Inference failed: ${error.message}`);
    }
  }

  /**
   * Generate text completion (streaming)
   */
  async generateStream(prompt, onToken, options = {}) {
    const startTime = Date.now();
    let totalText = '';
    let tokenCount = 0;

    try {
      const context = await this.ensureContext();
      const params = { ...this.defaultParams, ...options };

      // Create completion instance
      const completion = new LlamaCompletion({
        contextSequence: context.getSequence(),
      });

      // Generate with streaming
      await completion.generateCompletion(prompt, {
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        repeatPenalty: params.repeatPenalty,
        maxTokens: params.maxTokens,
        onToken: (tokens) => {
          // Convert token array to string
          const chunk = Array.isArray(tokens) ? tokens.join('') : tokens;
          totalText += chunk;
          tokenCount++;
          if (onToken) {
            onToken(chunk, tokenCount);
          }
        },
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokensPerSecond = Math.round(tokenCount / duration);

      return {
        tokens: tokenCount,
        duration,
        tokensPerSecond,
      };

    } catch (error) {
      throw new Error(`Streaming inference failed: ${error.message}`);
    }
  }

  /**
   * Dispose and cleanup
   */
  async dispose() {
    this.context = null;
    console.log('✅ Simple inference engine disposed');
  }
}

export default SimpleInferenceEngine;
