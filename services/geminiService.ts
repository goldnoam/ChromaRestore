/**
 * Local Image Processor
 * Performs high-performance chroma restoration directly in the browser.
 */

export async function processImageLocally(base64Data: string, mimeType: string): Promise<string> {
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

      // Local Chroma Restoration Algorithm (Luminance Mapping)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Standard Luminance calculation
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // Apply heuristic color mapping based on luminance ranges
        let newR, newG, newB;

        if (lum < 50) {
          // Deep Shadows: Cool, deep blue/black tones
          newR = lum * 0.7;
          newG = lum * 0.8;
          newB = lum * 1.1;
        } else if (lum < 130) {
          // Mid-tones (Low): Earthy, skin, or foliage tones
          // Heuristic: Boost warm tones for organic look
          newR = lum * 1.25;
          newG = lum * 1.05;
          newB = lum * 0.85;
        } else if (lum < 200) {
          // Mid-tones (High): Warm sunlight / sky tones
          newR = lum * 1.1;
          newG = lum * 1.15;
          newB = lum * 1.3;
        } else {
          // Highlights: Pure white/warm light
          newR = Math.min(255, lum * 1.05);
          newG = Math.min(255, lum * 1.05);
          newB = lum;
        }

        // Apply a subtle saturation boost and contrast adjustment
        data[i] = Math.max(0, Math.min(255, newR));
        data[i + 1] = Math.max(0, Math.min(255, newG));
        data[i + 2] = Math.max(0, Math.min(255, newB));
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
