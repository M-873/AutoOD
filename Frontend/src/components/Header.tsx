import { User, HelpCircle, Bell, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { HamburgerMenu } from '@/components/HamburgerMenu';
const Logo = () => (
  <div className="text-xl font-bold tracking-tight cursor-pointer">
    MyApp
  </div>
);
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onMenuClick?: () => void;
  onSignOut?: () => void;
  userEmail?: string | null;
  brightness?: number;
  onBrightnessChange?: (brightness: number) => void;
  labelOpacity?: number;
  onLabelOpacityChange?: (opacity: number) => void;
}

export const Header = ({ 
  onMenuClick, 
  onSignOut, 
  userEmail, 
  brightness = 100, 
  onBrightnessChange, 
  labelOpacity = 25, 
  onLabelOpacityChange 
}: HeaderProps) => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (onSignOut) {
      await onSignOut();
      toast.success('Signed out successfully');
    }
  };

  const handleHomeClick = () => {
    navigate('/');
  };

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <HamburgerMenu 
          brightness={brightness}
          onBrightnessChange={onBrightnessChange}
          labelOpacity={labelOpacity}
          onLabelOpacityChange={onLabelOpacityChange}
          onHomeClick={handleHomeClick}
        />
        <Logo />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="iconSm">
          <HelpCircle className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="iconSm">
          <Bell className="h-5 w-5" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" className="ml-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {userEmail && (
              <>
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{userEmail}</p>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
