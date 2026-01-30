export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  id: string;
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  labelId: string;
  color: string;
}

export interface Polygon {
  id: string;
  type: 'polygon';
  points: Point[];
  labelId: string;
  color: string;
}

export interface PointAnnotation {
  id: string;
  type: 'point';
  x: number;
  y: number;
  labelId: string;
  color: string;
}

export type Annotation = BoundingBox | Polygon | PointAnnotation;

export interface Label {
  id: string;
  name: string;
  color: string;
  shortcut?: string;
}

export interface Task {
  id: string;
  name: string;
  status: 'new' | 'in_progress' | 'completed' | 'validation';
  progress: number;
  totalFrames: number;
  completedFrames: number;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationState {
  currentTool: 'select' | 'rectangle' | 'polygon' | 'point';
  selectedAnnotationId: string | null;
  selectedLabelId: string | null;
  annotations: Annotation[];
  labels: Label[];
  zoom: number;
  pan: Point;
}

export type ToolType = 'select' | 'rectangle' | 'polygon' | 'point';
