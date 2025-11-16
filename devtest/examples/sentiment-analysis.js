#!/usr/bin/env node

/**
 * Sentiment Analysis Service Example
 * Analyzes sentiment of text using QMesh network
 */

import QMeshClient from '../qmesh-client-node.js';

class SentimentAnalyzer {
  constructor() {
    this.client = new QMeshClient();
    this.connected = false;
  }

  async connect() {
    console.log('Connecting to QMesh network...');
    await this.client.connect();
    this.connected = true;
    console.log('Connected!');

    const workers = this.client.getActiveWorkers();
    if (workers && workers.length > 0) {
      console.log('Active workers:', workers);
    }
  }

  async analyze(text) {
    if (!this.connected) {
      throw new Error('Not connected to network');
    }

    const prompt = `Analyze the sentiment of this text and respond with only one word: positive, negative, or neutral.

Text: "${text}"

Sentiment:`;

    try {
      const result = await this.client.sendPrompt(prompt);
      const sentiment = result.trim().toLowerCase();

      if (!['positive', 'negative', 'neutral'].includes(sentiment)) {
        const firstWord = sentiment.split(/[\s,.!?]+/)[0];
        if (['positive', 'negative', 'neutral'].includes(firstWord)) {
          return firstWord;
        }
        return 'neutral';
      }

      return sentiment;
    } catch (error) {
      throw new Error(`Analysis failed: ${error.message}`);
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }
}

// Example usage
async function main() {
  console.log('🎯 Sentiment Analysis Service\n');

  const analyzer = new SentimentAnalyzer();

  const texts = [
    "I absolutely love this product! It's amazing!",
    "This is terrible. Complete waste of money.",
    "The product is okay, nothing special.",
    "Best purchase I've ever made! Highly recommend!"
  ];

  try {
    await analyzer.connect();
    console.log('');

    for (const text of texts) {
      try {
        console.log(`📝 Text: "${text}"`);
        const sentiment = await analyzer.analyze(text);
        const emoji = sentiment === 'positive' ? '😊' :
                      sentiment === 'negative' ? '😞' : '😐';
        console.log(`📊 Sentiment: ${sentiment} ${emoji}\n`);

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Error analyzing text: ${error.message}\n`);
      }
    }

  } catch (error) {
    console.error('❌ Connection error:', error.message);
  } finally {
    await analyzer.disconnect();
    console.log('👋 Disconnected from network');
  }
}

main();