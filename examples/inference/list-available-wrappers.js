#!/usr/bin/env node

/**
 * List Available Chat Wrappers
 * Shows what chat wrapper classes are exported by node-llama-cpp
 */

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('   Available Chat Wrappers');
  console.log('═══════════════════════════════════════\n');

  try {
    // Import the entire module
    const llamaCpp = await import('node-llama-cpp');

    console.log('📦 node-llama-cpp exports:\n');

    // Get all exported names
    const exports = Object.keys(llamaCpp);

    // Filter for chat-related exports
    const chatExports = exports.filter(name =>
      name.toLowerCase().includes('chat') ||
      name.toLowerCase().includes('wrapper')
    );

    console.log('🔍 Chat-related exports:');
    console.log('───────────────────────────────────────');
    chatExports.forEach(name => {
      const value = llamaCpp[name];
      const type = typeof value;
      const isClass = type === 'function' && /^[A-Z]/.test(name);

      console.log(`  ${isClass ? '📘' : '📙'} ${name}`);
      console.log(`      Type: ${type}`);

      if (isClass) {
        try {
          // Try to instantiate or inspect
          console.log(`      Constructor params: ${value.length}`);
        } catch (e) {
          // Ignore
        }
      }
      console.log();
    });

    console.log('\n🔍 All exports (${exports.length} total):');
    console.log('───────────────────────────────────────');

    // Group by category
    const categories = {
      classes: [],
      functions: [],
      constants: [],
      other: [],
    };

    exports.forEach(name => {
      const value = llamaCpp[name];
      const type = typeof value;

      if (type === 'function' && /^[A-Z]/.test(name)) {
        categories.classes.push(name);
      } else if (type === 'function') {
        categories.functions.push(name);
      } else if (type === 'string' || type === 'number' || type === 'boolean') {
        categories.constants.push(name);
      } else {
        categories.other.push(name);
      }
    });

    console.log('Classes (${categories.classes.length}):');
    categories.classes.forEach(name => console.log(`  - ${name}`));

    console.log('\nFunctions (${categories.functions.length}):');
    categories.functions.slice(0, 10).forEach(name => console.log(`  - ${name}`));
    if (categories.functions.length > 10) {
      console.log(`  ... and ${categories.functions.length - 10} more`);
    }

    console.log('\nConstants (${categories.constants.length}):');
    categories.constants.slice(0, 10).forEach(name => console.log(`  - ${name}`));
    if (categories.constants.length > 10) {
      console.log(`  ... and ${categories.constants.length - 10} more`);
    }

    // Try to import specific wrappers
    console.log('\n═══════════════════════════════════════');
    console.log('Testing specific wrapper imports:');
    console.log('───────────────────────────────────────\n');

    const wrappersToTry = [
      'ChatMLChatWrapper',
      'Llama3ChatWrapper',
      'LlamaChatWrapper',
      'GeneralChatWrapper',
      'ChatWrapper',
      'TemplateChatWrapper',
      'JinjaTemplateChatWrapper',
    ];

    for (const wrapperName of wrappersToTry) {
      const wrapper = llamaCpp[wrapperName];
      if (wrapper) {
        console.log(`✅ ${wrapperName}: Available`);
        console.log(`   Type: ${typeof wrapper}`);

        // Try to instantiate with empty options
        try {
          const instance = new wrapper();
          console.log(`   Can instantiate: Yes`);
        } catch (e) {
          console.log(`   Requires params: ${e.message.split('\n')[0]}`);
        }
      } else {
        console.log(`❌ ${wrapperName}: Not found`);
      }
      console.log();
    }

    console.log('═══════════════════════════════════════');
    console.log('💡 Tips:');
    console.log('───────────────────────────────────────');
    console.log('1. Use any available wrapper class directly:');
    console.log('   import { ChatMLChatWrapper } from "node-llama-cpp"');
    console.log('   const wrapper = new ChatMLChatWrapper()');
    console.log('');
    console.log('2. Or use string name (if supported):');
    console.log('   chatWrapper: "ChatML"');
    console.log('');
    console.log('3. Let node-llama-cpp auto-detect:');
    console.log('   // Don\'t specify chatWrapper at all');
    console.log('');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
