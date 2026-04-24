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

// Use environment variable for API base URL, with a fallback for local development
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';