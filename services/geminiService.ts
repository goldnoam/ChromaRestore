
/**
 * Professional Image Restoration Engine
 * Powered by Gemini API for Semantic Colorization.
 */

import { GradingPreset } from '../types';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface RestoreConfig {
  temp: number;
  saturation: number;
  contrast: number;
  intensity: number;
  grading: GradingPreset;
}

/**
 * High-performance restoration engine.
 * Uses Gemini for initial base restoration and local canvas for tuning refinements.
 */
export async function processImageLocally(
  base64Data: string, 
  mimeType: string,
  config: RestoreConfig = { temp: 15, saturation: 1.25, contrast: 1.15, intensity: 1.0, grading: 'none' }
): Promise<string> {
  // Use Gemini 2.5 Flash Image for the actual restoration process
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: "Professionally colorize and restore this photograph. Retain historical accuracy. Output only the final image data.",
        },
      ],
    },
  });

  // Extract the restored image from Gemini response
  let restoredBase64 = base64Data;
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      restoredBase64 = part.inlineData.data;
      break;
    }
  }

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
        const { temp, saturation, contrast, intensity, grading } = config;
        
        // Temperature offsets
        const rTemp = temp > 0 ? temp * 0.4 : temp * 0.1;
        const bTemp = temp < 0 ? Math.abs(temp) * 0.4 : -temp * 0.1;

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i], g = data[i+1], b = data[i+2];

          // Tuning refinements
          r += rTemp * intensity;
          b += bTemp * intensity;

          // Contrast
          r = ((r - 128) * contrast) + 128;
          g = ((g - 128) * contrast) + 128;
          b = ((b - 128) * contrast) + 128;

          // Color Grading
          if (grading === 'cinematic') { r *= 1.1; b *= 0.95; }
          else if (grading === 'vintage') { b += 15 * intensity; r -= 5 * intensity; }
          else if (grading === 'vibrant') {
            const max = Math.max(r, g, b);
            r += (r - max) * 0.2 * intensity;
            g += (g - max) * 0.2 * intensity;
            b += (b - max) * 0.2 * intensity;
          } else if (grading === 'sepia') {
            const gray = (r + g + b) / 3;
            r = gray + 35 * intensity; g = gray + 15 * intensity; b = gray;
          }

          // Saturation adjustment
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          r = lum + (r - lum) * saturation;
          g = lum + (g - lum) * saturation;
          b = lum + (b - lum) * saturation;

          data[i] = Math.max(0, Math.min(255, r));
          data[i+1] = Math.max(0, Math.min(255, g));
          data[i+2] = Math.max(0, Math.min(255, b));
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL(mimeType, 0.95));
      } catch (e: any) {
        reject(new Error(`Refinement failed: ${e.message}`));
      }
    };

    img.onerror = () => reject(new Error("Restored image loading failed."));
    img.src = `data:${mimeType};base64,${restoredBase64}`;
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
