#!/usr/bin/env node

/**
 * Basic QMesh Usage Example
 * Shows how to connect to the network and send a prompt
 */

import QMeshClient from "../qmesh-client-node.js";

async function main() {
  // Create client
  const client = new QMeshClient();

  try {
    // Connect to P2P network
    console.log("Connecting to QMesh network...");
    await client.connect();
    console.log("Connected!");

    // Send a prompt
    const result = await client.sendPrompt("What is 1+1?");
    console.log("\nAnswer:", result);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    // Always disconnect when done
    await client.disconnect();
  }
}

main();
