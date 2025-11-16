#!/bin/bash

# Generate a random seed if not set
if [ -z "$HYPERSWARM_SEED" ]; then
  export HYPERSWARM_SEED=$(openssl rand -hex 32)
fi

# Check if PAT_TOKEN is set
if [ -z "$PAT_TOKEN" ]; then
  echo "⚠️  PAT_TOKEN not set. Setting default..."
  export PAT_TOKEN=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
fi

echo "🚀 Starting QMesh Worker"
echo "📍 HYPERSWARM_SEED: ${HYPERSWARM_SEED:0:8}..."
echo ""

# Run with Pear or Node.js
if command -v pear &> /dev/null; then
  pear run . --worker
else
  node worker.js
fi