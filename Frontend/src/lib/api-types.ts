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
export const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || (isLocal ? 'http://localhost:8000' : 'https://autood-backend-ggnr.onrender.com');

// DB Image Annotation Type
export interface DBAnnotation {
  label: string;
  points: number[];
  color: string;
  createdAt?: string;
}

// DB Image Metadata Type
export interface DBImage {
  _id: string;
  cloudinaryId: string;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileSize: number;
  annotationCount: number;
  annotations: DBAnnotation[];
  source?: string;
  createdAt: string;
  updatedAt: string;
}

// Paginated response type
export interface PaginatedImagesResponse {
  images: DBImage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}