import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { TaskList } from '@/components/TaskList';
import { AnnotationEditor } from '@/components/AnnotationEditor';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

const AppDashboard = () => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [labelOpacity, setLabelOpacity] = useState(25);
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header 
        onSignOut={signOut} 
        userEmail={user.email}
        brightness={brightness}
        onBrightnessChange={setBrightness}
        labelOpacity={labelOpacity}
        onLabelOpacityChange={setLabelOpacity}
      />
      <main className="flex-1 overflow-hidden">
        {selectedTaskId ? (
          <AnnotationEditor
            taskId={selectedTaskId}
            onBack={() => setSelectedTaskId(null)}
            labelOpacity={labelOpacity}
          />
        ) : (
          <TaskList onTaskSelect={setSelectedTaskId} />
        )}
      </main>
    </div>
  );
};

export default AppDashboard;
