#!/usr/bin/env node

/**
 * Interactive Chat Bot Example
 * Chat with AI through QMesh network
 */

import QMeshClient from '../qmesh-client-node.js';
import readline from 'readline';

class ChatBot {
  constructor() {
    this.client = new QMeshClient({ silent: true });
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    console.log('🤖 QMesh Chat Bot');
    console.log('==================\n');

    console.log('Connecting to network...');
    await this.client.connect();
    console.log('Connected! Type "exit" to quit.\n');

    this.chat();
  }

  chat() {
    this.rl.question('You: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        await this.shutdown();
        return;
      }

      try {
        console.log('Bot: Thinking...');
        const response = await this.client.sendPrompt(input);
        console.log(`Bot: ${response}\n`);
      } catch (error) {
        console.error(`Bot: Error - ${error.message}\n`);
      }

      this.chat(); // Continue conversation
    });
  }

  async shutdown() {
    console.log('\nGoodbye!');
    this.rl.close();
    await this.client.disconnect();
    process.exit(0);
  }
}

// Start the chat bot
const bot = new ChatBot();
bot.start().catch(console.error);