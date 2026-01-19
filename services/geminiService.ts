/**
 * Advanced Local Image Processor v4.0 - Semantic Simulation
 * Performs context-aware restoration using local variance analysis to detect "sub-elements".
 */

export interface RestoreConfig {
  temp: number;       // -100 to 100
  saturation: number; // 0 to 2
  contrast: number;   // 0.5 to 1.5
  intensity: number;  // 0 to 1
}

export async function processImageLocally(
  base64Data: string, 
  mimeType: string,
  config: RestoreConfig = { temp: 15, saturation: 1.25, contrast: 1.15, intensity: 1.0 }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;

      const { temp, saturation, contrast, intensity } = config;
      
      // Pre-calculate Temperature biases
      const rTemp = temp > 0 ? temp * 0.4 : temp * 0.1;
      const bTemp = temp < 0 ? Math.abs(temp) * 0.5 : -temp * 0.2;

      // Temporary buffer for variance to detect "texture" (sub-elements)
      const varianceBuffer = new Float32Array(width * height);
      
      // Fast Variance Pass (Approximate local detail)
      for (let y = 1; y < height - 1; y += 2) {
        for (let x = 1; x < width - 1; x += 2) {
          const idx = (y * width + x) * 4;
          const center = data[idx];
          const right = data[idx + 4];
          const down = data[idx + width * 4];
          const diff = Math.abs(center - right) + Math.abs(center - down);
          varianceBuffer[y * width + x] = diff / 255;
        }
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
          const nL = lum / 255;
          const nY = y / height;
          const nX = x / width;
          const localDetail = varianceBuffer[y * width + x] || 0.1;

          let targetR = lum;
          let targetG = lum;
          let targetB = lum;

          // SEMANTIC LOGIC: Determine sub-element based on position, luminance, AND detail density
          if (nL < 0.12) {
            // Shadow Detail: Deep Cool Tones
            targetR = lum * 0.8; targetG = lum * 0.85; targetB = lum * 1.1;
          } else if (nY < 0.4 && localDetail < 0.05 && nL > 0.45) {
            // SKY: High position, low detail, high brightness
            targetR = lum * 0.8; targetG = lum * 0.9; targetB = lum * 1.5;
          } else if (localDetail > 0.15 && nL < 0.7) {
            // TEXTURE (Foliage/Fabric/Sub-elements): High detail density
            // Green/Yellow shift for organic feel
            targetR = lum * 1.1; targetG = lum * 1.35; targetB = lum * 0.85;
          } else if (nL > 0.3 && nL < 0.85) {
            // SUBJECT/SKIN: Mid-tones with moderate detail
            const dist = Math.sqrt(Math.pow(nX - 0.5, 2) + Math.pow(nY - 0.4, 2));
            const focus = Math.max(0, 1 - dist * 1.4);
            targetR = lum * (1.3 + focus * 0.2); 
            targetG = lum * (1.1 + focus * 0.05); 
            targetB = lum * (0.9 - focus * 0.1);
          } else {
            // HIGHLIGHTS: Clean white
            targetR = lum * 1.05; targetG = lum * 1.05; targetB = lum;
          }

          // Blending Logic: Intensity is now a "Confidence" scalar
          // Higher intensity makes the "Semantic Choice" more pronounced
          const mix = intensity * (0.8 + localDetail * 0.4); 
          let finalR = data[i] * (1 - mix) + (targetR + rTemp) * mix;
          let finalG = data[i+1] * (1 - mix) + (targetG) * mix;
          let finalB = data[i+2] * (1 - mix) + (targetB + bTemp) * mix;

          // Post-processing: Contrast (pivoted at 128)
          finalR = ((finalR - 128) * contrast) + 128;
          finalG = ((finalG - 128) * contrast) + 128;
          finalB = ((finalB - 128) * contrast) + 128;

          // Saturation
          const finalLum = 0.299 * finalR + 0.587 * finalG + 0.114 * finalB;
          const satBase = 1.0 + (saturation - 1.0) * (intensity * 1.2);
          finalR = finalLum + (finalR - finalLum) * satBase;
          finalG = finalLum + (finalG - finalLum) * satBase;
          finalB = finalLum + (finalB - finalLum) * satBase;

          data[i] = Math.max(0, Math.min(255, finalR));
          data[i+1] = Math.max(0, Math.min(255, finalG));
          data[i+2] = Math.max(0, Math.min(255, finalB));
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL(mimeType, 0.95));
    };

    img.onerror = () => reject(new Error("Failed to load image for processing"));
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
