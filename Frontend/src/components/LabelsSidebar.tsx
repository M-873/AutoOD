import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Tag, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label, Annotation } from '@/types/annotation';
import { cn } from '@/lib/utils';

interface LabelsSidebarProps {
  labels: Label[];
  annotations: Annotation[];
  selectedLabelId: string | null;
  selectedAnnotationId: string | null;
  onLabelSelect: (labelId: string) => void;
  onAnnotationSelect: (annotationId: string) => void;
  onLabelAdd: (name: string, color: string) => void;
  onLabelDelete: (labelId: string) => void;
  onLabelColorChange: (labelId: string, color: string) => void;
  onAnnotationDelete: (annotationId: string) => void;
}

const presetColors = [
  '#3B82F6', '#10B981', '#F97316', '#EC4899', '#06B6D4', '#EAB308',
  '#8B5CF6', '#EF4444', '#14B8A6', '#F59E0B', '#6366F1', '#84CC16',
];

export const LabelsSidebar = ({
  labels,
  annotations,
  selectedLabelId,
  selectedAnnotationId,
  onLabelSelect,
  onAnnotationSelect,
  onLabelAdd,
  onLabelDelete,
  onLabelColorChange,
  onAnnotationDelete,
}: LabelsSidebarProps) => {
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(presetColors[0]);
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set(labels.map(l => l.id)));

  const handleAddLabel = () => {
    if (newLabelName.trim()) {
      onLabelAdd(newLabelName.trim(), newLabelColor);
      setNewLabelName('');
      setNewLabelColor(presetColors[(labels.length + 1) % presetColors.length]);
      setIsAddingLabel(false);
    }
  };

  const toggleLabelExpanded = (labelId: string) => {
    const newExpanded = new Set(expandedLabels);
    if (newExpanded.has(labelId)) {
      newExpanded.delete(labelId);
    } else {
      newExpanded.add(labelId);
    }
    setExpandedLabels(newExpanded);
  };

  const getAnnotationsForLabel = (labelId: string) => {
    return annotations.filter(a => a.labelId === labelId);
  };

  return (
    <div className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-sidebar-border flex items-center justify-between">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Labels
        </h3>
        <Button
          variant="ghost"
          size="iconXs"
          onClick={() => setIsAddingLabel(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Add Label Form */}
      {isAddingLabel && (
        <div className="p-3 border-b border-sidebar-border bg-sidebar-accent">
          <Input
            placeholder="Label name..."
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
            className="mb-2 h-8 text-sm bg-sidebar"
            autoFocus
          />
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">Color:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-2" style={{ backgroundColor: newLabelColor, borderColor: newLabelColor }}>
                  <span className="sr-only">Pick color</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="start">
                <div className="grid grid-cols-6 gap-1">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      className={cn(
                        "h-6 w-6 rounded border-2 transition-transform hover:scale-110",
                        newLabelColor === color ? "border-foreground" : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewLabelColor(color)}
                    />
                  ))}
                </div>
                <Input
                  type="color"
                  value={newLabelColor}
                  onChange={(e) => setNewLabelColor(e.target.value)}
                  className="w-full h-8 mt-2 p-0 border-0 cursor-pointer"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleAddLabel}>
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => {
                setIsAddingLabel(false);
                setNewLabelName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Labels List */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {labels.map((label) => {
          const labelAnnotations = getAnnotationsForLabel(label.id);
          const isExpanded = expandedLabels.has(label.id);
          const isSelected = selectedLabelId === label.id;
          const hasSelectedAnnotation = labelAnnotations.some(a => a.id === selectedAnnotationId);

          return (
            <div key={label.id}>
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-sidebar-accent transition-colors group",
                  (isSelected || hasSelectedAnnotation) && "bg-sidebar-accent"
                )}
                onClick={() => onLabelSelect(label.id)}
              >
                <Button
                  variant="ghost"
                  size="iconXs"
                  className="h-5 w-5 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLabelExpanded(label.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
                
                {/* Color picker for label */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="w-4 h-4 rounded-sm flex-shrink-0 border border-border/50 hover:scale-110 transition-transform"
                      style={{ backgroundColor: label.color }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="grid grid-cols-6 gap-1">
                      {presetColors.map((color) => (
                        <button
                          key={color}
                          className={cn(
                            "h-6 w-6 rounded border-2 transition-transform hover:scale-110",
                            label.color === color ? "border-foreground" : "border-transparent"
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => onLabelColorChange(label.id, color)}
                        />
                      ))}
                    </div>
                    <Input
                      type="color"
                      value={label.color}
                      onChange={(e) => onLabelColorChange(label.id, e.target.value)}
                      className="w-full h-8 mt-2 p-0 border-0 cursor-pointer"
                    />
                  </PopoverContent>
                </Popover>

                <span className="flex-1 text-sm truncate">{label.name}</span>
                <span className="text-xs text-muted-foreground">
                  {labelAnnotations.length}
                </span>
                <Button
                  variant="ghost"
                  size="iconXs"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLabelDelete(label.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Annotations under label */}
              {isExpanded && labelAnnotations.length > 0 && (
                <div className="ml-6 border-l border-sidebar-border">
                  {labelAnnotations.map((annotation, index) => (
                    <div
                      key={annotation.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-sidebar-accent transition-colors text-sm group border-l-2",
                        selectedAnnotationId === annotation.id 
                          ? "bg-sidebar-accent border-l-primary font-medium" 
                          : "border-l-transparent"
                      )}
                      onClick={() => onAnnotationSelect(annotation.id)}
                    >
                      <span className="text-muted-foreground text-xs">
                        {annotation.type === 'rectangle' && '▢'}
                        {annotation.type === 'polygon' && '⬡'}
                        {annotation.type === 'point' && '●'}
                      </span>
                      <span className="flex-1 truncate text-muted-foreground">
                        {label.name} #{index + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="iconXs"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnnotationDelete(annotation.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {labels.length === 0 && (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No labels yet. Click + to add one.
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="p-3 border-t border-sidebar-border text-xs text-muted-foreground">
        {annotations.length} annotations • {labels.length} labels
      </div>
    </div>
  );
};
