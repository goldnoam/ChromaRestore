import { GradingPreset } from '../types';

export interface RestoreConfig {
  temp: number;
  saturation: number;
  contrast: number;
  intensity: number;
  grading: GradingPreset;
}

/**
 * Advanced local colorizer mimicking professional restoration models.
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

        const { temp, saturation, contrast, intensity, grading } = config;
        
        // 1. Structural and Semantic Map
        const lumMap = new Float32Array(width * height);
        const entropyMap = new Float32Array(width * height);
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const lum = (0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2]) / 255;
            lumMap[y * width + x] = lum;
          }
        }

        // Fast Entropy approximation for texture detection
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

            let r = lum, g = lum, b = lum;
            
            // Semantic Color Injections
            let colorWeight = 1.2;
            const textureBoost = entropy > 0.1 ? 1.1 : 1.0;
            
            if (yPos < 0.45 && lum > 0.35) { // Potential Sky
              r = lum * 0.75; g = lum * 0.9; b = lum * 1.5 * textureBoost;
            } else if (entropy > 0.15 && yPos > 0.4) { // Potential Vegetation/Clothing
              r = lum * 0.85; g = lum * 1.35 * textureBoost; b = lum * 0.8;
            } else if (lum > 0.25 && lum < 0.85) { // Potential Human Subjects
              r = lum * 1.4 * textureBoost; g = lum * 1.1; b = lum * 0.9;
            } else {
              r = lum * 1.1; g = lum * 1.05; b = lum * 0.95;
            }

            // Apply Global Temperature
            const tOffset = temp / 800;
            r += tOffset; b -= tOffset;

            // Blend with original grayscale based on intensity
            let fR = (data[i]/255) * (1 - intensity) + r * intensity;
            let fG = (data[i+1]/255) * (1 - intensity) + g * intensity;
            let fB = (data[i+2]/255) * (1 - intensity) + b * intensity;

            // 3. Apply Grading Presets
            if (grading === 'artistic') {
              fR *= 1.2; fB *= 1.3; fG *= 1.1;
            } else if (grading === 'stable') {
              fR = fR * 0.95 + 0.02; fG = fG * 0.95 + 0.02; fB = fB * 0.95 + 0.02;
            } else if (grading === 'cinematic') {
              fR *= 1.1; fB *= 1.25; fG *= 0.95;
            } else if (grading === 'vibrant') {
              fR *= 1.25; fG *= 1.25; fB *= 1.25;
            } else if (grading === 'vintage') {
              fR += 0.05; fG += 0.02; fB -= 0.02;
            } else if (grading === 'sepia') {
              const grey = (fR + fG + fB) / 3;
              fR = grey + 0.12; fG = grey + 0.06; fB = grey;
            }

            // 4. Final Contrast and Saturation Pass
            fR = ((fR - 0.5) * contrast) + 0.5;
            fG = ((fG - 0.5) * contrast) + 0.5;
            fB = ((fB - 0.5) * contrast) + 0.5;

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