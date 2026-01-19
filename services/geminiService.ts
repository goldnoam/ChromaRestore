
/**
 * Professional Image Restoration Service
 * Powered by Gemini 2.5 Flash Vision
 */

import { GoogleGenAI } from "@google/genai";
import { GradingPreset } from '../types';

export interface RestoreConfig {
  temp: number;
  saturation: number;
  contrast: number;
  intensity: number;
  grading: GradingPreset;
}

/**
 * Process image using Gemini's high-fidelity vision capabilities.
 * Always initializes a new client instance as per guidelines for production reliability.
 */
export async function processImageLocally(
  base64Data: string, 
  mimeType: string,
  config: RestoreConfig = { temp: 15, saturation: 1.25, contrast: 1.15, intensity: 1.0, grading: 'none' }
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Semantic restoration prompt
  const prompt = `Perform high-quality professional restoration and colorization on this image.
    Tuning Instructions:
    - Temperature: ${config.temp} (Higher is warmer, lower is cooler)
    - Saturation Factor: ${config.saturation}x
    - Contrast Factor: ${config.contrast}x
    - Color Grading Style: ${config.grading}
    - Restoration Strength: ${Math.round(config.intensity * 100)}%
    The output must be a clean, vibrant, and naturally restored version of the input photo.`;

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
          text: prompt,
        },
      ],
    },
  });

  // Iterating through parts to find the image as per guidelines
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const base64Str = part.inlineData.data;
      return `data:${part.inlineData.mimeType};base64,${base64Str}`;
    }
  }

  throw new Error("No restored image found in Gemini response.");
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
