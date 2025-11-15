/**
 * Llama HTTP Client
 *
 * Communicates with llama-server via HTTP API:
 * - Text completion
 * - Chat completions (OpenAI format)
 * - Streaming responses
 * - Health checks
 */

export class LlamaHttpClient {
  constructor(config = {}) {
    this.config = {
      host: config.host || '127.0.0.1',
      port: config.port || 8080,
      timeout: config.timeout || 120000,  // 2 minutes
      ...config
    }

    this.baseUrl = `http://${this.config.host}:${this.config.port}`
  }

  /**
   * Create abort signal with timeout (Bare-compatible)
   */
  _createTimeoutSignal(timeoutMs) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    controller.signal.addEventListener('abort', () => clearTimeout(timeout))
    return controller.signal
  }

  /**
   * Generate text completion
   */
  async generate(prompt, options = {}) {
    const payload = {
      prompt,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      top_k: options.topK ?? 40,
      n_predict: options.maxTokens ?? 200,
      stop: options.stop || [],
      stream: false
    }

    try {
      const response = await fetch(`${this.baseUrl}/completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: this._createTimeoutSignal(this.config.timeout)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        text: data.content,
        tokens: data.tokens_predicted,
        stopReason: data.stop ? 'stop' : 'length'
      }

    } catch (error) {
      console.error('❌ Inference error:', error.message)
      throw error
    }
  }

  /**
   * Generate text completion with streaming
   */
  async generateStream(prompt, onToken, options = {}) {
    const payload = {
      prompt,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      top_k: options.topK ?? 40,
      n_predict: options.maxTokens ?? 200,
      stop: options.stop || [],
      stream: true
    }

    try {
      const response = await fetch(`${this.baseUrl}/completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: this._createTimeoutSignal(this.config.timeout)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle Server-Sent Events (SSE) stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        // Decode chunk
        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''  // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) {
            continue  // Skip empty lines and comments
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6)  // Remove 'data: ' prefix

            if (data === '[DONE]') {
              break
            }

            try {
              const json = JSON.parse(data)

              if (json.content) {
                fullText += json.content
                onToken(json.content)
              }

              if (json.stop) {
                break
              }

            } catch (error) {
              console.warn('Failed to parse SSE data:', data)
            }
          }
        }
      }

      return {
        text: fullText,
        stopReason: 'stop'
      }

    } catch (error) {
      console.error('❌ Streaming inference error:', error.message)
      throw error
    }
  }

  /**
   * Chat completion (OpenAI-compatible format)
   */
  async chat(messages, options = {}) {
    const payload = {
      messages,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      max_tokens: options.maxTokens ?? 200,
      stop: options.stop || [],
      stream: false
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: this._createTimeoutSignal(this.config.timeout)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const choice = data.choices[0]

      return {
        text: choice.message.content,
        role: choice.message.role,
        finishReason: choice.finish_reason
      }

    } catch (error) {
      console.error('❌ Chat error:', error.message)
      throw error
    }
  }

  /**
   * Chat completion with streaming
   */
  async chatStream(messages, onToken, options = {}) {
    const payload = {
      messages,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      max_tokens: options.maxTokens ?? 200,
      stop: options.stop || [],
      stream: true
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: this._createTimeoutSignal(this.config.timeout)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) {
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              break
            }

            try {
              const json = JSON.parse(data)
              const delta = json.choices[0]?.delta

              if (delta?.content) {
                fullText += delta.content
                onToken(delta.content)
              }

              if (json.choices[0]?.finish_reason) {
                break
              }

            } catch (error) {
              console.warn('Failed to parse SSE data:', data)
            }
          }
        }
      }

      return {
        text: fullText,
        finishReason: 'stop'
      }

    } catch (error) {
      console.error('❌ Chat streaming error:', error.message)
      throw error
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: this._createTimeoutSignal(2000)
      })
      return response.ok
    } catch (error) {
      return false
    }
  }

  /**
   * Get model properties
   */
  async getProps() {
    try {
      const response = await fetch(`${this.baseUrl}/props`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()

    } catch (error) {
      console.error('❌ Failed to get model props:', error.message)
      throw error
    }
  }

  /**
   * Tokenize text
   */
  async tokenize(text) {
    try {
      const response = await fetch(`${this.baseUrl}/tokenize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: text })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        tokens: data.tokens,
        count: data.tokens.length
      }

    } catch (error) {
      console.error('❌ Tokenization error:', error.message)
      throw error
    }
  }
}
