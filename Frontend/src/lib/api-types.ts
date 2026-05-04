// API Types for the backend integration

export interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

// Simplified response to match new strict backend format
export type DetectionResponse = Detection[];

export interface ModelResponse {
  models: string[];
  default: string;
}

// Use environment variable for API base URL, with a fallback for local development or production
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const API_BASE_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://localhost:8000' : 'https://autood-f9bq.onrender.com');