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
 * Advanced local colorizer that performs structural analysis on the image.
 * Mimics Neural Net (OpenCV Caffe) and GAN (PaddleHub) behaviors using JS-native processing.
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
        
        // 1. Structural Analysis - Create an entropy/luminance map to guide color injection
        const entropyMap = new Float32Array(width * height);
        const sampleStep = width > 1200 ? 2 : 1; 
        
        for (let y = 1; y < height - 1; y += sampleStep) {
          for (let x = 1; x < width - 1; x += sampleStep) {
            const idx = (y * width + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
            const neighbors = (
              data[((y-1)*width + x)*4] + 
              data[((y+1)*width + x)*4] + 
              data[(y*width + (x-1))*4] + 
              data[(y*width + (x+1))*4]
            ) / 4;
            entropyMap[y * width + x] = Math.abs(lum - neighbors);
          }
        }

        // 2. Engine-Specific Weightings
        // Mimic 'colorization_deploy_v2.prototxt' / 'colorization_release_v2.caffemodel' (OpenCV)
        // Mimic 'PaddleHub' GAN edge-awareness
        let weightR = 1.0, weightG = 1.0, weightB = 1.0;
        
        if (engine === 'opencv') {
          // OpenCV neural models often emphasize warm skin tones and cool backgrounds
          weightR = 1.15; weightG = 0.95; weightB = 0.9;
        } else if (engine === 'paddlehub') {
          // GAN models like PaddleHub DeOldify emphasize edge contrast and vibrant environmental hues
          weightR = 1.05; weightG = 1.2; weightB = 1.1;
        }

        // 3. Adaptive Pixel Mapping
        for (let y = 0; y < height; y++) {
          const yPos = y / height;
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i+1], b = data[i+2];
            
            // Current grayscale luminance
            const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const entropy = entropyMap[y * width + x] || 10;
            const xPos = x / width;

            let tR = L, tG = L, tB = L;

            // Semantic Simulation Logic
            if (L < 0.1) {
              // Deep Shadows
              tR = L * 0.8 * weightR; tG = L * 0.85 * weightG; tB = L * 1.3 * weightB;
            } else if (yPos < 0.45 && entropy < 15 && L > 0.4) {
              // Sky Detection Simulation
              const horizonWeight = yPos / 0.45;
              tR = L * (0.6 + horizonWeight * 0.2) * weightR; 
              tG = L * (0.8 + horizonWeight * 0.1) * weightG; 
              tB = L * 1.6 * weightB;
            } else if (entropy > 25 && L < 0.7 && yPos > 0.3) {
              // Foliage/Textile Detection Simulation
              tR = L * 0.9 * weightR; tG = L * 1.4 * weightG; tB = L * 0.7 * weightB;
            } else if (L > 0.25 && L < 0.85 && xPos > 0.2 && xPos < 0.8) {
              // Skin Tone/Central Object Simulation
              tR = L * 1.35 * weightR; tG = L * 1.1 * weightG; tB = L * 0.9 * weightB;
            } else {
              // Neutral Mids
              tR = L * 1.05 * weightR; tG = L * 1.02 * weightG; tB = L * 0.95 * weightB;
            }

            // PaddleHub GAN Boost: Enhance edges with generative vibrancy
            if (engine === 'paddlehub') {
              const boost = entropy > 30 ? 1.15 : 1.0;
              tR *= boost; tG *= boost; tB *= boost;
            }

            // Apply Intensity Blend
            let fR = (r / 255) * (1 - intensity) + tR * intensity;
            let fG = (g / 255) * (1 - intensity) + tG * intensity;
            let fB = (b / 255) * (1 - intensity) + tB * intensity;

            // Global Temperature Offset
            const tOffset = temp / 500;
            fR += tOffset; 
            fB -= tOffset;

            // 4. Grading Presets
            if (grading === 'cinematic') {
              fR *= 1.15; fG *= 0.95; fB *= 0.9; 
            } else if (grading === 'vintage') {
              fR += 0.05; fG += 0.02; fB -= 0.03;
            } else if (grading === 'vibrant' || grading === 'artistic') {
              const lumMax = Math.max(fR, fG, fB);
              const artisticFactor = grading === 'artistic' ? -0.4 : -0.2;
              fR += (fR - lumMax) * artisticFactor;
              fG += (fG - lumMax) * artisticFactor;
              fB += (fB - lumMax) * artisticFactor;
            } else if (grading === 'sepia') {
              const grey = (fR + fG + fB) / 3;
              fR = grey + 0.2; fG = grey + 0.1; fB = grey;
            } else if (grading === 'stable') {
              // Stable focuses on compression of dynamics for natural output
              fR = fR * 0.92 + 0.04;
              fG = fG * 0.92 + 0.04;
              fB = fB * 0.92 + 0.04;
            }

            // 5. Final Contrast and Saturation
            fR = ((fR - 0.5) * contrast) + 0.5;
            fG = ((fG - 0.5) * contrast) + 0.5;
            fB = ((fB - 0.5) * contrast) + 0.5;

            const currentLum = 0.299 * fR + 0.587 * fG + 0.114 * fB;
            fR = currentLum + (fR - currentLum) * saturation;
            fG = currentLum + (fG - currentLum) * saturation;
            fB = currentLum + (fB - currentLum) * saturation;

            data[i] = Math.min(255, Math.max(0, fR * 255));
            data[i+1] = Math.min(255, Math.max(0, fG * 255));
            data[i+2] = Math.min(255, Math.max(0, fB * 255));
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL(mimeType, 0.95));
      } catch (e: any) {
        reject(new Error(`Local engine failed: ${e.message}`));
      }
    };

    img.onerror = () => reject(new Error("Resource failed to load."));
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
}

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};