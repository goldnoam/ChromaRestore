import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in the environment. Please check your settings.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function colorizeWithGemini(base64Image: string, mimeType: string, style: string = "realistic"): Promise<string> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1] || base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: `Colorize this black and white photo with high realism. 
            Style: ${style}. 
            Ensure natural skin tones, vibrant scenery, and avoid color bleeding. 
            Maintain original detail and sharpness.`,
          },
        ],
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("Gemini did not return an image.");
  } catch (error: any) {
    console.error("Gemini Colorization Error:", error);
    throw new Error(error.message || "Failed to colorize image with Gemini.");
  }
}

