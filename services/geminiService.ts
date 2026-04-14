import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function colorizeWithGemini(base64Image: string, mimeType: string, style: string = "realistic"): Promise<string> {
  try {
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

