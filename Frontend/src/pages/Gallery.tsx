import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Upload, Trash2, Edit3, Save, X, Plus, 
  ChevronLeft, ChevronRight, RefreshCw, ZoomIn, ZoomOut, Cpu, Info, FileImage
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { API_BASE_URL, DBImage, DBAnnotation, PaginatedImagesResponse } from '@/lib/api-types';
import { AnnotationCanvas } from '@/components/AnnotationCanvas';
import { Annotation, ToolType, Point, Label } from '@/types/annotation';

const defaultLabels: Label[] = [
  { id: '1', name: 'Car', color: '#3B82F6', shortcut: '1' },
  { id: '2', name: 'Person', color: '#10B981', shortcut: '2' },
  { id: '3', name: 'Traffic Sign', color: '#F97316', shortcut: '3' },
];

// Helper to convert DB annotations to frontend canvas annotations
const mapDBToFrontend = (dbAnns: DBAnnotation[], labels: Label[]): Annotation[] => {
  if (!dbAnns) return [];
  return dbAnns.map((dbAnn, index) => {
    let matchedLabel = labels.find(l => l.name.toLowerCase() === dbAnn.label.toLowerCase());
    if (!matchedLabel) {
      matchedLabel = {
        id: `dynamic-${dbAnn.label}-${index}`,
        name: dbAnn.label,
        color: dbAnn.color || '#3B82F6'
      };
      labels.push(matchedLabel);
    }
    
    const uniqueId = `ann-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    if (dbAnn.points.length === 4) {
      const [x1, y1, x2, y2] = dbAnn.points;
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      return {
        id: uniqueId,
        type: 'rectangle',
        x,
        y,
        width,
        height,
        labelId: matchedLabel.id,
        color: matchedLabel.color
      };
    } else if (dbAnn.points.length === 2) {
      return {
        id: uniqueId,
        type: 'point',
        x: dbAnn.points[0],
        y: dbAnn.points[1],
        labelId: matchedLabel.id,
        color: matchedLabel.color
      };
    } else {
      const pts: Point[] = [];
      for (let i = 0; i < dbAnn.points.length; i += 2) {
        if (i + 1 < dbAnn.points.length) {
          pts.push({ x: dbAnn.points[i], y: dbAnn.points[i+1] });
        }
      }
      return {
        id: uniqueId,
        type: 'polygon',
        points: pts,
        labelId: matchedLabel.id,
        color: matchedLabel.color
      };
    }
  });
};

// Helper to convert frontend canvas annotations to DB annotations
const mapFrontendToDB = (anns: Annotation[], labels: Label[]): DBAnnotation[] => {
  return anns.map(ann => {
    const label = labels.find(l => l.id === ann.labelId);
    const labelName = label ? label.name : 'Object';
    const color = label ? label.color : '#3B82F6';
    
    let points: number[] = [];
    if (ann.type === 'rectangle') {
      points = [ann.x, ann.y, ann.x + ann.width, ann.y + ann.height];
    } else if (ann.type === 'point') {
      points = [ann.x, ann.y];
    } else if (ann.type === 'polygon' || ann.type === 'polyline') {
      points = ann.points.flatMap(p => [p.x, p.y]);
    }
    
    return {
      label: labelName,
      points,
      color
    };
  });
};

export default function Gallery() {
  const navigate = useNavigate();
  
  // Gallery State
  const [images, setImages] = useState<DBImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [totalPages, setTotalPages] = useState(1);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Annotation Modal State
  const [selectedImage, setSelectedImage] = useState<DBImage | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  
  // Canvas State
  const [currentTool, setCurrentTool] = useState<ToolType>('select');
  const [labels, setLabels] = useState<Label[]>(defaultLabels);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(defaultLabels[0].id);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [newLabelName, setNewLabelName] = useState('');
  
  // Auto annotation State
  const [isAutoAnnotating, setIsAutoAnnotating] = useState(false);
  const [selectedModel, setSelectedModel] = useState('M873.V1');
  const [confidence, setConfidence] = useState(0.25);
  
  // Fetch Gallery Images
  const fetchImages = useCallback(async (pageNum = page, currentLimit = limit) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/images?page=${pageNum}&limit=${currentLimit}`);
      if (!response.ok) throw new Error('Failed to fetch gallery images');
      const data: PaginatedImagesResponse = await response.json();
      setImages(data.images);
      setTotalCount(data.pagination.total);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error(error);
      toast.error('Error fetching gallery images');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    fetchImages(page, limit);
  }, [page, limit, fetchImages]);

  // Handle Image Upload
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Image size exceeds 3MB limit');
      return;
    }
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/images/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Upload failed');
      }
      
      toast.success('Image uploaded successfully');
      setPage(1);
      fetchImages(1, limit);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Image upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Delete Image Card
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/images/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Deletion failed');
      toast.success('Image deleted successfully');
      fetchImages(page, limit);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete image');
    }
  };

  // Open Annotation Dialog
  const openAnnotationModal = async (img: DBImage) => {
    setSelectedImage(img);
    setIsModalOpen(true);
    setModalLoading(true);
    setAnnotations([]);
    setLabels([...defaultLabels]);
    setSelectedLabelId(defaultLabels[0].id);
    setSelectedAnnotationId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/images/${img._id}`);
      if (!response.ok) throw new Error('Failed to load image details');
      const data: DBImage = await response.json();
      
      const mapped = mapDBToFrontend(data.annotations, labels);
      setAnnotations(mapped);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load image annotations');
    } finally {
      setModalLoading(false);
    }
  };

  // Save Annotations back to MongoDB
  const handleSaveAnnotations = async () => {
    if (!selectedImage) return;
    
    const dbAnns = mapFrontendToDB(annotations, labels);
    try {
      const response = await fetch(`${API_BASE_URL}/api/images/${selectedImage._id}/annotations`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ annotations: dbAnns })
      });
      
      if (!response.ok) throw new Error('Failed to save annotations');
      toast.success('Annotations saved successfully');
      setIsModalOpen(false);
      fetchImages(page, limit);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save annotations');
    }
  };

  // Trigger auto detect from current view
  const handleAutoAnnotate = async () => {
    if (!selectedImage) return;
    
    setIsAutoAnnotating(true);
    try {
      // Fetch binary image blob from Cloudinary URL
      const imgRes = await fetch(selectedImage.imageUrl);
      const blob = await imgRes.blob();
      const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', selectedModel);
      formData.append('confidence', confidence.toString());
      
      const detectRes = await fetch(`${API_BASE_URL}/api/detect`, {
        method: 'POST',
        body: formData
      });
      
      if (!detectRes.ok) throw new Error('Auto-annotation request failed');
      const detections = await detectRes.json();
      
      if (detections.length === 0) {
        toast.info('No objects detected with the current settings');
        return;
      }
      
      // Map detections to frontend annotations
      const dbAnns: DBAnnotation[] = detections.map((det: any) => ({
        label: det.class,
        points: det.bbox,
        color: '#3B82F6'
      }));
      
      const newAnns = mapDBToFrontend(dbAnns, labels);
      setAnnotations(prev => [...prev, ...newAnns]);
      toast.success(`Detected and added ${newAnns.length} objects`);
    } catch (error) {
      console.error(error);
      toast.error('Auto annotation failed');
    } finally {
      setIsAutoAnnotating(false);
    }
  };

  // Add a new Label inside the editor
  const handleAddLabel = () => {
    if (!newLabelName.trim()) return;
    
    const colors = ['#3B82F6', '#10B981', '#F97316', '#EF4444', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const nextShortcut = (labels.length + 1).toString();
    const newLabel: Label = {
      id: `lbl-${Date.now()}`,
      name: newLabelName.trim(),
      color: randomColor,
      shortcut: nextShortcut.length === 1 ? nextShortcut : undefined
    };
    
    setLabels(prev => [...prev, newLabel]);
    setSelectedLabelId(newLabel.id);
    setNewLabelName('');
    toast.success(`Label "${newLabel.name}" added`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/app')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <FileImage className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">AutoOD Image Gallery</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="px-3 py-1 text-sm bg-primary/10 text-primary border border-primary/20">
            Total Images: {totalCount}
          </Badge>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload} 
            accept="image/*" 
            className="hidden" 
          />
          
          <Button 
            disabled={uploading} 
            onClick={() => fileInputRef.current?.click()} 
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading...' : 'Upload Image'}
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        
        {/* Info Banner */}
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 flex gap-3 items-start">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <h3 className="font-semibold text-primary">Free-Tier Storage Retention Policy</h3>
            <p className="text-muted-foreground mt-0.5">
              To minimize storage costs, all binary files are stored in Cloudinary, and metadata in MongoDB. 
              Images and annotations are automatically deleted after <strong>7 days</strong>.
            </p>
          </div>
        </div>

        {/* Filters and Pagination Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-4 rounded-lg">
          <div className="text-sm text-muted-foreground font-medium">
            Showing {images.length > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, totalCount)} of {totalCount} images
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Per Page:</span>
              <Select value={limit.toString()} onValueChange={(val) => { setLimit(Number(val)); setPage(1); }}>
                <SelectTrigger className="w-[80px] h-8">
                  <SelectValue placeholder="12" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="36">36</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="icon" onClick={() => fetchImages(page, limit)} className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Gallery Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: limit }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-video w-full" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-20 bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <FileImage className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">No Images Found</h3>
              <p className="text-muted-foreground max-w-sm text-sm">
                There are no images uploaded in the last 7 days. Upload an image above to start annotating.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {images.map((img) => (
              <Card 
                key={img._id} 
                className="overflow-hidden group hover:shadow-md transition-all duration-300 border-border hover:border-primary/50 cursor-pointer flex flex-col bg-card"
                onClick={() => openAnnotationModal(img)}
              >
                {/* Thumbnail */}
                <div className="aspect-video relative overflow-hidden bg-slate-950 border-b border-border">
                  <img 
                    src={img.thumbnailUrl} 
                    alt="Upload thumbnail"
                    loading="lazy"
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Badge className="bg-slate-900/80 text-white hover:bg-slate-900 border-none backdrop-blur-sm text-xs">
                      {img.annotationCount} boxes
                    </Badge>
                    {img.source && (
                      <Badge className="bg-primary/80 text-white border-none backdrop-blur-sm text-xs">
                        {img.source.split(':')[0]}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Metadata Details */}
                <CardContent className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold truncate text-foreground mb-1">
                      {img.cloudinaryId.split('/').pop()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded: {new Date(img.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2">
                    <span>{img.width}x{img.height} px</span>
                    <span>{(img.fileSize / 1024).toFixed(1)} KB</span>
                  </div>
                </CardContent>

                {/* Actions Footer */}
                <div className="px-4 py-3 bg-muted/40 border-t border-border flex items-center justify-between gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                    onClick={(e) => { e.stopPropagation(); openAnnotationModal(img); }}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Annotate
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDelete(img._id, e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-4">
            <Button 
              variant="outline" 
              size="icon" 
              disabled={page === 1} 
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              return (
                <Button 
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'outline'}
                  className="w-10 h-10"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
            
            <Button 
              variant="outline" 
              size="icon" 
              disabled={page === totalPages} 
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>

      {/* Full screen Annotation Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 border border-border bg-background">
          <DialogHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between shrink-0">
            <div className="space-y-1">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-primary" />
                Image Annotator
              </DialogTitle>
              {selectedImage && (
                <p className="text-xs text-muted-foreground font-mono">
                  Cloudinary ID: {selectedImage.cloudinaryId}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          {modalLoading ? (
            <div className="flex-1 flex items-center justify-center bg-background">
              <div className="text-center space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground font-medium">Loading annotations database...</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              
              {/* Left Toolbox */}
              <div className="w-64 border-r border-border bg-card p-4 flex flex-col justify-between shrink-0 gap-6 overflow-y-auto">
                <div className="space-y-6">
                  
                  {/* Drawing Tools selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Drawing Tools</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant={currentTool === 'select' ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => setCurrentTool('select')}
                        className="justify-start gap-2 h-9"
                      >
                        <Plus className="h-3.5 w-3.5 rotate-45" />
                        Select
                      </Button>
                      <Button 
                        variant={currentTool === 'rectangle' ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => setCurrentTool('rectangle')}
                        className="justify-start gap-2 h-9"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Rect
                      </Button>
                      <Button 
                        variant={currentTool === 'polygon' ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => setCurrentTool('polygon')}
                        className="justify-start gap-2 h-9"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Poly
                      </Button>
                      <Button 
                        variant={currentTool === 'point' ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => setCurrentTool('point')}
                        className="justify-start gap-2 h-9"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Point
                      </Button>
                    </div>
                  </div>

                  {/* Zoom options */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Canvas Controls</label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="h-9 w-9">
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-semibold w-12 text-center">{Math.round(zoom * 100)}%</span>
                      <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="h-9 w-9">
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-xs">
                        Reset
                      </Button>
                    </div>
                  </div>

                  {/* Labels Section */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Labels</label>
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                      {labels.map((lbl) => (
                        <div 
                          key={lbl.id}
                          onClick={() => setSelectedLabelId(lbl.id)}
                          className={`flex items-center justify-between p-2 rounded-md border text-sm cursor-pointer transition-all duration-200 ${
                            selectedLabelId === lbl.id 
                              ? 'bg-primary/10 border-primary/50 text-primary font-semibold' 
                              : 'bg-background hover:bg-muted/50 border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: lbl.color }}></span>
                            <span className="truncate">{lbl.name}</span>
                          </div>
                          {lbl.shortcut && (
                            <kbd className="px-1.5 py-0.5 text-[10px] bg-muted border border-border text-muted-foreground rounded-sm font-mono shrink-0">
                              {lbl.shortcut}
                            </kbd>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add label input */}
                    <div className="flex gap-1.5 pt-2 border-t border-border/50">
                      <Input 
                        placeholder="New label..." 
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
                        className="h-8 text-xs"
                      />
                      <Button size="icon" variant="outline" onClick={handleAddLabel} className="h-8 w-8 shrink-0">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                </div>

                {/* Auto Annotate Section */}
                <div className="border-t border-border/50 pt-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-4 w-4 text-primary" />
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">AI Auto-Annotation</label>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Select Model</span>
                      <Select value={selectedModel} onValueChange={setSelectedModel}>
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="M873.V1" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M873.V1">M873.V1 (NanoDet)</SelectItem>
                          <SelectItem value="M873.V2">M873.V2 (YOLOv8n)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                        <span>Min Confidence</span>
                        <span>{Math.round(confidence * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.1" 
                        max="0.9" 
                        step="0.05" 
                        value={confidence} 
                        onChange={(e) => setConfidence(parseFloat(e.target.value))}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    
                    <Button 
                      disabled={isAutoAnnotating} 
                      onClick={handleAutoAnnotate} 
                      className="w-full h-8 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                    >
                      {isAutoAnnotating ? 'Detecting...' : 'Run Auto Annotation'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Center Canvas */}
              <div className="flex-1 bg-slate-950 flex items-center justify-center relative overflow-hidden">
                {selectedImage && (
                  <AnnotationCanvas 
                    imageUrl={selectedImage.imageUrl}
                    annotations={annotations}
                    currentTool={currentTool}
                    selectedLabelId={selectedLabelId}
                    selectedAnnotationId={selectedAnnotationId}
                    labels={labels}
                    zoom={zoom}
                    pan={pan}
                    onAnnotationAdd={(ann) => setAnnotations(prev => [...prev, ann])}
                    onAnnotationSelect={(id) => setSelectedAnnotationId(id)}
                    onAnnotationUpdate={(id, updates) => setAnnotations(prev => prev.map(ann => ann.id === id ? { ...ann, ...updates } as Annotation : ann))}
                    onImageUpload={() => {}}
                    onPanChange={(p) => setPan(p)}
                    onZoomIn={() => setZoom(z => Math.min(4, z + 0.25))}
                    onZoomOut={() => setZoom(z => Math.max(0.5, z - 0.25))}
                  />
                )}
              </div>

              {/* Right Annotations List */}
              <div className="w-64 border-l border-border bg-card p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Boxes ({annotations.length})</label>
                    {annotations.length > 0 && (
                      <Button variant="ghost" className="h-6 px-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setAnnotations([])}>
                        Clear All
                      </Button>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                    {annotations.length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-border rounded-lg text-xs text-muted-foreground">
                        No active annotations. Draw on the image canvas.
                      </div>
                    ) : (
                      annotations.map((ann, i) => {
                        const lbl = labels.find(l => l.id === ann.labelId);
                        return (
                          <div 
                            key={ann.id}
                            onClick={() => setSelectedAnnotationId(ann.id)}
                            className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-all duration-200 ${
                              selectedAnnotationId === ann.id
                                ? 'bg-accent border-accent text-accent-foreground font-semibold'
                                : 'bg-background hover:bg-muted/30 border-border'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ann.color }}></span>
                              <span className="font-semibold text-muted-foreground mr-1">#{i + 1}</span>
                              <span className="truncate">{lbl?.name || 'Object'}</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => { e.stopPropagation(); setAnnotations(prev => prev.filter(a => a.id !== ann.id)); }}
                              className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="border-t border-border/50 pt-4 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1 gap-2" onClick={handleSaveAnnotations}>
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
