import React from 'react';
import { Home, Settings, Menu, Image } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SettingsSheet } from '@/components/SettingsSheet';

interface HamburgerMenuProps {
  brightness?: number;
  onBrightnessChange?: (brightness: number) => void;
  labelOpacity?: number;
  onLabelOpacityChange?: (opacity: number) => void;
  onHomeClick?: () => void;
}

export const HamburgerMenu = ({ 
  brightness = 100, 
  onBrightnessChange, 
  labelOpacity = 25, 
  onLabelOpacityChange,
  onHomeClick
}: HamburgerMenuProps) => {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();

  const handleHomeClick = () => {
    onHomeClick?.();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="iconSm">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-2">
          <Button 
            variant="ghost" 
            className="w-full justify-start" 
            onClick={handleHomeClick}
          >
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>

          <Button 
            variant="ghost" 
            className="w-full justify-start" 
            onClick={() => {
              navigate('/gallery');
              setOpen(false);
            }}
          >
            <Image className="h-4 w-4 mr-2" />
            Image Gallery
          </Button>
          
          <SettingsSheet 
            brightness={brightness}
            onBrightnessChange={onBrightnessChange}
            labelOpacity={labelOpacity}
            onLabelOpacityChange={onLabelOpacityChange}
            triggerButton = {
              <Button variant="ghost" className="w-full justify-start">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};