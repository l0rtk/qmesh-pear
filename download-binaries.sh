#!/bin/bash
# Download Pre-built llama-server Binaries for All Platforms
#
# Downloads official pre-built binaries from llama.cpp GitHub releases
# and places them in the correct bin/ directories for cross-platform support

set -e

# Configuration
BUILD_NUMBER="b7070"  # Latest as of Nov 15, 2025
BASE_URL="https://github.com/ggerganov/llama.cpp/releases/download/${BUILD_NUMBER}"
TEMP_DIR="./temp-binaries"

echo "🍐 QMesh Cross-Platform Binary Downloader"
echo "=========================================="
echo ""
echo "Build: ${BUILD_NUMBER}"
echo "Source: llama.cpp GitHub releases"
echo ""

# Create temp directory
mkdir -p "$TEMP_DIR"

# Function to download and extract binary
download_binary() {
    local platform=$1
    local zip_name=$2
    local bin_dir=$3
    local exe_name=$4
    local binary_path=$5  # Optional: custom path within ZIP

    echo "📥 Downloading ${platform}..."
    echo "   URL: ${BASE_URL}/${zip_name}"

    # Download
    wget -q --show-progress "${BASE_URL}/${zip_name}" -O "${TEMP_DIR}/${zip_name}"

    echo "   Extracting..."
    unzip -qo "${TEMP_DIR}/${zip_name}" -d "${TEMP_DIR}/${platform}"

    echo "   Installing to ${bin_dir}..."
    mkdir -p "${bin_dir}"

    # Use custom path if provided, otherwise default to build/bin/
    if [ -n "$binary_path" ]; then
        cp "${TEMP_DIR}/${platform}/${binary_path}" "${bin_dir}/${exe_name}"
    else
        cp "${TEMP_DIR}/${platform}/build/bin/${exe_name}" "${bin_dir}/${exe_name}"
    fi
    chmod +x "${bin_dir}/${exe_name}"

    # Verify
    local size=$(du -h "${bin_dir}/${exe_name}" | cut -f1)
    echo "   ✅ Installed: ${size}"
    echo ""
}

# Download for each platform
echo "Downloading binaries for all platforms..."
echo ""

# Linux x64 (Ubuntu, CPU-only)
download_binary \
    "linux-x64" \
    "llama-${BUILD_NUMBER}-bin-ubuntu-x64.zip" \
    "bin/linux-x64" \
    "llama-server"

# Copy required shared libraries for Linux
echo "   Copying required shared libraries..."
cp "${TEMP_DIR}/linux-x64/build/bin"/*.so* "bin/linux-x64/"
echo "   ✅ Shared libraries copied"

# macOS ARM64 (Apple Silicon with Metal)
download_binary \
    "darwin-arm64" \
    "llama-${BUILD_NUMBER}-bin-macos-arm64.zip" \
    "bin/darwin-arm64" \
    "llama-server"

# Copy required dynamic libraries for macOS ARM64
echo "   Copying required dynamic libraries..."
cp "${TEMP_DIR}/darwin-arm64/build/bin"/*.dylib "bin/darwin-arm64/" 2>/dev/null || true
echo "   ✅ Dynamic libraries copied"

# macOS x64 (Intel)
download_binary \
    "darwin-x64" \
    "llama-${BUILD_NUMBER}-bin-macos-x64.zip" \
    "bin/darwin-x64" \
    "llama-server"

# Copy required dynamic libraries for macOS x64
echo "   Copying required dynamic libraries..."
cp "${TEMP_DIR}/darwin-x64/build/bin"/*.dylib "bin/darwin-x64/" 2>/dev/null || true
echo "   ✅ Dynamic libraries copied"

# Windows x64 (CPU-only)
download_binary \
    "win32-x64" \
    "llama-${BUILD_NUMBER}-bin-win-cpu-x64.zip" \
    "bin/win32-x64" \
    "llama-server.exe" \
    "llama-server.exe"

# Copy required DLLs for Windows
echo "   Copying required DLLs..."
cp "${TEMP_DIR}/win32-x64"/*.dll "bin/win32-x64/"
echo "   ✅ DLLs copied"

# Cleanup
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"
echo ""

# Summary
echo "=========================================="
echo "✅ All binaries downloaded successfully!"
echo ""
echo "Platform binaries installed:"
echo "  Linux x64:     bin/linux-x64/llama-server"
echo "  macOS ARM64:   bin/darwin-arm64/llama-server"
echo "  macOS x64:     bin/darwin-x64/llama-server"
echo "  Windows x64:   bin/win32-x64/llama-server.exe"
echo ""
echo "Total binary size:"
du -sh bin/
echo ""
echo "Next steps:"
echo "  1. Test binaries (optional): ./bin/linux-x64/llama-server --version"
echo "  2. Re-stage to Pear: pear stage main"
echo "  3. Seed for 24/7 availability: pear seed main"
echo ""
