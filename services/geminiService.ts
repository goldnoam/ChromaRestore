
import { GoogleGenAI } from "@google/genai";

/**
 * Uses Gemini 2.5 Flash Image model to colorize a black and white image.
 * This function takes a base64 string and returns the colorized result as a data URL.
 */
export async function processImageWithGemini(base64Data: string, mimeType: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
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
            text: 'Colorize this black and white photo. Make it look natural, vibrant, and historically accurate as if it were taken with a modern color camera. Return only the colorized image.',
          },
        ],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new Error("No response parts received from model");
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data found in model response");
  } catch (error) {
    console.error("Gemini colorization error:", error);
    throw error;
  }
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
