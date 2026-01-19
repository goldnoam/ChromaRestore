/**
 * Advanced Local Image Processor v3.0
 * Performs context-aware adaptive chroma restoration directly in the browser.
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
      
      // Calculate color offsets based on "Temperature"
      const rOffset = temp > 0 ? temp * 0.35 : temp * 0.1;
      const bOffset = temp < 0 ? Math.abs(temp) * 0.45 : -temp * 0.15;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          // 1. Calculate Perceptual Luminance
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const nL = lum / 255; // Normalized Luminance
          const nY = y / height; // Normalized Y position (0 at top, 1 at bottom)
          const nX = x / width;  // Normalized X position

          // 2. Position-Aware Heuristic Mapping
          let targetR = lum;
          let targetG = lum;
          let targetB = lum;

          // Adaptive Logic
          if (nL < 0.15) {
            // Deep Shadows: Cool & Muted
            targetR = lum * 0.85;
            targetG = lum * 0.9;
            targetB = lum * 1.15;
          } else if (nY < 0.35 && nL > 0.4) {
            // Likely SKY (Top part, relatively bright)
            // Shift towards Sky Blue
            targetR = lum * 0.85;
            targetG = lum * 0.95;
            targetB = lum * 1.4;
          } else if (nY > 0.7 && nL < 0.6) {
            // Likely GROUND (Bottom part, darker/mid)
            // Shift towards Earthy Green/Brown
            targetR = lum * 1.1;
            targetG = lum * 1.25;
            targetB = lum * 0.9;
          } else if (nL > 0.3 && nL < 0.8) {
            // Likely SUBJECTS (Mid-tones, center or general)
            // Shift towards Warm/Skin/Natural tones
            const distFromCenter = Math.sqrt(Math.pow(nX - 0.5, 2) + Math.pow(nY - 0.5, 2));
            const centerWeight = Math.max(0, 1 - distFromCenter * 1.5);
            
            // Boost warmth in the center (skin tones)
            targetR = lum * (1.25 + centerWeight * 0.15);
            targetG = lum * (1.05 + centerWeight * 0.05);
            targetB = lum * (0.85 - centerWeight * 0.1);
          } else {
            // Highlights: Crisp white with very slight warmth
            targetR = lum * 1.05;
            targetG = lum * 1.03;
            targetB = lum * 1.0;
          }

          // 3. Global Color Blend & Temp Overrides
          let finalR = r * (1 - intensity) + (targetR + rOffset) * intensity;
          let finalG = g * (1 - intensity) + targetG * intensity;
          let finalB = b * (1 - intensity) + (targetB + bOffset) * intensity;

          // 4. Contrast Adjustment (Pivot around 128)
          finalR = ((finalR - 128) * contrast) + 128;
          finalG = ((finalG - 128) * contrast) + 128;
          finalB = ((finalB - 128) * contrast) + 128;

          // 5. Saturation Enhancement (HSL-like logic)
          const finalLum = 0.299 * finalR + 0.587 * finalG + 0.114 * finalB;
          finalR = finalLum + (finalR - finalLum) * saturation;
          finalG = finalLum + (finalG - finalLum) * saturation;
          finalB = finalLum + (finalB - finalLum) * saturation;

          // Clamp and assign
          data[i] = Math.max(0, Math.min(255, finalR));
          data[i + 1] = Math.max(0, Math.min(255, finalG));
          data[i + 2] = Math.max(0, Math.min(255, finalB));
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
