import { useState, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnnotationToolbar } from './AnnotationToolbar';
import { AnnotationCanvas } from './AnnotationCanvas';
import { LabelsSidebar } from './LabelsSidebar';
import { Annotation, Label, ToolType, Point, BoundingBox } from '@/types/annotation';
import { toast } from 'sonner';
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
  total_objects?: number;
  successful_detections?: number;
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
  const [imageIdMap, setImageIdMap] = useState<{[imageUrl: string]: string}>({});
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
  const [isLoadingModels, setIsLoadingModels] = useState(false);
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
    setIsLoadingModels(true);
    fetch(`${API_BASE_URL}/api/models`)
      .then(res => res.json())
      .then((data: ModelResponse) => {
        const formattedModels = data.models.map((m, index) => {
          let displayName = m;
          let description = 'Standard';
          
          if (m === 'yolo') {
            displayName = 'M873.V2';
            description = 'Fast (YOLOv8n)';
          } else if (m === 'nanodet') {
            displayName = 'M873.V1';
            description = 'Fast (NanoDet)';
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
      })
      .finally(() => {
        setIsLoadingModels(false);
      });
  }, []);

  // Fetch images for the given task/project
  useEffect(() => {
    if (taskId) {
      fetch(`${API_BASE_URL}/api/images?projectId=${taskId}&limit=30`)
        .then(res => res.json())
        .then(data => {
          if (data && data.images && data.images.length > 0) {
            const urls = data.images.map((img: any) => img.imageUrl);
            setImageUrls(urls);
            setImageUrl(urls[0]);
            
            // Map annotations
            const newImageAnnotations: {[url: string]: Annotation[]} = {};
            const newImageIdMap: {[url: string]: string} = {};
            data.images.forEach((img: any) => {
              newImageIdMap[img.imageUrl] = img._id;
              if (img.annotations && img.annotations.length > 0) {
                newImageAnnotations[img.imageUrl] = img.annotations.map((ann: any) => ({
                  id: generateUUID(),
                  type: 'rectangle', // Assuming rectangle for now based on current logic
                  x: ann.points[0],
                  y: ann.points[1],
                  width: ann.points[2] - ann.points[0],
                  height: ann.points[3] - ann.points[1],
                  color: ann.color || '#3B82F6',
                  labelId: labels.find(l => l.name === ann.label)?.id || defaultLabels[0].id
                }));
              }
            });
            setImageIdMap(newImageIdMap);
            setImageAnnotations(newImageAnnotations);
            if (urls.length > 0) {
              setAnnotations(newImageAnnotations[urls[0]] || []);
            }
          }
        })
        .catch(err => {
          console.error("Failed to fetch project images", err);
          toast.error("Failed to load project images");
        });
    }
  }, [taskId]);

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

  const handleSave = async () => {
    if (!imageUrl) return;
    
    // Save annotations locally
    saveCurrentImageAnnotations();
    
    // Save to backend if we have an image ID
    const imageId = imageIdMap[imageUrl];
    if (imageId) {
      const serializedAnnotations = annotations.map(ann => ({
        label: labels.find(l => l.id === ann.labelId)?.name || 'object',
        points: [ann.x, ann.y, ann.x + ann.width, ann.y + ann.height],
        color: ann.color
      }));
      
      try {
        const response = await fetch(`${API_BASE_URL}/api/images/${imageId}/annotations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotations: serializedAnnotations })
        });
        if (response.ok) {
          toast.success('Annotations saved successfully');
        } else {
          toast.error('Failed to save to cloud');
        }
      } catch (err) {
        toast.error('Error saving to cloud');
      }
    } else {
      toast.success('Annotations saved locally');
    }
  };

  const handleBatchImageUpload = async (urls: string[]) => {
    console.log('Batch upload received:', urls.length, 'images');
    
    // Clean up existing URLs to prevent memory leaks
    cleanupObjectUrls(imageUrls);
    
    const newImageAnnotations: {[imageUrl: string]: Annotation[]} = {};
    const finalUrls: string[] = [];

    if (taskId) {
      toast.info('Uploading images to project...');
      for (const url of urls) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const file = new File([blob], 'image.jpg', { type: blob.type });
          const formData = new FormData();
          formData.append('file', file);
          formData.append('projectId', taskId);
          
          const uploadRes = await fetch(`${API_BASE_URL}/api/images/upload`, {
            method: 'POST',
            body: formData
          });
          
          if (uploadRes.ok) {
             const data = await uploadRes.json();
             finalUrls.push(data.imageUrl);
             newImageAnnotations[data.imageUrl] = [];
             setImageIdMap(prev => ({ ...prev, [data.imageUrl]: data._id }));
          }
        } catch (err) {
          console.error("Failed to upload image", err);
        }
      }
      toast.success(`Uploaded ${finalUrls.length} images successfully`);
    } else {
      finalUrls.push(...urls);
      urls.forEach(url => {
        newImageAnnotations[url] = [];
      });
      toast.success(`Loaded ${urls.length} images for batch processing`);
    }
    
    setImageUrls(finalUrls);
    setCurrentImageIndex(0);
    setIsVideoMode(false);
    if (finalUrls.length > 0) setImageUrl(finalUrls[0]);
    setImageAnnotations(newImageAnnotations);
    setAnnotations([]);
    setHistory([[]]);
    setHistoryIndex(0);
  };

  const handleSingleImageUpload = async (url: string) => {
    let finalUrl = url;
    
    if (taskId) {
      toast.info('Uploading image to project...');
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], 'image.jpg', { type: blob.type });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', taskId);
        
        const uploadRes = await fetch(`${API_BASE_URL}/api/images/upload`, {
          method: 'POST',
          body: formData
        });
        
        if (uploadRes.ok) {
           const data = await uploadRes.json();
           finalUrl = data.imageUrl;
           setImageIdMap(prev => ({ ...prev, [finalUrl]: data._id }));
           toast.success('Image uploaded successfully');
        } else {
           toast.error('Failed to upload image');
        }
      } catch (err) {
        console.error("Failed to upload single image", err);
        toast.error('Error uploading image');
      }
    }
    
    setImageUrl(finalUrl);
    if (!imageUrls.includes(finalUrl)) {
      setImageUrls(prev => [...prev, finalUrl]);
      setImageAnnotations(prev => ({ ...prev, [finalUrl]: [] }));
    }
    setAnnotations([]);
    setHistory([[]]);
    setHistoryIndex(0);
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
      const filenameToBlob: {[key: string]: File} = {};
      imageFiles.forEach(file => {
        formData.append('files', file);
        filenameToBlob[file.name] = file;
      });
      formData.append('model', selectedModel);
      formData.append('confidence', '0.25');
      if (taskId) {
        formData.append('projectId', taskId);
      }

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
      
      // Update imageIdMap with the returned IDs from data.image_files
      const addedImageIds: {[url: string]: string} = {};
      data.image_files.forEach(f => {
        if (f.id) {
          addedImageIds[f.url] = f.id;
        }
      });
      setImageIdMap(prev => ({ ...prev, ...addedImageIds }));
      
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
        const initialAnnotations = newImageAnnotations[newImageUrls[0]] || [];
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

    setIsAutoAnnotating(true);
    toast.info('Running batch AI auto-annotation (5 images at a time)...');

    const BATCH_SIZE = 5;
    const newImageAnnotations = { ...imageAnnotations };
    const allNewLabels: Label[] = [];
    let totalDetections = 0;

    try {
      for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
        const chunk = imageUrls.slice(i, i + BATCH_SIZE);
        const currentBatchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(imageUrls.length / BATCH_SIZE);
        
        toast.info(`Processing batch ${currentBatchNum} of ${totalBatches}...`);

        const chunkResults = await Promise.all(
          chunk.map(async (url) => {
            try {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`Fetch failed for ${url}`);
              const blob = await response.blob();
              
              const formData = new FormData();
              formData.append('file', new File([blob], 'image.jpg', { type: blob.type }));
              formData.append('model', selectedModel);

              const res = await fetch(`${API_BASE_URL}/api/detect`, {
                method: 'POST',
                body: formData,
              });

              if (!res.ok) throw new Error(`Detection failed for ${url}`);
              const detections: DetectionResponse = await res.json();
              return { url, detections, error: null };
            } catch (err) {
              console.error(err);
              return { url, detections: [], error: err instanceof Error ? err.message : 'Unknown error' };
            }
          })
        );

        // Process results for this chunk
        chunkResults.forEach((result) => {
          if (result.error) return;

          const imageAnnotationsForUrl: Annotation[] = [];
          
          result.detections.forEach((detection) => {
            const className = detection.class;
            
            // Find or create label
            let label = labels.find(l => l.name.toLowerCase() === className.toLowerCase()) ||
                        allNewLabels.find(l => l.name.toLowerCase() === className.toLowerCase());
            
            if (!label) {
              label = {
                id: generateUUID(),
                name: className,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
              };
              allNewLabels.push(label);
            }

            const [x1, y1, x2, y2] = detection.bbox;
            const width = x2 - x1;
            const height = y2 - y1;

            if (width > 0 && height > 0) {
              imageAnnotationsForUrl.push({
                id: generateUUID(),
                type: 'rectangle',
                x: x1,
                y: y1,
                width: width,
                height: height,
                labelId: label.id,
                color: label.color,
              } as BoundingBox);
              totalDetections++;
            }
          });

          newImageAnnotations[result.url] = imageAnnotationsForUrl;
        });

        // Update state progressively after each chunk
        setImageAnnotations({ ...newImageAnnotations });
        if (allNewLabels.length > 0) {
          setLabels(prev => {
            const uniqueNew = allNewLabels.filter(nl => !prev.some(pl => pl.name.toLowerCase() === nl.name.toLowerCase()));
            return [...prev, ...uniqueNew];
          });
        }
        
        // If current image is in this chunk, update active annotations
        if (chunk.includes(imageUrl || '')) {
          setAnnotations(newImageAnnotations[imageUrl || ''] || []);
        }
      }

      toast.success(`Batch processing complete! Found ${totalDetections} objects.`);
    } catch (error) {
      console.error('Batch auto-annotation error:', error);
      toast.error('Batch processing encountered an error');
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
      // Always send an empty array for now or the relevant labels
      formData.append('class_filter', JSON.stringify([]));

      console.log(`Sending auto-annotation request to: ${API_BASE_URL}/api/detect with model:`, selectedModel);
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

      if (data && Array.isArray(data)) {
          console.log(`Processing ${data.length} detections`);
          
          const newAnnotations: Annotation[] = [];
          const newLabels: Label[] = [];

          // Helper to find label
          const findLabel = (name: string) => {
            const lower = name.toLowerCase();
            return labels.find(l => l.name.toLowerCase() === lower) || newLabels.find(l => l.name.toLowerCase() === lower);
          }

          for (const detection of data) {
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

  const handleExport = useCallback(async (formatId: string = 'JSON') => {
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
          } else if (a.type === 'polygon' || (a as any).type === 'polyline') {
            const points = (a as any).points;
            const xs = points.map((p: any) => p.x);
            const ys = points.map((p: any) => p.y);
            bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          } else if (a.type === 'point') {
            bbox = [a.x - 5, a.y - 5, a.x + 5, a.y + 5];
          }
          return {
            id: a.id,
            class: labels.find(l => l.id === a.labelId)?.name || 'unknown',
            confidence: 1.0,
            bbox: bbox,
            shape: a.type === 'rectangle' ? 'rect' : ((a as any).type === 'polyline' ? 'line' : 'poly')
          };
        }),
        image_size: { width: 800, height: 600 }, // Fallback
        formats: formatId === 'YOLO_IMAGES' ? ['YOLO'] : [formatId],
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
      let finalBlob = blob;

      if (formatId === 'YOLO_IMAGES' && imageUrl) {
        toast.info('Packaging image with YOLO annotations...');
        try {
          const jszip = new JSZip();
          const zip = await jszip.loadAsync(blob);
          
          const imgRes = await fetch(imageUrl);
          const imgBlob = await imgRes.blob();
          
          zip.file('yolo/image.jpg', imgBlob);
          finalBlob = await zip.generateAsync({ type: 'blob' });
        } catch (err) {
          console.error("Failed to inject image into zip", err);
          toast.error("Could not package image with export");
        }
      }

      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autood_export_${formatId}.zip`;
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
        case 'l':
          setCurrentTool('polyline');
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
          <h2 className="font-medium text-sm">Project: {taskId}</h2>
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
        isLoadingModels={isLoadingModels}
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
          onImageUpload={handleSingleImageUpload}
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
