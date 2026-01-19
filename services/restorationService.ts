import { GradingPreset, EngineType } from '../types';

export interface RestoreConfig {
  temp: number;
  saturation: number;
  contrast: number;
  intensity: number;
  grading: GradingPreset;
  engine: EngineType;
}

/**
 * Advanced local colorizer mimicking professional AI models.
 * Engine 'opencv' mimics Caffe-based LAB color space prediction.
 * Engine 'paddlehub' mimics GAN-based (DeOldify) edge-aware and semantic restoration.
 */
export async function processImageLocally(
  base64Data: string, 
  mimeType: string,
  config: RestoreConfig
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas context initialization failed.");

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        const { temp, saturation, contrast, intensity, grading, engine } = config;
        
        // 1. Structural and Semantic Map (Simulation of Neural Net attention)
        // We calculate local variance (entropy) and global position
        const entropyMap = new Float32Array(width * height);
        const lumMap = new Float32Array(width * height);
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const lum = (0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2]) / 255;
            lumMap[y * width + x] = lum;
          }
        }

        // Fast Entropy approximation
        for (let y = 1; y < height - 1; y += 2) {
          for (let x = 1; x < width - 1; x += 2) {
            const idx = y * width + x;
            const diff = Math.abs(lumMap[idx] - lumMap[idx + 1]) + Math.abs(lumMap[idx] - lumMap[idx + width]);
            entropyMap[idx] = diff;
          }
        }

        // 2. Colorization Loop
        for (let y = 0; y < height; y++) {
          const yPos = y / height;
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const lum = lumMap[y * width + x];
            const entropy = entropyMap[y * width + x] || 0.05;
            const xPos = x / width;

            let r = lum, g = lum, b = lum;

            // Semantic Color Injections (Simulating Class-aware restoration)
            // PaddleHub (GAN) is more aggressive with saturation in high-texture areas
            // OpenCV (Caffe) is smoother and more conservative
            
            let colorWeight = 1.0;
            if (engine === 'paddlehub') {
              // GAN style: Edge-aware contrast and vivid environmental colors
              colorWeight = 1.25;
              const textureBoost = entropy > 0.1 ? 1.15 : 1.0;
              
              if (yPos < 0.45 && lum > 0.35) { // Potential Sky
                r = lum * 0.7; g = lum * 0.9; b = lum * 1.6 * textureBoost;
              } else if (entropy > 0.15 && yPos > 0.4) { // Potential Vegetation/Clothing
                r = lum * 0.9; g = lum * 1.45 * textureBoost; b = lum * 0.75;
              } else if (lum > 0.25 && lum < 0.85) { // Potential Human Subjects
                r = lum * 1.5 * textureBoost; g = lum * 1.15; b = lum * 0.9;
              } else {
                r = lum * 1.1; g = lum * 1.05; b = lum * 0.95;
              }
            } else if (engine === 'opencv') {
              // Neural Caffe style: Consistent warm skin tones and cool backgrounds
              colorWeight = 1.1;
              if (lum > 0.4 && lum < 0.9) { // High confidence subjects
                r = lum * 1.3; g = lum * 1.1; b = lum * 0.95;
              } else if (yPos < 0.35) { // Background/Sky
                r = lum * 0.85; g = lum * 0.95; b = lum * 1.25;
              } else { // Generic
                r = lum * 1.05; g = lum * 1.0; b = lum * 0.98;
              }
            } else {
              // Local heuristic: Simple gradient mapping
              r = lum * 1.15; g = lum * 1.05; b = lum * 0.9;
            }

            // Apply Global Temperature (Warm/Cool)
            const tOffset = temp / 800;
            r += tOffset; b -= tOffset;

            // Blend with original grayscale based on intensity
            let fR = (data[i]/255) * (1 - intensity) + r * intensity;
            let fG = (data[i+1]/255) * (1 - intensity) + g * intensity;
            let fB = (data[i+2]/255) * (1 - intensity) + b * intensity;

            // 3. Apply Grading Presets
            if (grading === 'artistic') {
              fR *= 1.25; fB *= 1.35; fG *= 1.1;
            } else if (grading === 'stable') {
              fR = fR * 0.9 + 0.05; fG = fG * 0.9 + 0.05; fB = fB * 0.9 + 0.05;
            } else if (grading === 'cinematic') {
              fR *= 1.1; fB *= 1.3; fG *= 0.95;
            } else if (grading === 'vibrant') {
              fR *= 1.3; fG *= 1.3; fB *= 1.3;
            } else if (grading === 'vintage') {
              fR += 0.08; fG += 0.04; fB -= 0.02;
            } else if (grading === 'sepia') {
              const grey = (fR + fG + fB) / 3;
              fR = grey + 0.15; fG = grey + 0.08; fB = grey;
            }

            // 4. Final Contrast and Saturation Pass
            // Contrast adjustment
            fR = ((fR - 0.5) * contrast) + 0.5;
            fG = ((fG - 0.5) * contrast) + 0.5;
            fB = ((fB - 0.5) * contrast) + 0.5;

            // Saturation adjustment (Luminance preserving)
            const finalLum = 0.299 * fR + 0.587 * fG + 0.114 * fB;
            const s = saturation * colorWeight;
            data[i] = Math.min(255, Math.max(0, (finalLum + (fR - finalLum) * s) * 255));
            data[i+1] = Math.min(255, Math.max(0, (finalLum + (fG - finalLum) * s) * 255));
            data[i+2] = Math.min(255, Math.max(0, (finalLum + (fB - finalLum) * s) * 255));
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL(mimeType, 0.92));
      } catch (e: any) {
        reject(e);
      }
    };
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
}

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
};