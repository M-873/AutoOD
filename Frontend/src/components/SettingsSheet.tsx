import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Settings, Sun, Moon, Palette } from 'lucide-react';

interface SettingsSheetProps {
  brightness?: number;
  onBrightnessChange?: (brightness: number) => void;
  labelOpacity?: number;
  onLabelOpacityChange?: (opacity: number) => void;
  triggerButton?: React.ReactNode;
}

export const SettingsSheet = ({ 
  brightness = 100, 
  onBrightnessChange, 
  labelOpacity = 25, 
  onLabelOpacityChange,
  triggerButton
}: SettingsSheetProps) => {
  const [open, setOpen] = useState(false);

  const handleBrightnessIncrease = () => {
    const newBrightness = Math.min(brightness + 10, 200);
    onBrightnessChange?.(newBrightness);
  };

  const handleBrightnessDecrease = () => {
    const newBrightness = Math.max(brightness - 10, 20);
    onBrightnessChange?.(newBrightness);
  };

  const handleLabelOpacityIncrease = () => {
    const newOpacity = Math.min(labelOpacity + 5, 100);
    onLabelOpacityChange?.(newOpacity);
  };

  const handleLabelOpacityDecrease = () => {
    const newOpacity = Math.max(labelOpacity - 5, 5);
    onLabelOpacityChange?.(newOpacity);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {triggerButton || (
          <Button variant="ghost" size="iconSm">
            <Settings className="h-5 w-5" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Adjust brightness and label opacity settings
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-6 py-4">
          {/* Brightness Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4" />
              <Label htmlFor="brightness" className="text-base font-medium">
                Brightness
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleBrightnessDecrease}
                className="flex-1"
              >
                <Moon className="h-4 w-4 mr-2" />
                Decrease
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleBrightnessIncrease}
                className="flex-1"
              >
                <Sun className="h-4 w-4 mr-2" />
                Increase
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground min-w-[3rem]">
                {brightness}%
              </span>
              <Slider
                id="brightness"
                value={[brightness]}
                onValueChange={([value]) => onBrightnessChange?.(value)}
                min={20}
                max={200}
                step={5}
                className="flex-1"
              />
            </div>
          </div>

          {/* Label Opacity Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <Label htmlFor="labelOpacity" className="text-base font-medium">
                Label Opacity
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLabelOpacityDecrease}
                className="flex-1"
              >
                Decrease
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLabelOpacityIncrease}
                className="flex-1"
              >
                Increase
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground min-w-[3rem]">
                {labelOpacity}%
              </span>
              <Slider
                id="labelOpacity"
                value={[labelOpacity]}
                onValueChange={([value]) => onLabelOpacityChange?.(value)}
                min={5}
                max={100}
                step={5}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};