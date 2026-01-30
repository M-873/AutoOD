import { MousePointer2, Square, Pentagon, CircleDot, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Save, Download, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToolType } from '@/types/annotation';

interface ModelOption {
  id: string;
  name: string;
  description?: string;
}

interface AnnotationToolbarProps {
  currentTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onAutoAnnotate: () => void;
  onBatchAutoAnnotate?: () => void;
  isAutoAnnotating: boolean;
  canAutoAnnotate: boolean;
  canBatchAutoAnnotate?: boolean;
  models: ModelOption[];
  onExport: () => void;
  // Navigation controls
  onPreviousImage?: () => void;
  onNextImage?: () => void;
  canPreviousImage?: boolean;
  canNextImage?: boolean;
  currentImageIndex?: number;
  totalImages?: number;
}

const tools = [
  { id: 'select' as ToolType, icon: MousePointer2, label: 'Select (V)', shortcut: 'V' },
  { id: 'rectangle' as ToolType, icon: Square, label: 'Rectangle (R)', shortcut: 'R' },
  { id: 'polygon' as ToolType, icon: Pentagon, label: 'Polygon (P)', shortcut: 'P' },
  { id: 'point' as ToolType, icon: CircleDot, label: 'Point (O)', shortcut: 'O' },
];

export const AnnotationToolbar = ({
  currentTool,
  onToolChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  selectedModel,
  onModelChange,
  onAutoAnnotate,
  onBatchAutoAnnotate,
  isAutoAnnotating,
  canAutoAnnotate,
  canBatchAutoAnnotate,
  models,
  onExport,
  onPreviousImage,
  onNextImage,
  canPreviousImage,
  canNextImage,
  currentImageIndex,
  totalImages,
}: AnnotationToolbarProps) => {
  return (
    <div className="h-12 bg-toolbar-bg border-b border-border flex items-center px-2 gap-1">
      {/* Drawing Tools */}
      <div className="flex items-center gap-1">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = currentTool === tool.id;
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? 'toolbarActive' : 'toolbar'}
                  size="iconSm"
                  onClick={() => onToolChange(tool.id)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{tool.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <Separator orientation="vertical" className="h-6 mx-2" />

      {/* History */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="iconSm" onClick={onUndo} disabled={!canUndo}>
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Undo (Ctrl+Z)</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="iconSm" onClick={onRedo} disabled={!canRedo}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Redo (Ctrl+Y)</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6 mx-2" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="iconSm" onClick={onZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Zoom Out (-)</p>
          </TooltipContent>
        </Tooltip>
        <span className="text-sm text-muted-foreground w-14 text-center font-mono">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="iconSm" onClick={onZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Zoom In (+)</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="iconSm" onClick={onFitToScreen}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Fit to Screen (F)</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6 mx-2" />

      {/* AI Auto-Annotation */}
      <div className="flex items-center gap-2">
        <Select value={selectedModel} onValueChange={onModelChange}>
          <SelectTrigger className="w-[180px] h-8 bg-secondary border-border text-sm">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex flex-col">
                  <span>{model.name}</span>
                  <span className="text-xs text-muted-foreground">{model.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              onClick={onAutoAnnotate}
              disabled={!canAutoAnnotate || isAutoAnnotating}
              className="gap-2"
            >
              {isAutoAnnotating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Auto Annotate
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Use AI to detect and annotate objects (requires image & labels)</p>
          </TooltipContent>
        </Tooltip>

        {onBatchAutoAnnotate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onBatchAutoAnnotate}
                disabled={!canBatchAutoAnnotate || isAutoAnnotating}
                className="gap-2"
              >
                {isAutoAnnotating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Batch Auto Annotate
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Use AI to detect and annotate objects in all uploaded images</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Navigation Controls - Previous/Next buttons */}
        {onPreviousImage && onNextImage && totalImages && totalImages > 1 && (
          <div className="flex items-center gap-1 ml-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPreviousImage}
                  disabled={!canPreviousImage}
                >
                  ← Previous
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Previous Image</p>
              </TooltipContent>
            </Tooltip>
            
            <span className="text-sm font-medium px-2 min-w-[60px] text-center">
              {(currentImageIndex || 0) + 1} / {totalImages}
            </span>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNextImage}
                  disabled={!canNextImage}
                >
                  Next →
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Next Image</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="toolbar" size="iconSm" onClick={onExport}>
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Export Annotations</p>
          </TooltipContent>
        </Tooltip>
        <Button size="sm" onClick={onSave}>
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  );
};
