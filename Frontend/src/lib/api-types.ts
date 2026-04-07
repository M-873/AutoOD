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

// API_BASE_URL will be empty if not provided, defaulting to relative paths (same origin)
const rawApiUrl = import.meta.env.VITE_API_URL || 'https://autood.onrender.com';
export const API_BASE_URL = rawApiUrl && !rawApiUrl.startsWith('http')
  ? `https://${rawApiUrl}`
  : rawApiUrl;