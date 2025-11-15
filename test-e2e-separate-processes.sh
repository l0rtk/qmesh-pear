#!/bin/bash

# End-to-End P2P Inference Test (Separate Processes)
#
# Runs worker and client in separate processes to properly test P2P discovery

set -e

echo "🌐 End-to-End P2P Inference Test (Separate Processes)"
echo "============================================================"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    if [ ! -z "$WORKER_PID" ]; then
        echo "   Stopping worker (PID: $WORKER_PID)..."
        kill $WORKER_PID 2>/dev/null || true
        wait $WORKER_PID 2>/dev/null || true
    fi
    echo "   ✅ Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Step 1: Start worker in background
echo "📋 Step 1: Starting worker node..."
echo ""

pear run --dev examples/p2p/run-p2p-worker.js &
WORKER_PID=$!

echo "   Worker PID: $WORKER_PID"
echo "   Waiting 10 seconds for worker to initialize..."
echo ""

sleep 10

# Check if worker is still running
if ! kill -0 $WORKER_PID 2>/dev/null; then
    echo "❌ Worker failed to start"
    exit 1
fi

echo "✅ Worker started successfully"
echo "============================================================"
echo ""

# Step 2: Run client (will auto-exit after tests)
echo "📋 Step 2: Running client..."
echo ""

pear run --dev examples/p2p/run-p2p-client.js

CLIENT_EXIT_CODE=$?

echo ""
echo "============================================================"

if [ $CLIENT_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ END-TO-END TEST PASSED!"
    echo ""
    echo "Phase 2 Complete: P2P Inference Working"
    echo ""
    exit 0
else
    echo ""
    echo "❌ END-TO-END TEST FAILED"
    echo ""
    exit 1
fi
