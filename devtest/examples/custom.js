#!/usr/bin/env node

import QMeshClient from "../qmesh-client-node.js";

async function main() {
  try {
    const client = new QMeshClient();

    await client.connect();

    const result = await client.sendPrompt("what is 2+2?");

    console.log("result: ", result);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    console.log("end");
  }
}

main();
