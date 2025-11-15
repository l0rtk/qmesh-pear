/**
 * Hardware Detection Module
 * Detects GPU type, system resources, and recommends appropriate models
 */

import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { statfs } from 'fs/promises';
import config from '../config/default.js';

const execAsync = promisify(exec);

/**
 * GPU types supported by node-llama-cpp
 */
export const GPUType = {
  METAL: 'metal',      // Apple Silicon (M1/M2/M3)
  CUDA: 'cuda',        // NVIDIA GPUs
  VULKAN: 'vulkan',    // AMD/Intel GPUs (future support)
  CPU: 'cpu',          // CPU-only fallback
};

/**
 * Detect GPU type and capabilities
 */
export async function detectGPU() {
  const platform = os.platform();
  const arch = os.arch();

  // macOS ARM64 - Assume Metal GPU
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      type: GPUType.METAL,
      name: 'Apple Silicon (Metal)',
      vram: await detectMetalVRAM(),
      layers: 33, // Recommended GPU layers for Metal
      available: true,
    };
  }

  // Linux/Windows - Check for NVIDIA CUDA
  if (platform === 'linux' || platform === 'win32') {
    const cudaInfo = await detectCUDA();
    if (cudaInfo.available) {
      return cudaInfo;
    }

    // TODO: Add Vulkan detection for AMD/Intel GPUs
    // For now, fall back to CPU
  }

  // CPU fallback
  return {
    type: GPUType.CPU,
    name: 'CPU Only',
    vram: 0,
    layers: 0, // No GPU layers
    available: false,
  };
}

/**
 * Detect NVIDIA CUDA GPU
 */
async function detectCUDA() {
  try {
    // Check if nvidia-smi is available
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');

    const lines = stdout.trim().split('\n');
    if (lines.length > 0) {
      const [name, vramMB] = lines[0].split(',').map(s => s.trim());

      return {
        type: GPUType.CUDA,
        name: `NVIDIA ${name}`,
        vram: parseInt(vramMB) / 1024, // Convert MB to GB
        layers: 33, // Recommended GPU layers for CUDA
        available: true,
      };
    }
  } catch (error) {
    // nvidia-smi not found or failed
  }

  return {
    type: GPUType.CPU,
    name: 'CPU Only',
    vram: 0,
    layers: 0,
    available: false,
  };
}

/**
 * Detect Apple Metal VRAM (estimate based on chip)
 */
async function detectMetalVRAM() {
  const totalRAM = os.totalmem() / (1024 ** 3); // Convert to GB

  // Apple Silicon shares RAM between CPU and GPU
  // Estimate: M1/M2/M3 can use ~70% of RAM for GPU
  // Conservative estimate: use 50% for safety
  return totalRAM * 0.5;
}

/**
 * Get system memory information
 */
export function getSystemMemory() {
  const totalRAM = os.totalmem() / (1024 ** 3); // GB
  const freeRAM = os.freemem() / (1024 ** 3);   // GB
  const usedRAM = totalRAM - freeRAM;

  return {
    total: totalRAM,
    free: freeRAM,
    used: usedRAM,
    usedPercent: (usedRAM / totalRAM) * 100,
  };
}

/**
 * Get available disk space in models directory
 */
export async function getDiskSpace(path = config.model.defaultPath) {
  try {
    const stats = await statfs(path);
    const availableGB = (stats.bavail * stats.bsize) / (1024 ** 3);
    const totalGB = (stats.blocks * stats.bsize) / (1024 ** 3);

    return {
      available: availableGB,
      total: totalGB,
      usedPercent: ((totalGB - availableGB) / totalGB) * 100,
    };
  } catch (error) {
    // If models directory doesn't exist, check root filesystem
    return {
      available: 0,
      total: 0,
      usedPercent: 0,
    };
  }
}

/**
 * Get CPU information
 */
export function getCPUInfo() {
  const cpus = os.cpus();

  return {
    model: cpus[0]?.model || 'Unknown',
    cores: cpus.length,
    speed: cpus[0]?.speed || 0,
  };
}

/**
 * Recommend model based on hardware capabilities
 */
