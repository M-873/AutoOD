import { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Annotation, ToolType, Point, Label, BoundingBox, Polygon, PointAnnotation } from '@/types/annotation';

// Utility function to generate UUID (compatible with all browsers)
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for browsers that don't support crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

interface AnnotationCanvasProps {
  imageUrl: string | null;
  annotations: Annotation[];
  currentTool: ToolType;
  selectedLabelId: string | null;
  selectedAnnotationId: string | null;
  labels: Label[];
  zoom: number;
  pan: Point;
  labelOpacity?: number;
  onAnnotationAdd: (annotation: Annotation) => void;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationUpdate: (id: string, updates: Partial<Annotation>) => void;
  onImageUpload: (url: string) => void;
  onBatchImageUpload?: (urls: string[]) => void;
  onVideoUpload?: (url: string) => void;
  onFolderUpload?: (files: FileList) => void;
  onPanChange: (pan: Point) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}



export const AnnotationCanvas = ({
  imageUrl,
  annotations,
  currentTool,
  selectedLabelId,
  selectedAnnotationId,
  labels,
  zoom,
  pan,
  labelOpacity = 25,
  onAnnotationAdd,
  onAnnotationSelect,
  onAnnotationUpdate,
  onImageUpload,
  onBatchImageUpload,
  onVideoUpload,
  onPanChange,
  onZoomIn,
  onZoomOut,
}: AnnotationCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string>('');
  const [resizeStart, setResizeStart] = useState<Point | null>(null);
  const [originalBounds, setOriginalBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const getLabelColor = (labelId: string) => {
    const label = labels.find(l => l.id === labelId);
    return label?.color || '#3B82F6';
  };

  const getResizeHandleAt = (x: number, y: number, annotation: BoundingBox, imgX: number, imgY: number, zoom: number): string => {
    const handleSize = 8;
    const handles = [
      { name: 'nw', x: annotation.x * zoom + imgX - handleSize / 2, y: annotation.y * zoom + imgY - handleSize / 2 },
      { name: 'ne', x: (annotation.x + annotation.width) * zoom + imgX - handleSize / 2, y: annotation.y * zoom + imgY - handleSize / 2 },
      { name: 'sw', x: annotation.x * zoom + imgX - handleSize / 2, y: (annotation.y + annotation.height) * zoom + imgY - handleSize / 2 },
      { name: 'se', x: (annotation.x + annotation.width) * zoom + imgX - handleSize / 2, y: (annotation.y + annotation.height) * zoom + imgY - handleSize / 2 },
    ];

    for (const handle of handles) {
      if (x >= handle.x && x <= handle.x + handleSize && y >= handle.y && y <= handle.y + handleSize) {
        return handle.name;
      }
    }
    return '';
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    // Handle HSL colors
    if (hex.startsWith('hsl')) {
      return hex.replace(')', `, ${alpha})`).replace('hsl', 'hsla');
    }
    return hex;
  };

  // Load image
  useEffect(() => {
    if (imageUrl) {
      const img = new Image();
      img.onload = () => setImage(img);
      img.src = imageUrl;
      
      // Cleanup function to prevent memory leaks
      return () => {
        img.onload = null;
        img.src = '';
      };
    } else {
      setImage(null);
    }
  }, [imageUrl]);

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const container = containerRef.current;
    if (!container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    ctx.fillStyle = 'hsl(220, 16%, 6%)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid pattern
    ctx.strokeStyle = 'hsl(220, 14%, 12%)';
    ctx.lineWidth = 1;
    const gridSize = 20 * zoom;
    const offsetX = pan.x % gridSize;
    const offsetY = pan.y % gridSize;

    for (let x = offsetX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = offsetY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    if (image) {
      const imgWidth = image.width * zoom;
      const imgHeight = image.height * zoom;
      const imgX = (canvas.width - imgWidth) / 2 + pan.x;
      const imgY = (canvas.height - imgHeight) / 2 + pan.y;

      ctx.drawImage(image, imgX, imgY, imgWidth, imgHeight);

      // Draw annotations with low opacity
      annotations.forEach((annotation) => {
        const isSelected = annotation.id === selectedAnnotationId;
        const color = annotation.color;
        ctx.strokeStyle = color;
        ctx.fillStyle = hexToRgba(color, isSelected ? (labelOpacity / 100) * 1.5 : (labelOpacity / 100));
        ctx.lineWidth = isSelected ? 3 : 2;

        if (annotation.type === 'rectangle') {
          const x = imgX + annotation.x * zoom;
          const y = imgY + annotation.y * zoom;
          const w = annotation.width * zoom;
          const h = annotation.height * zoom;

          // Add glow effect for selected annotations
          if (isSelected) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
            ctx.shadowBlur = 0;
          }

          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);

          if (isSelected) {
            // Draw resize handles
            const handleSize = 8;
            ctx.fillStyle = color;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            const handles = [
              { x: x - handleSize / 2, y: y - handleSize / 2 },
              { x: x + w - handleSize / 2, y: y - handleSize / 2 },
              { x: x - handleSize / 2, y: y + h - handleSize / 2 },
              { x: x + w - handleSize / 2, y: y + h - handleSize / 2 },
            ];
            handles.forEach(h => {
              ctx.fillRect(h.x, h.y, handleSize, handleSize);
              ctx.strokeRect(h.x, h.y, handleSize, handleSize);
            });
          }
        } else if (annotation.type === 'polygon') {
          if (annotation.points.length > 1) {
            // Add glow effect for selected annotations
            if (isSelected) {
              ctx.shadowColor = color;
              ctx.shadowBlur = 10;
              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(imgX + annotation.points[0].x * zoom - 2, imgY + annotation.points[0].y * zoom - 2);
              annotation.points.slice(1).forEach(p => {
                ctx.lineTo(imgX + p.x * zoom - 2, imgY + p.y * zoom - 2);
              });
              ctx.closePath();
              ctx.stroke();
              ctx.shadowBlur = 0;
            }

            ctx.beginPath();
            ctx.moveTo(imgX + annotation.points[0].x * zoom, imgY + annotation.points[0].y * zoom);
            annotation.points.slice(1).forEach(p => {
              ctx.lineTo(imgX + p.x * zoom, imgY + p.y * zoom);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        } else if (annotation.type === 'point') {
          const x = imgX + annotation.x * zoom;
          const y = imgY + annotation.y * zoom;
          
          // Add glow effect for selected annotations
          if (isSelected) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fillStyle = hexToRgba(color, 0.3);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      });

      // Draw current drawing
      if (isDrawing && startPoint && currentPoint) {
        const color = selectedLabelId ? getLabelColor(selectedLabelId) : '#3B82F6';
        ctx.strokeStyle = color;
        ctx.fillStyle = hexToRgba(color, labelOpacity / 100);
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        if (currentTool === 'rectangle') {
          const x = imgX + Math.min(startPoint.x, currentPoint.x) * zoom;
          const y = imgY + Math.min(startPoint.y, currentPoint.y) * zoom;
          const w = Math.abs(currentPoint.x - startPoint.x) * zoom;
          const h = Math.abs(currentPoint.y - startPoint.y) * zoom;
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        }

        ctx.setLineDash([]);
      }

      // Draw polygon in progress
      if (polygonPoints.length > 0) {
        const color = selectedLabelId ? getLabelColor(selectedLabelId) : '#3B82F6';
        ctx.strokeStyle = color;
        ctx.fillStyle = hexToRgba(color, labelOpacity / 100);
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(imgX + polygonPoints[0].x * zoom, imgY + polygonPoints[0].y * zoom);
        polygonPoints.slice(1).forEach(p => {
          ctx.lineTo(imgX + p.x * zoom, imgY + p.y * zoom);
        });
        if (currentPoint) {
          ctx.lineTo(imgX + currentPoint.x * zoom, imgY + currentPoint.y * zoom);
        }
        ctx.stroke();

        // Draw points
        polygonPoints.forEach(p => {
          ctx.beginPath();
          ctx.arc(imgX + p.x * zoom, imgY + p.y * zoom, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      }
    }
  }, [image, annotations, zoom, pan, currentTool, isDrawing, startPoint, currentPoint, polygonPoints, selectedAnnotationId, selectedLabelId, getLabelColor, labelOpacity]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Pinch zoom or Ctrl+Scroll usually
      e.preventDefault();
      if (e.deltaY < 0) {
        onZoomIn();
      } else {
        onZoomOut();
      }
    } else {
      // Standard vertical scroll = zoom? or pan?
      // User asked for "mouse scroll", which typically means just the wheel.
      // Let's support simple wheel for zoom if not panning? 
      // Often graphic apps use scroll for Zoom.
      if (e.deltaY < 0) {
        onZoomIn();
      } else {
        onZoomOut();
      }
    }
  }, [onZoomIn, onZoomOut]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const getImageCoordinates = (e: React.MouseEvent): Point | null => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !image) return null;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const imgWidth = image.width * zoom;
    const imgHeight = image.height * zoom;
    const imgX = (canvas.width - imgWidth) / 2 + pan.x;
    const imgY = (canvas.height - imgHeight) / 2 + pan.y;

    const x = (canvasX - imgX) / zoom;
    const y = (canvasY - imgY) / zoom;

    if (x < 0 || x > image.width || y < 0 || y > image.height) return null;

    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    const coords = getImageCoordinates(e);
    if (!coords) return;

    if (currentTool === 'select') {
      // Check if clicking on an annotation
      const clicked = annotations.find(a => {
        if (a.type === 'rectangle') {
          return coords.x >= a.x && coords.x <= a.x + a.width &&
            coords.y >= a.y && coords.y <= a.y + a.height;
        }
        return false;
      });

      if (clicked && clicked.type === 'rectangle') {
        // Check if clicking on a resize handle
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !image) return;

        const imgWidth = image.width * zoom;
        const imgHeight = image.height * zoom;
        const imgX = (canvas.width - imgWidth) / 2 + pan.x;
        const imgY = (canvas.height - imgHeight) / 2 + pan.y;

        const handle = getResizeHandleAt(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top, clicked, imgX, imgY, zoom);
        
        if (handle) {
          // Start resizing
          setIsResizing(true);
          setResizeHandle(handle);
          setResizeStart(coords);
          setOriginalBounds({ x: clicked.x, y: clicked.y, width: clicked.width, height: clicked.height });
          onAnnotationSelect(clicked.id);
        } else {
          // Start dragging
          setIsDragging(true);
          setDragStart(coords);
          setDragOffset({ x: coords.x - clicked.x, y: coords.y - clicked.y });
          onAnnotationSelect(clicked.id);
        }
      } else {
        onAnnotationSelect(null);
      }
    } else if (currentTool === 'rectangle' && selectedLabelId) {
      setIsDrawing(true);
      setStartPoint(coords);
      setCurrentPoint(coords);
    } else if (currentTool === 'point' && selectedLabelId) {
      const pointAnnotation: PointAnnotation = {
        id: generateUUID(),
        type: 'point',
        x: coords.x,
        y: coords.y,
        labelId: selectedLabelId,
        color: getLabelColor(selectedLabelId),
      };
      onAnnotationAdd(pointAnnotation);
    } else if (currentTool === 'polygon' && selectedLabelId) {
      setPolygonPoints([...polygonPoints, coords]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && lastPanPoint) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      onPanChange({ x: pan.x + dx, y: pan.y + dy });
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    const coords = getImageCoordinates(e);
    if (!coords) return;

    // Handle hover effects for resize handles when in select mode
    if (currentTool === 'select' && !isDragging && !isResizing && selectedAnnotationId) {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || !image) return;

      const selectedAnnotation = annotations.find(a => a.id === selectedAnnotationId);
      if (selectedAnnotation && selectedAnnotation.type === 'rectangle') {
        const imgWidth = image.width * zoom;
        const imgHeight = image.height * zoom;
        const imgX = (canvas.width - imgWidth) / 2 + pan.x;
        const imgY = (canvas.height - imgHeight) / 2 + pan.y;

        const mouseX = e.clientX - canvas.getBoundingClientRect().left;
        const mouseY = e.clientY - canvas.getBoundingClientRect().top;
        const handle = getResizeHandleAt(mouseX, mouseY, selectedAnnotation, imgX, imgY, zoom);
        
        if (handle) {
          container.style.cursor = handle.includes('nw') || handle.includes('se') ? 'nwse-resize' : 'nesw-resize';
        } else {
          container.style.cursor = 'default';
        }
      }
    }

    if (isDragging && selectedAnnotationId && dragStart) {
      // Handle dragging
      const dx = coords.x - dragStart.x;
      const dy = coords.y - dragStart.y;
      
      const annotation = annotations.find(a => a.id === selectedAnnotationId);
      if (annotation && annotation.type === 'rectangle') {
        const newX = Math.max(0, Math.min(annotation.x + dx, image!.width - annotation.width));
        const newY = Math.max(0, Math.min(annotation.y + dy, image!.height - annotation.height));
        
        onAnnotationUpdate(selectedAnnotationId, { x: newX, y: newY });
        setDragStart(coords);
      }
      return;
    }

    if (isResizing && selectedAnnotationId && resizeStart && originalBounds) {
      // Handle resizing
      const dx = coords.x - resizeStart.x;
      const dy = coords.y - resizeStart.y;
      
      const annotation = annotations.find(a => a.id === selectedAnnotationId);
      if (annotation && annotation.type === 'rectangle') {
        let newX = originalBounds.x;
        let newY = originalBounds.y;
        let newWidth = originalBounds.width;
        let newHeight = originalBounds.height;

        switch (resizeHandle) {
          case 'se':
            newWidth = Math.max(10, originalBounds.width + dx);
            newHeight = Math.max(10, originalBounds.height + dy);
            break;
          case 'sw':
            newWidth = Math.max(10, originalBounds.width - dx);
            newHeight = Math.max(10, originalBounds.height + dy);
            newX = originalBounds.x + dx;
            break;
          case 'ne':
            newWidth = Math.max(10, originalBounds.width + dx);
            newHeight = Math.max(10, originalBounds.height - dy);
            newY = originalBounds.y + dy;
            break;
          case 'nw':
            newWidth = Math.max(10, originalBounds.width - dx);
            newHeight = Math.max(10, originalBounds.height - dy);
            newX = originalBounds.x + dx;
            newY = originalBounds.y + dy;
            break;
        }

        // Ensure bounds are within image
        newX = Math.max(0, Math.min(newX, image!.width - newWidth));
        newY = Math.max(0, Math.min(newY, image!.height - newHeight));

        onAnnotationUpdate(selectedAnnotationId, { x: newX, y: newY, width: newWidth, height: newHeight });
      }
      return;
    }

    if (coords) {
      setCurrentPoint(coords);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }

    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragOffset({ x: 0, y: 0 });
      return;
    }

    if (isResizing) {
      setIsResizing(false);
      setResizeHandle('');
      setResizeStart(null);
      setOriginalBounds(null);
      return;
    }

    if (isDrawing && startPoint && currentPoint && selectedLabelId) {
      const x = Math.min(startPoint.x, currentPoint.x);
      const y = Math.min(startPoint.y, currentPoint.y);
      const width = Math.abs(currentPoint.x - startPoint.x);
      const height = Math.abs(currentPoint.y - startPoint.y);

      if (width > 5 && height > 5) {
        const rectAnnotation: BoundingBox = {
          id: generateUUID(),
          type: 'rectangle',
          x,
          y,
          width,
          height,
          labelId: selectedLabelId,
          color: getLabelColor(selectedLabelId),
        };
        onAnnotationAdd(rectAnnotation);
      }
    }

    setIsDrawing(false);
    setStartPoint(null);
  };

  const handleDoubleClick = () => {
    if (currentTool === 'polygon' && polygonPoints.length >= 3 && selectedLabelId) {
      const polygonAnnotation: Polygon = {
        id: generateUUID(),
        type: 'polygon',
        points: polygonPoints,
        labelId: selectedLabelId,
        color: getLabelColor(selectedLabelId),
      };
      onAnnotationAdd(polygonAnnotation);
      setPolygonPoints([]);
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setPolygonPoints([]);
      setIsDrawing(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate image file type
      const validExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'];
      const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!validExtensions.includes(fileExt)) {
        toast.error('Please select a valid image file (JPG, JPEG, PNG, BMP, TIFF, WebP)');
        return;
      }
      
      // Validate file size (max 50MB to match backend limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        toast.error('Image file too large - maximum 50MB');
        return;
      }
      
      const url = URL.createObjectURL(file);
      onImageUpload(url);
    }
  };

  const handleBatchFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onBatchImageUpload) {
      // Validate file types
      const validExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'];
      const validFiles = Array.from(files).filter(file => {
        const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        return validExtensions.includes(fileExt);
      });
      
      if (validFiles.length === 0) {
        toast.error('No valid image files selected');
        return;
      }
      
      const urls = validFiles.map(file => URL.createObjectURL(file));
      onBatchImageUpload(urls);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onVideoUpload) {
      // Validate video file type
      const validExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'];
      const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!validExtensions.includes(fileExt)) {
        toast.error('Please select a valid video file (MP4, AVI, MOV, WMV, FLV, WebM)');
        return;
      }
      
      // Validate file size (max 200MB to match backend limit)
      const maxSize = 200 * 1024 * 1024; // 200MB
      if (file.size > maxSize) {
        toast.error('Video file too large - maximum 200MB');
        return;
      }
      
      const url = URL.createObjectURL(file);
      onVideoUpload(url);
    }
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Always filter for valid image files first
      const imageFiles = Array.from(files).filter(file => {
        const validExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'];
        const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        return validExtensions.includes(fileExt);
      });

      if (imageFiles.length === 0) {
        toast.error('No valid image files found in the selected folder');
        return;
      }

      if (onFolderUpload) {
        // Use the enhanced folder upload with AI detection
        try {
          onFolderUpload(files);
          toast.success(`Processing ${imageFiles.length} images with AI detection...`);
        } catch (error) {
          console.error('Error in folder upload with AI:', error);
          toast.error('Failed to process folder with AI detection');
        }
      } else if (onBatchImageUpload) {
        // Fallback to basic batch upload
        try {
          // Create URLs for all image files
          const urls = imageFiles.map(file => URL.createObjectURL(file));
          onBatchImageUpload(urls);
          toast.success(`Loaded ${imageFiles.length} images from folder`);
        } catch (error) {
          console.error('Error processing folder upload:', error);
          toast.error('Failed to process folder upload');
        }
      }
    }
  };

  if (!imageUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas-bg">
        <div className="text-center">
          <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No image loaded</h3>
          <p className="text-muted-foreground mb-6">Upload images or video to start annotating</p>
          
          <div className="space-y-4">
            <label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button asChild>
                <span className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Single Image
                </span>
              </Button>
            </label>
            
            {onBatchImageUpload && (
              <label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBatchFileUpload}
                  className="hidden"
                />
                <Button variant="outline" asChild>
                  <span className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Multiple Images (Max 100)
                  </span>
                </Button>
              </label>
            )}
            
            {onVideoUpload && (
              <label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  className="hidden"
                />
                <Button variant="outline" asChild>
                  <span className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Video
                  </span>
                </Button>
              </label>
            )}
            
            {onBatchImageUpload && (
              <label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFolderUpload}
                  className="hidden"
                  // @ts-expect-error - webkitdirectory is not in standard HTML types
                  webkitdirectory=""
                  directory=""
                />
                <Button variant="outline" asChild>
                  <span className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Folder (AI Detection)
                  </span>
                </Button>
              </label>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      onWheel={handleWheel}
      style={{ cursor: isPanning ? 'grabbing' : isDragging ? 'move' : isResizing ? (resizeHandle.includes('nw') || resizeHandle.includes('se') ? 'nwse-resize' : resizeHandle.includes('ne') || resizeHandle.includes('sw') ? 'nesw-resize' : 'crosshair') : currentTool === 'select' ? 'default' : 'crosshair' }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        className="w-full h-full"
      />

      {/* Upload overlay */}
      <label className="absolute bottom-4 right-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        <Button variant="secondary" size="sm" asChild>
          <span className="cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />
            Change Image
          </span>
        </Button>
      </label>

      {/* Tool hint */}
      {currentTool === 'polygon' && polygonPoints.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur px-3 py-1.5 rounded text-sm">
          {polygonPoints.length} points • Double-click to complete • Esc to cancel
        </div>
      )}
    </div>
  );
};
