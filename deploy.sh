#!/bin/bash
# QMesh Pear Deployment Script
#
# Stages, seeds, and releases QMesh to the Pear DHT

set -e

echo "🍐 QMesh Pear Deployment"
echo "========================"
echo ""

# Step 1: Stage
echo "📦 Step 1: Staging to Pear DHT..."
echo ""
pear stage main

echo ""
echo "✅ Staged successfully!"
echo ""

# Step 2: Seed (optional - run in background)
read -p "🌱 Step 2: Start seeding? This keeps the app available 24/7 (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting seed in background..."
    nohup pear seed main > pear-seed.log 2>&1 &
    SEED_PID=$!
    echo "  Seeding PID: $SEED_PID"
    echo "  Log: pear-seed.log"
    echo "  To stop: kill $SEED_PID"
    echo ""
    echo "✅ Seeding started!"
else
    echo "⏭️  Skipping seeding (app only available while you're online)"
fi

echo ""

# Step 3: Release
read -p "🚀 Step 3: Mark as production release? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Releasing..."
    pear release main
    echo ""
    echo "✅ Released to production!"
else
    echo "⏭️  Skipping release (still in development)"
fi

echo ""
echo "========================"
echo "🎉 Deployment Complete!"
echo ""
echo "Your QMesh worker is now available at:"
echo "  pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo"
echo ""
echo "Others can run it with:"
echo "  pear run pear://4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo"
echo ""
echo "Note: They'll need to download the model manually first:"
echo "  wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
echo "  mv tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf ~/.pear/4dfwqfqmm7absua31rez3mq3whhpg4zkfhkf7qruyms8hrbhhejo/models/"
echo ""