export function recommendModel(gpu, memory) {
  const { recommendations } = config.hardware;

  // High-end: GPU with 8GB+ VRAM
  if (gpu.available && gpu.vram >= recommendations.highEnd.vram) {
    return {
      tier: 'high-end',
      models: recommendations.highEnd.models,
      reason: `Your ${gpu.name} (${gpu.vram.toFixed(1)}GB VRAM) can handle larger models`,
    };
  }

  // Mid-range: GPU with 4-8GB VRAM
  if (gpu.available && gpu.vram >= recommendations.midRange.vram) {
    return {
      tier: 'mid-range',
      models: recommendations.midRange.models,
      reason: `Your ${gpu.name} (${gpu.vram.toFixed(1)}GB VRAM) is good for medium models`,
    };
  }

  // Low-end: CPU or low VRAM
  // Also check if we have enough system RAM (>= 8GB for 1B models)
  if (memory.total >= 8) {
    return {
      tier: 'low-end',
      models: recommendations.lowEnd.models,
      reason: 'CPU-only mode - smaller models recommended',
    };
  }

  // Very limited hardware
  return {
    tier: 'minimal',
    models: ['qwen-0.5b-q4'],
    reason: 'Limited RAM - only smallest models supported',
  };
}

/**
 * Check if hardware meets minimum requirements
 */
export function checkMinimumRequirements(memory, disk) {
  const errors = [];
  const warnings = [];

  // Check RAM
  if (memory.total < config.hardware.minRamGB) {
    errors.push(`Insufficient RAM: ${memory.total.toFixed(1)}GB (minimum ${config.hardware.minRamGB}GB required)`);
  } else if (memory.total < 8) {
    warnings.push(`Low RAM: ${memory.total.toFixed(1)}GB - smaller models recommended`);
  }

  // Check disk space
  if (disk.available < config.hardware.minDiskSpaceGB) {
    errors.push(`Insufficient disk space: ${disk.available.toFixed(1)}GB (minimum ${config.hardware.minDiskSpaceGB}GB required)`);
  } else if (disk.available < 20) {
    warnings.push(`Low disk space: ${disk.available.toFixed(1)}GB - limited model storage`);
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Comprehensive hardware detection
 * Returns all hardware information and recommendations
 */
export async function detectHardware() {
  const gpu = await detectGPU();
  const memory = getSystemMemory();
  const disk = await getDiskSpace();
  const cpu = getCPUInfo();
  const requirements = checkMinimumRequirements(memory, disk);
  const recommendation = recommendModel(gpu, memory);

  return {
    gpu,
    memory,
    disk,
    cpu,
    requirements,
    recommendation,
    summary: {
      platform: `${os.platform()} ${os.arch()}`,
      gpuType: gpu.type,
      gpuLayers: gpu.layers,
      totalRAM: memory.total.toFixed(1),
      availableDisk: disk.available.toFixed(1),
      recommendedTier: recommendation.tier,
    },
  };
}

/**
 * Print hardware information (for CLI)
 */
export function printHardwareInfo(hardware) {
  console.log('\n🔍 Hardware Detection Results:\n');

  // GPU
  const gpuIcon = hardware.gpu.available ? '✅' : '❌';
  console.log(`  GPU: ${gpuIcon} ${hardware.gpu.name}`);
  if (hardware.gpu.available) {
    console.log(`       VRAM: ${hardware.gpu.vram.toFixed(1)}GB`);
    console.log(`       GPU Layers: ${hardware.gpu.layers}`);
  }

  // CPU
  console.log(`  CPU: ${hardware.cpu.cores} cores (${hardware.cpu.model})`);

  // Memory
  console.log(`  RAM: ${hardware.memory.total.toFixed(1)}GB total, ${hardware.memory.free.toFixed(1)}GB free`);

  // Disk
  console.log(`  Disk: ${hardware.disk.available.toFixed(1)}GB available`);

  // Requirements check
  if (!hardware.requirements.passed) {
    console.log('\n⚠️  Hardware Requirements:');
    hardware.requirements.errors.forEach(err => {
      console.log(`  ❌ ${err}`);
    });
  }

  if (hardware.requirements.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    hardware.requirements.warnings.forEach(warn => {
      console.log(`  ⚠️  ${warn}`);
    });
  }

  // Recommendations
  console.log(`\n💡 Recommended Models (${hardware.recommendation.tier}):`);
  console.log(`   ${hardware.recommendation.reason}`);
  hardware.recommendation.models.forEach(model => {
    console.log(`   • ${model}`);
  });

  console.log('');
}

export default {
  detectGPU,
  detectHardware,
  getSystemMemory,
  getDiskSpace,
  getCPUInfo,
  recommendModel,
  checkMinimumRequirements,
  printHardwareInfo,
  GPUType,
};
