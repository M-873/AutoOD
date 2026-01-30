import { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnnotationToolbar } from './AnnotationToolbar';
import { AnnotationCanvas } from './AnnotationCanvas';
import { LabelsSidebar } from './LabelsSidebar';
import { Annotation, Label, ToolType, Point, BoundingBox } from '@/types/annotation';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DetectionResponse, ModelResponse, API_BASE_URL } from '@/lib/api-types';

interface VideoFrame {
  frame_number: number;
  image_url: string;
  annotations: Annotation[];
}

interface FolderDetectionResponse {
  image_files: Array<{
    url: string;
    filename: string;
  }>;
  results: Array<{
    filename: string;
    error?: string;
    detections?: DetectionResponse['detections'];
  }>;
  total_images: number;
  processed_count: number;
}

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

interface AnnotationEditorProps {
  taskId: string;
  onBack: () => void;
  labelOpacity?: number;
}

const defaultLabels: Label[] = [
  { id: '1', name: 'Car', color: '#3B82F6', shortcut: '1' },
  { id: '2', name: 'Person', color: '#10B981', shortcut: '2' },
  { id: '3', name: 'Traffic Sign', color: '#F97316', shortcut: '3' },
];

export const AnnotationEditor = ({ taskId, onBack, labelOpacity = 25 }: AnnotationEditorProps) => {
  const [currentTool, setCurrentTool] = useState<ToolType>('select');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(defaultLabels[0].id);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [imageAnnotations, setImageAnnotations] = useState<{[imageUrl: string]: Annotation[]}>({});
  const [labels, setLabels] = useState<Label[]>(defaultLabels);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [videoFrames, setVideoFrames] = useState<VideoFrame[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<{ id: string, name: string, description?: string }[]>([]);
  const [isAutoAnnotating, setIsAutoAnnotating] = useState(false);
  const totalFrames = 150;

  // Save annotations for current image
  const saveCurrentImageAnnotations = useCallback(() => {
    if (imageUrl) {
      setImageAnnotations(prev => ({
        ...prev,
        [imageUrl]: annotations
      }));
    }
  }, [imageUrl, annotations]);

  // Load annotations for specific image
  const loadImageAnnotations = useCallback((url: string) => {
    return imageAnnotations[url] || [];
  }, [imageAnnotations]);

  // Cleanup function for object URLs to prevent memory leaks
  const cleanupObjectUrls = useCallback((urls: string[]) => {
    urls.forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupObjectUrls(imageUrls);
    };
  }, []);

  // Fetch available models from backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/models`)
      .then(res => res.json())
      .then((data: ModelResponse) => {
        const formattedModels = data.models.map((m, index) => {
          // Map YOLO models to M873.x format, others keep original name
          let displayName = m;
          let description = 'Standard';
          
          if (m === 'yolo/yolov8n.pt') {
            displayName = 'M873.1';
            description = 'Fast (Nano)';
          } else if (m === 'yolo/yolov8s.pt') {
            displayName = 'M873.2';
            description = 'Balanced (Small)';
          } else if (m === 'yolo/yolov8m.pt') {
            displayName = 'M873.3';
            description = 'Accurate (Medium)';
          } else if (m === 'yolo/yolo11n.pt') {
            displayName = 'M873.4';
            description = 'Latest Nano';
          } else if (m === 'yolo/yolo11s.pt') {
            displayName = 'M873.5';
            description = 'Latest Small';
          } else if (m === 'torchvision/fasterrcnn_resnet50_fpn') {
             displayName = 'M873.6';
             description = 'Two-stage, high accuracy';
           } else if (m === 'torchvision/retinanet_resnet50_fpn') {
             displayName = 'M873.7';
             description = 'Focal loss, small objects';
           } else if (m === 'torchvision/ssd300_vgg16') {
             displayName = 'M873.8';
             description = 'Lightweight, real-time';
           } else if (m.includes('torchvision/')) {
             description = m.includes('fasterrcnn') ? 'Two-stage, high accuracy' : 
                          m.includes('retinanet') ? 'Focal loss, small objects' : 
                          m.includes('ssd') ? 'Lightweight, real-time' : 'TorchVision model';
          } else if (m.includes('transformers/')) {
            description = 'Transformer-based detection';
          } else if (m.includes('effdet/')) {
            description = 'EfficientDet model';
          }
          
          return {
            id: m,
            name: displayName,
            description: description
          };
        });
        setAvailableModels(formattedModels);
        if (data.default || formattedModels.length > 0) {
          const defaultModel = data.default || formattedModels[0].id;
          setSelectedModel(defaultModel);
          console.log('Available models:', formattedModels);
          console.log('Selected model:', defaultModel);
        }
      })
      .catch(err => {
        console.error("Failed to fetch models", err);
        toast.error("Failed to connect to detection backend");
      });
  }, []);

  const pushToHistory = useCallback((newAnnotations: Annotation[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const handleAnnotationAdd = useCallback((annotation: Annotation) => {
    const newAnnotations = [...annotations, annotation];
    setAnnotations(newAnnotations);
    pushToHistory(newAnnotations);
    toast.success('Annotation added');
  }, [annotations, pushToHistory]);

  const handleAnnotationDelete = useCallback((id: string) => {
    const newAnnotations = annotations.filter(a => a.id !== id);
    setAnnotations(newAnnotations);
    pushToHistory(newAnnotations);
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null);
    }
    toast.success('Annotation deleted');
  }, [annotations, selectedAnnotationId, pushToHistory]);

  const handleAnnotationUpdate = useCallback((id: string, updates: Partial<Annotation>) => {
    const newAnnotations = annotations.map(a =>
      a.id === id ? { ...a, ...updates } as Annotation : a
    );
    setAnnotations(newAnnotations);
    pushToHistory(newAnnotations);
  }, [annotations, pushToHistory]);

  const handleLabelAdd = useCallback((name: string, color: string) => {
    const newLabel: Label = {
      id: generateUUID(),
      name,
      color,
    };
    setLabels([...labels, newLabel]);
    setSelectedLabelId(newLabel.id);
    toast.success(`Label "${name}" added`);
  }, [labels]);

  const handleLabelDelete = useCallback((labelId: string) => {
    setLabels(labels.filter(l => l.id !== labelId));
    if (selectedLabelId === labelId) {
      setSelectedLabelId(labels[0]?.id || null);
    }
    const newAnnotations = annotations.filter(a => a.labelId !== labelId);
    setAnnotations(newAnnotations);
    pushToHistory(newAnnotations);
    toast.success('Label deleted');
  }, [labels, selectedLabelId, annotations, pushToHistory]);

  const handleLabelColorChange = useCallback((labelId: string, color: string) => {
    setLabels(labels.map(l => l.id === labelId ? { ...l, color } : l));
    // Update annotations with this label to use new color
    const newAnnotations = annotations.map(a =>
      a.labelId === labelId ? { ...a, color } as Annotation : a
    );
    setAnnotations(newAnnotations);
    pushToHistory(newAnnotations);
  }, [labels, annotations, pushToHistory]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAnnotations(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAnnotations(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const handleZoomIn = () => setZoom(Math.min(zoom * 1.2, 5));
  const handleZoomOut = () => setZoom(Math.max(zoom / 1.2, 0.1));
  const handleFitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handlePreviousImage = () => {
    if (imageUrls.length > 0 && currentImageIndex > 0) {
      // Save current annotations before switching
      saveCurrentImageAnnotations();
      
      const newIndex = currentImageIndex - 1;
      const newImageUrl = imageUrls[newIndex];
      setCurrentImageIndex(newIndex);
      setImageUrl(newImageUrl);
      
      // Load annotations for the new image
      const newAnnotations = loadImageAnnotations(newImageUrl);
      setAnnotations(newAnnotations);
      setHistory([newAnnotations]);
      setHistoryIndex(0);
    }
  };

  const handleNextImage = () => {
    if (imageUrls.length > 0 && currentImageIndex < imageUrls.length - 1) {
      // Save current annotations before switching
      saveCurrentImageAnnotations();
      
      const newIndex = currentImageIndex + 1;
      const newImageUrl = imageUrls[newIndex];
      setCurrentImageIndex(newIndex);
      setImageUrl(newImageUrl);
      
      // Load annotations for the new image
      const newAnnotations = loadImageAnnotations(newImageUrl);
      setAnnotations(newAnnotations);
      setHistory([newAnnotations]);
      setHistoryIndex(0);
    }
  };

  const handleSave = () => {
    toast.success('Annotations saved successfully');
  };

  const handleBatchImageUpload = (urls: string[]) => {
    console.log('Batch upload received:', urls.length, 'images');
    
    // Clean up existing URLs to prevent memory leaks
    cleanupObjectUrls(imageUrls);
    
    // Initialize empty annotations for each image
    const newImageAnnotations: {[imageUrl: string]: Annotation[]} = {};
    urls.forEach(url => {
      newImageAnnotations[url] = [];
    });
    
    setImageUrls(urls);
    setCurrentImageIndex(0);
    setIsVideoMode(false);
    setImageUrl(urls[0]);
    setImageAnnotations(newImageAnnotations);
    setAnnotations([]);
    setHistory([[]]);
    setHistoryIndex(0);
    toast.success(`Loaded ${urls.length} images for batch processing`);
  };

  const handleFolderUploadWithDetection = async (files: FileList) => {
    if (!files || files.length === 0) return;

    try {
      setIsAutoAnnotating(true);
      toast.info('Processing folder with AI detection...');

      // Filter only image files
      const imageFiles = Array.from(files).filter(file => {
        const validExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'];
        const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        return validExtensions.includes(fileExt);
      });

      if (imageFiles.length === 0) {
        toast.error('No valid image files found in the selected folder');
        return;
      }

      // Create FormData with all image files
      const formData = new FormData();
      imageFiles.forEach(file => {
        formData.append('files', file);
      });
      formData.append('model', selectedModel);
      formData.append('confidence', '0.25');

      // Send to backend for folder detection
      const response = await fetch(`${API_BASE_URL}/api/detect-folder`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Folder detection failed');
      }

      const data = await response.json() as FolderDetectionResponse;
      console.log('Folder detection results:', data);

      // Process results and create image URLs
      const newImageUrls = data.image_files.map((file) => file.url);
      
      // Store detection results for each image
      const allDetections: { [key: string]: DetectionResponse['detections'] } = {};
      data.results.forEach((result) => {
        if (!result.error && result.detections) {
          allDetections[result.filename] = result.detections;
        }
      });

      // Clean up existing URLs to prevent memory leaks
      cleanupObjectUrls(imageUrls);

      // Process detections and create annotations for each image
      const newImageAnnotations: {[imageUrl: string]: Annotation[]} = {};
      const newLabels: Label[] = [];
      
      newImageUrls.forEach((imageUrl, index) => {
        const imageAnnotations: Annotation[] = [];
        const result = data.results[index];
        
        if (result && !result.error && result.detections) {
          for (const detection of result.detections) {
            const className = detection.class;
            
            // Find or create label
            let labelId = '';
            let labelColor = '';
            
            const existingLabel = labels.find(l => l.name.toLowerCase() === className.toLowerCase()) ||
                                newLabels.find(l => l.name.toLowerCase() === className.toLowerCase());
            
            if (existingLabel) {
              labelId = existingLabel.id;
              labelColor = existingLabel.color;
            } else {
              labelId = generateUUID();
              labelColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
              
              const newLabel: Label = {
                id: labelId,
                name: className,
                color: labelColor,
              };
              newLabels.push(newLabel);
            }
            
            if (labelId && detection.bbox && Array.isArray(detection.bbox) && detection.bbox.length === 4) {
              const [x1, y1, x2, y2] = detection.bbox;
              const width = x2 - x1;
              const height = y2 - y1;
              
              if (width > 0 && height > 0) {
                const newAnnotation: BoundingBox = {
                  id: generateUUID(),
                  type: 'rectangle',
                  x: x1,
                  y: y1,
                  width: width,
                  height: height,
                  labelId: labelId,
                  color: labelColor,
                };
                imageAnnotations.push(newAnnotation);
              }
            }
          }
        }
        
        newImageAnnotations[imageUrl] = imageAnnotations;
      });
      
      // Add new labels if any
      if (newLabels.length > 0) {
        setLabels(prev => [...prev, ...newLabels]);
      }

      // Set up batch processing with annotations
      setImageUrls(newImageUrls);
      setCurrentImageIndex(0);
      setIsVideoMode(false);
      setImageUrl(newImageUrls[0]);
      setImageAnnotations(newImageAnnotations);
      setAnnotations(newImageAnnotations[newImageUrls[0]] || []);
      setHistory([newImageAnnotations[newImageUrls[0]] || []]);
      setHistoryIndex(0);

      // Auto-annotate first image if detections available
      const firstResult = data.results[0];
      if (firstResult && !firstResult.error && firstResult.detections) {
        const initialAnnotations = firstResult.detections!.map((det, index: number) => ({
          id: `auto-${index}`,
          class: det.class,
          confidence: det.confidence,
          bbox: det.bbox,
          color: '#FF6B6B',
          label: det.class,
        }));
        setAnnotations(initialAnnotations);
        setHistory([[], initialAnnotations]);
        setHistoryIndex(1);
      }

      toast.success(`Processed ${data.total_images} images with ${data.total_objects} total objects detected`);

    } catch (error) {
      console.error('Folder upload error:', error);
      toast.error('Failed to process folder upload');
    } finally {
      setIsAutoAnnotating(false);
    }
  };

  const handleVideoUpload = (url: string) => {
    console.log('Video upload received:', url);
    
    // Clean up existing URLs to prevent memory leaks
    cleanupObjectUrls(imageUrls);
    
    // Initialize annotations for video
    const newImageAnnotations: {[imageUrl: string]: Annotation[]} = {};
    newImageAnnotations[url] = [];
    
    setImageUrl(url);
    setIsVideoMode(true);
    setImageUrls([url]);
    setCurrentImageIndex(0);
    setImageAnnotations(newImageAnnotations);
    setAnnotations([]);
    setHistory([[]]);
    setHistoryIndex(0);
    toast.success('Video loaded for frame-by-frame processing');
    
    // Process video frames (this would be done via the new API)
    handleVideoFrameProcessing(url);
  };

  const handleVideoFrameProcessing = async (videoUrl: string) => {
    try {
      setIsAutoAnnotating(true);
      toast.info('Processing video frames...');
      
      // Convert video URL to blob
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append('file', blob);
      formData.append('model', selectedModel);
      formData.append('confidence', '0.25');
      formData.append('frame_interval', '10'); // Process every 10th frame
      formData.append('max_frames', '50'); // Max 50 frames
      
      const res = await fetch(`${API_BASE_URL}/api/detect-video`, {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Video processing failed: ${res.status} ${errorText}`);
      }
      
      const data = await res.json();
      console.log('Video processing completed:', data);
      setVideoFrames(data.results);
      toast.success(`Processed ${data.results.length} video frames`);
      
    } catch (error) {
      console.error('Video processing error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process video');
    } finally {
      setIsAutoAnnotating(false);
    }
  };

  const handleBatchAutoAnnotate = async () => {
    if (imageUrls.length === 0) {
      toast.error('Please upload multiple images first');
      return;
    }

    if (labels.length === 0) {
      toast.error('Please add labels first');
      return;
    }

    setIsAutoAnnotating(true);
    toast.info('Running batch AI auto-annotation...');

    try {
      // Convert all images to blobs with error handling
      const blobResults = await Promise.allSettled(
        imageUrls.map(async (url) => {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
            }
            return await response.blob();
          } catch (error) {
            console.error(`Failed to fetch image ${url}:`, error);
            throw error;
          }
        })
      );
      
      // Filter out failed fetches and get successful blobs
      const successfulResults = blobResults.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<Blob>[];
      const blobs = successfulResults.map(result => result.value);
      
      if (blobs.length === 0) {
        throw new Error('Failed to fetch any images for batch processing');
      }
      
      if (blobs.length < imageUrls.length) {
        console.warn(`Only ${blobs.length} out of ${imageUrls.length} images were successfully fetched`);
      }
      
      // Create form data with multiple files
      const formData = new FormData();
      blobs.forEach((blob, index) => {
        const file = new File([blob], `image_${index}.jpg`, { type: blob.type || 'image/jpeg' });
        formData.append('files', file);
      });
      formData.append('model', selectedModel);
      formData.append('confidence', '0.25');
      
      console.log('Sending batch auto-annotation request with', blobs.length, 'images');
      const res = await fetch(`${API_BASE_URL}/api/detect-batch`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Batch detection request failed:', res.status, errorText);
        throw new Error(`Batch detection request failed: ${res.status} ${errorText}`);
      }

      const data = await res.json() as { results: Array<{ error?: string; detections?: DetectionResponse['detections'] }> };
      console.log('Batch detection response:', data);

      // Process all results and save annotations per image
      const newImageAnnotations: {[imageUrl: string]: Annotation[]} = { ...imageAnnotations };
      let totalNewAnnotations = 0;
      const allNewLabels: Label[] = [];
      
      data.results.forEach((result, index) => {
        if (result.error) {
          console.warn(`Image ${index + 1} processing error:`, result.error);
          return;
        }

        if (result.detections && Array.isArray(result.detections)) {
          console.log(`Processing image ${index + 1}/${data.results.length}: ${result.detections.length} detections`);
          
          const newAnnotations: Annotation[] = [];
          const newLabels: Label[] = [];

          // Helper to find label
          const findLabel = (name: string) => {
            const lower = name.toLowerCase();
            return labels.find(l => l.name.toLowerCase() === lower) || 
                   allNewLabels.find(l => l.name.toLowerCase() === lower) ||
                   newLabels.find(l => l.name.toLowerCase() === lower);
          }

          for (const detection of result.detections) {
            const className = detection.class;
            
            // Validate detection data
            if (!detection.bbox || !Array.isArray(detection.bbox) || detection.bbox.length !== 4) {
              console.warn('Invalid bbox format:', detection.bbox);
              continue;
            }

            let labelId = '';
            let labelColor = '';

            // Check if label exists in current state or new batch
            const existingLabel = findLabel(className);

            if (existingLabel) {
              labelId = existingLabel.id;
              labelColor = existingLabel.color;
            } else {
              // Create new label
              labelId = generateUUID();
              labelColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

              const newLabel: Label = {
                id: labelId,
                name: className,
                color: labelColor,
              };
              newLabels.push(newLabel);
            }

            if (labelId) {
              try {
                const [x1, y1, x2, y2] = detection.bbox;
                const width = x2 - x1;
                const height = y2 - y1;
                
                console.log(`Processing detection: class=${className}, bbox=[${x1}, ${y1}, ${x2}, ${y2}], width=${width}, height=${height}`);
                
                // Validate dimensions
                if (width <= 0 || height <= 0) {
                  console.warn('Invalid bbox dimensions:', detection.bbox);
                  continue;
                }

                const newAnnotation: BoundingBox = {
                  id: generateUUID(),
                  type: 'rectangle',
                  x: x1,
                  y: y1,
                  width: width,
                  height: height,
                  labelId: labelId,
                  color: labelColor,
                };
                console.log(`Created annotation: id=${newAnnotation.id}, x=${x1}, y=${y1}, width=${width}, height=${height}`);
                newAnnotations.push(newAnnotation);
              } catch (error) {
                console.error('Error creating annotation for detection:', detection, error);
                continue;
              }
            }
          }

          // Save annotations for this specific image
          const imageUrl = imageUrls[index];
          if (imageUrl) {
            newImageAnnotations[imageUrl] = newAnnotations;
            totalNewAnnotations += newAnnotations.length;
            
            // Add new labels to global collection
            allNewLabels.push(...newLabels);
          }
        }
      });

      if (totalNewAnnotations > 0) {
        // Update image annotations state
        setImageAnnotations(newImageAnnotations);
        
        // Add new labels if any
        if (allNewLabels.length > 0) {
          setLabels(prev => [...prev, ...allNewLabels]);
        }
        
        // Update current image annotations if it's one of the processed images
        const currentAnnotations = newImageAnnotations[imageUrl || ''] || [];
        setAnnotations(currentAnnotations);
        setHistory([currentAnnotations]);
        setHistoryIndex(0);
        
        toast.success(`Added ${totalNewAnnotations} new annotations across ${data.successful_detections || 0} images`);
      } else {
        toast.info('No new objects detected in the batch');
      }

    } catch (error) {
      console.error('Batch auto-annotation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to auto-annotate batch');
    } finally {
      setIsAutoAnnotating(false);
    }
  };

  const handleAutoAnnotate = useCallback(async () => {
    if (!imageUrl || labels.length === 0) {
      toast.error('Please upload an image and add labels first');
      return;
    }

    setIsAutoAnnotating(true);
    toast.info('Running AI auto-annotation...');

    try {
      console.log('Starting auto-annotation with imageUrl:', imageUrl);
      console.log('Selected model:', selectedModel);
      
      // Convert image to base64
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      console.log('Image blob created, size:', blob.size, 'type:', blob.type);
      
      const reader = new FileReader();

      const imageBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const formData = new FormData();
      // Create a File object with proper filename and extension
      const file = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
      formData.append('file', file);
      formData.append('model', selectedModel);
      formData.append('confidence', '0.25');

      console.log('Sending auto-annotation request with model:', selectedModel);
      const res = await fetch(`${API_BASE_URL}/api/detect`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Detection request failed:', res.status, errorText);
        throw new Error(`Detection request failed: ${res.status} ${errorText}`);
      }

      const data: DetectionResponse = await res.json();
      console.log('Detection response received:', data);
      console.log('Response has detections:', !!data?.detections);
      console.log('Detections is array:', Array.isArray(data?.detections));

      if (data?.detections && Array.isArray(data.detections)) {
          console.log(`Processing ${data.detections.length} detections`);
          
          const newAnnotations: Annotation[] = [];
          const newLabels: Label[] = [];

          // Helper to find label
          const findLabel = (name: string) => {
            const lower = name.toLowerCase();
            return labels.find(l => l.name.toLowerCase() === lower) || newLabels.find(l => l.name.toLowerCase() === lower);
          }

          for (const detection of data.detections) {
            const className = detection.class;
            
            // Validate detection data
            if (!detection.bbox || !Array.isArray(detection.bbox) || detection.bbox.length !== 4) {
              console.warn('Invalid bbox format:', detection.bbox);
              continue;
            }

            let labelId = '';
            let labelColor = '';

            // Check if label exists in current state or new batch
            const existingLabel = findLabel(className);

            if (existingLabel) {
              labelId = existingLabel.id;
              labelColor = existingLabel.color;
            } else {
              // Create new label
              labelId = generateUUID();
              labelColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

              const newLabel: Label = {
                id: labelId,
                name: className,
                color: labelColor,
              };
              newLabels.push(newLabel);
            }

            if (labelId) {
              try {
                const [x1, y1, x2, y2] = detection.bbox;
                const width = x2 - x1;
                const height = y2 - y1;
                
                console.log(`Processing detection: class=${className}, bbox=[${x1}, ${y1}, ${x2}, ${y2}], width=${width}, height=${height}`);
                
                // Validate dimensions
                if (width <= 0 || height <= 0) {
                  console.warn('Invalid bbox dimensions:', detection.bbox);
                  continue;
                }

                const newAnnotation: BoundingBox = {
                  id: generateUUID(),
                  type: 'rectangle',
                  x: x1,
                  y: y1,
                  width: width,
                  height: height,
                  labelId: labelId,
                  color: labelColor,
                };
                console.log(`Created annotation: id=${newAnnotation.id}, x=${x1}, y=${y1}, width=${width}, height=${height}`);
                newAnnotations.push(newAnnotation);
              } catch (error) {
                console.error('Error creating annotation for detection:', detection, error);
                continue;
              }
            }
          }

        if (newLabels.length > 0) {
          setLabels(prev => [...prev, ...newLabels]);
          // If no label was selected, select the first new one
          if (!selectedLabelId) {
            setSelectedLabelId(newLabels[0].id);
          }
        }

        if (newAnnotations.length > 0) {
          console.log(`Adding ${newAnnotations.length} new annotations to ${annotations.length} existing annotations`);
          const allAnnotations = [...annotations, ...newAnnotations];
          setAnnotations(allAnnotations);
          pushToHistory(allAnnotations);
          toast.success(`Added ${newAnnotations.length} new annotations`);
        } else {
          console.log('No new annotations created');
          toast.info('No new objects detected');
        }
      }
    } catch (error) {
      console.error('Auto-annotation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to auto-annotate');
    } finally {
      setIsAutoAnnotating(false);
    }
  }, [imageUrl, annotations, labels, selectedModel, pushToHistory, selectedLabelId]);

  const handleExport = useCallback(async () => {
    if (annotations.length === 0) {
      toast.error('No annotations to export');
      return;
    }

    try {
      const exportData = {
        annotations: annotations.map(a => {
          let bbox: [number, number, number, number] = [0, 0, 0, 0];
          if (a.type === 'rectangle') {
            bbox = [a.x, a.y, a.x + a.width, a.y + a.height];
          } else if (a.type === 'polygon') {
            const xs = a.points.map(p => p.x);
            const ys = a.points.map(p => p.y);
            bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          } else if (a.type === 'point') {
            bbox = [a.x - 5, a.y - 5, a.x + 5, a.y + 5];
          }
          return {
            id: a.id,
            class: labels.find(l => l.id === a.labelId)?.name || 'unknown',
            confidence: 1.0,
            bbox: bbox,
            shape: a.type === 'rectangle' ? 'rect' : 'poly'
          };
        }),
        image_size: { width: 800, height: 600 }, // Fallback
        formats: ['YOLO', 'CSV', 'JSON', 'COCO'],
        classes: labels.map(l => l.name)
      };

      // Attempt to get real image size if possible
      if (imageUrl) {
        const img = new Image();
        img.src = imageUrl;
        await new Promise(resolve => {
          if (img.complete) {
            resolve(true);
          } else {
            img.onload = () => resolve(true);
          }
        });
        exportData.image_size = { width: img.width, height: img.height };
      }

      const res = await fetch(`${API_BASE_URL}/api/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData),
      });

      if (!res.ok) {
        throw new Error('Export failed');
      }

      // Handle ZIP file download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'autood_export.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Export downloaded successfully');

    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export annotations');
    }
  }, [annotations, labels, imageUrl]);

  // Save current image annotations when annotations change
  useEffect(() => {
    if (imageUrl) {
      setImageAnnotations(prev => ({
        ...prev,
        [imageUrl]: annotations
      }));
    }
  }, [annotations, imageUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key.toLowerCase()) {
        case 'v':
          setCurrentTool('select');
          break;
        case 'r':
          setCurrentTool('rectangle');
          break;
        case 'p':
          setCurrentTool('polygon');
          break;
        case 'o':
          setCurrentTool('point');
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleRedo();
          }
          break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleSave();
          }
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case 'f':
          handleFitToScreen();
          break;
        case 'delete':
        case 'backspace':
          if (selectedAnnotationId) {
            handleAnnotationDelete(selectedAnnotationId);
          }
          break;
      }

      const num = parseInt(e.key);
      if (num >= 1 && num <= labels.length) {
        setSelectedLabelId(labels[num - 1].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedAnnotationId, handleAnnotationDelete, labels]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 bg-card border-b border-border flex items-center px-4 gap-4">
        <Button variant="ghost" size="iconSm" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="font-medium text-sm">Task #{taskId}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="iconSm" onClick={() => setCurrentFrame(Math.max(1, currentFrame - 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm text-muted-foreground font-mono">
            {currentFrame} / {totalFrames}
          </span>
          <Button variant="ghost" size="iconSm" onClick={() => setCurrentFrame(Math.min(totalFrames, currentFrame + 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <AnnotationToolbar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        onAutoAnnotate={handleAutoAnnotate}
        onBatchAutoAnnotate={handleBatchAutoAnnotate}
        isAutoAnnotating={isAutoAnnotating}
        canAutoAnnotate={!!imageUrl}
        canBatchAutoAnnotate={imageUrls.length > 1}
        models={availableModels}
        onExport={handleExport}
        // Navigation controls
        onPreviousImage={handlePreviousImage}
        onNextImage={handleNextImage}
        canPreviousImage={currentImageIndex > 0}
        canNextImage={currentImageIndex < imageUrls.length - 1}
        currentImageIndex={currentImageIndex}
        totalImages={imageUrls.length}
      />

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        <AnnotationCanvas
          imageUrl={imageUrl}
          annotations={annotations}
          currentTool={currentTool}
          selectedLabelId={selectedLabelId}
          selectedAnnotationId={selectedAnnotationId}
          labels={labels}
          zoom={zoom}
          pan={pan}
          labelOpacity={labelOpacity}
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationSelect={setSelectedAnnotationId}
          onAnnotationUpdate={handleAnnotationUpdate}
          onImageUpload={setImageUrl}
          onBatchImageUpload={handleBatchImageUpload}
          onVideoUpload={handleVideoUpload}
          onFolderUpload={handleFolderUploadWithDetection}
          onPanChange={setPan}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
        
        <LabelsSidebar
          labels={labels}
          annotations={annotations}
          selectedLabelId={selectedLabelId}
          selectedAnnotationId={selectedAnnotationId}
          onLabelSelect={setSelectedLabelId}
          onAnnotationSelect={setSelectedAnnotationId}
          onLabelAdd={handleLabelAdd}
          onLabelDelete={handleLabelDelete}
          onLabelColorChange={handleLabelColorChange}
          onAnnotationDelete={handleAnnotationDelete}
        />
      </div>
    </div>
  );
};
