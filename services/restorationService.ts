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
 * Advanced local colorizer mimicking Python-based models (OpenCV Caffe & PaddleHub GAN).
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
        
        // Semantic map for localized color injection
        const entropyMap = new Float32Array(width * height);
        for (let y = 1; y < height - 1; y += 2) {
          for (let x = 1; x < width - 1; x += 2) {
            const idx = (y * width + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
            const neighbors = (data[((y-1)*width + x)*4] + data[((y+1)*width + x)*4]) / 2;
            entropyMap[y * width + x] = Math.abs(lum - neighbors);
          }
        }

        for (let y = 0; y < height; y++) {
          const yPos = y / height;
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const lum = (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]) / 255;
            const entropy = entropyMap[y * width + x] || 10;

            let r = lum, g = lum, b = lum;

            // Engine Specific Bias
            if (engine === 'opencv') {
              // OpenCV Caffe bias: Richer skin tones (R+) and sky (B+)
              r = lum * 1.12; g = lum * 0.98; b = lum * 1.05;
            } else if (engine === 'paddlehub') {
              // PaddleHub GAN bias: Higher dynamic range simulation
              const edgeBoost = entropy > 20 ? 1.1 : 1.0;
              r = lum * edgeBoost; g = lum * 1.1 * edgeBoost; b = lum * 0.95;
            }

            // Semantic Colorization Simulation
            if (yPos < 0.4 && lum > 0.5) { // Sky
              b *= 1.4; g *= 1.1;
            } else if (yPos > 0.6 && entropy > 15) { // Foliage/Ground
              g *= 1.3; r *= 1.1;
            } else if (lum > 0.3 && lum < 0.8) { // Mids/Faces
              r *= 1.25; g *= 1.1;
            }

            // Apply Grading
            if (grading === 'artistic') {
              r *= 1.2; g *= 1.1; b *= 1.3;
            } else if (grading === 'stable') {
              r = r * 0.95 + 0.02; g = g * 0.95 + 0.02; b = b * 0.95 + 0.02;
            } else if (grading === 'cinematic') {
              r *= 1.1; b *= 1.2;
            } else if (grading === 'vintage') {
              r += 0.05; g += 0.02;
            }

            // Global adjustments
            const tOffset = temp / 1000;
            r += tOffset; b -= tOffset;

            // Intensity Blend
            const fR = (data[i]/255) * (1-intensity) + r * intensity;
            const fG = (data[i+1]/255) * (1-intensity) + g * intensity;
            const fB = (data[i+2]/255) * (1-intensity) + b * intensity;

            // Final Contrast/Saturation
            let cR = ((fR - 0.5) * contrast) + 0.5;
            let cG = ((fG - 0.5) * contrast) + 0.5;
            let cB = ((fB - 0.5) * contrast) + 0.5;

            const finalLum = 0.299 * cR + 0.587 * cG + 0.114 * cB;
            data[i] = Math.min(255, Math.max(0, (finalLum + (cR - finalLum) * saturation) * 255));
            data[i+1] = Math.min(255, Math.max(0, (finalLum + (cG - finalLum) * saturation) * 255));
            data[i+2] = Math.min(255, Math.max(0, (finalLum + (cB - finalLum) * saturation) * 255));
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL(mimeType, 0.95));
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