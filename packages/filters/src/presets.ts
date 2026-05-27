// Built-in presets for Instagram-like and cinematic filters
import { AdjustmentParams } from '@camkit/types';

export const FILTER_PRESETS: Record<string, AdjustmentParams> = {
  cinematic: {
    exposure: 5,
    contrast: 15,
    saturation: 10,
    temperature: 15,
    tint: -5,
    shadows: -10,
    vignette: 20,
    sharpening: 15,
  },
  vintage: {
    exposure: -5,
    contrast: -15,
    saturation: -10,
    temperature: 25,
    tint: 10,
    shadows: 20,
    vignette: 30,
    clarity: 10,
  },
  bw: {
    contrast: 25,
    saturation: -100, // Monochrome
    highlights: -15,
    shadows: -5,
    vignette: 25,
    sharpening: 20,
  },
  retro: {
    exposure: 10,
    contrast: 10,
    saturation: 15,
    vibrance: 20,
    temperature: 10,
    shadows: 15,
    vignette: 15,
  },
  nordic: {
    exposure: 15,
    contrast: 5,
    saturation: -20,
    temperature: -20,
    tint: 5,
    highlights: 10,
    shadows: -5,
  },
  clarity_boost: {
    contrast: 5,
    sharpening: 35,
    clarity: 40,
    vibrance: 10,
  }
};

/**
 * Returns adjustment parameters for a built-in filter name.
 */
export function getPresetAdjustments(name: string): AdjustmentParams {
  return FILTER_PRESETS[name] || {};
}

/**
 * Lists all available built-in filter names.
 */
export function listPresets(): string[] {
  return Object.keys(FILTER_PRESETS);
}
