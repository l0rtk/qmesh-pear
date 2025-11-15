#!/bin/bash

# Full P2P Test Script
# Runs both peers and verifies communication

echo "🧪 QMesh P2P Communication Test"
echo "================================"
echo ""

# Change to project directory
cd /home/luka/qmesh/qmesh-pear

# Kill any existing peers
pkill -f "test-p2p-peer" 2>/dev/null

echo "Step 1: Starting Peer 1 (Discovery Node)..."
pear run --dev test-p2p-peer1.js > /tmp/peer1.log 2>&1 &
PEER1_PID=$!
echo "  Peer 1 PID: $PEER1_PID"

# Wait for peer 1 to be ready
sleep 3
echo "  ✅ Peer 1 started"
echo ""

echo "Step 2: Starting Peer 2 (Client Node)..."
echo "  Peer 2 will connect, send message, receive response, and exit"
echo ""

# Run peer 2 (will auto-exit on success)
timeout 35 pear run --dev test-p2p-peer2.js 2>&1
PEER2_EXIT=$?

echo ""
echo "================================"

# Check results
if [ $PEER2_EXIT -eq 0 ]; then
    echo "✅ P2P Test PASSED!"
    echo "   - Hyperswarm works in Bare Runtime"
    echo "   - Peers discovered each other"
    echo "   - Messages exchanged successfully"
else
    echo "❌ P2P Test FAILED (exit code: $PEER2_EXIT)"
    echo ""
    echo "Peer 1 log:"
    cat /tmp/peer1.log
fi

# Cleanup
echo ""
echo "Cleaning up..."
kill $PEER1_PID 2>/dev/null
wait $PEER1_PID 2>/dev/null
pkill -f "test-p2p-peer" 2>/dev/null
rm -f /tmp/peer1.log

echo "Done!"
exit $PEER2_EXIT
