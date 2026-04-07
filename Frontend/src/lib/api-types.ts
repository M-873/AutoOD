// API Types for the backend integration

export interface DetectionResponse {
  detections: Array<{
    class: string;
    confidence: number;
    bbox: [number, number, number, number]; // [x1, y1, x2, y2]
    shape: 'rect';
  }>;
  image_size: {
    width: number;
    height: number;
  };
  total_objects: number;
  class_counts: Record<string, number>;
}

export interface ModelResponse {
  models: string[];
  default: string;
}

// Force use of the correctly configured backend URL, dodging any misconfigured Vercel VITE_API_URL vars
export const API_BASE_URL = 'https://autood.onrender.com';