#!/usr/bin/env node

async function main() {
  const module = await import("./worker-scored.js");
}

main().catch(console.error);
