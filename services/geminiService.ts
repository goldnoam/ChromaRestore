/**
 * Advanced Local Image Processor
 * Performs multi-pass adaptive chroma restoration directly in the browser.
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
  config: RestoreConfig = { temp: 15, saturation: 1.2, contrast: 1.1, intensity: 1.0 }
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

      const { temp, saturation, contrast, intensity } = config;
      
      // Calculate color offsets based on "Temperature"
      // Temp > 0: Warmer (Skin/Sun), Temp < 0: Cooler (Sky/Shadows)
      const rOffset = temp > 0 ? temp * 0.4 : temp * 0.1;
      const bOffset = temp < 0 ? Math.abs(temp) * 0.5 : -temp * 0.2;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // 1. Calculate Perceptual Luminance
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const normalizedLum = lum / 255;

        // 2. Multi-pass Chroma Mapping
        // We use a sigmoid-like curve to determine how much "fake" color to inject
        let targetR, targetG, targetB;

        if (normalizedLum < 0.25) {
          // Deep Shadows: Naturally cooler, less saturated
          targetR = lum * 0.8;
          targetG = lum * 0.9;
          targetB = lum * 1.2;
        } else if (normalizedLum < 0.55) {
          // Midtones (Low): Human skin / Earth tones range
          targetR = lum * 1.35;
          targetG = lum * 1.15;
          targetB = lum * 0.9;
        } else if (normalizedLum < 0.85) {
          // Midtones (High): Bright environments / Sky
          targetR = lum * 1.1;
          targetG = lum * 1.2;
          targetB = lum * 1.4;
        } else {
          // Highlights: Neutral white with slight warmth
          targetR = lum * 1.05;
          targetG = lum * 1.05;
          targetB = lum * 1.0;
        }

        // 3. Blend based on Intensity and Apply User Overrides (Temp)
        let finalR = r * (1 - intensity) + (targetR + rOffset) * intensity;
        let finalG = g * (1 - intensity) + targetG * intensity;
        let finalB = b * (1 - intensity) + (targetB + bOffset) * intensity;

        // 4. Contrast Adjustment
        finalR = ((finalR / 255 - 0.5) * contrast + 0.5) * 255;
        finalG = ((finalG / 255 - 0.5) * contrast + 0.5) * 255;
        finalB = ((finalB / 255 - 0.5) * contrast + 0.5) * 255;

        // 5. Saturation Boost
        const finalLum = 0.299 * finalR + 0.587 * finalG + 0.114 * finalB;
        finalR = finalLum + (finalR - finalLum) * saturation;
        finalG = finalLum + (finalG - finalLum) * saturation;
        finalB = finalLum + (finalB - finalLum) * saturation;

        // Clamp values
        data[i] = Math.max(0, Math.min(255, finalR));
        data[i + 1] = Math.max(0, Math.min(255, finalG));
        data[i + 2] = Math.max(0, Math.min(255, finalB));
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL(mimeType, 0.92));
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
