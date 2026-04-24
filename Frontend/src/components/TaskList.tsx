import { useState, useEffect } from 'react';
import { Plus, Search, Filter, MoreVertical, Play, CheckCircle2, Clock, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { CreateTaskDialog } from './CreateTaskDialog';
import { format } from 'date-fns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface TaskListProps {
  onTaskSelect: (taskId: string) => void;
}

interface Task {
  id: string;
  name: string;
  status: string;
  progress: number;
  assignee: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { icon: typeof AlertCircle; label: string; color: string }> = {
  pending: { icon: AlertCircle, label: 'Pending', color: 'text-muted-foreground' },
  in_progress: { icon: Play, label: 'In Progress', color: 'text-primary' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-success' },
  review: { icon: Clock, label: 'Review', color: 'text-warning' },
};

export const TaskList = ({ onTaskSelect }: TaskListProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const isDemoMode = import.meta.env.VITE_SUPABASE_URL === undefined || String(import.meta.env.VITE_SUPABASE_URL).includes('placeholder');
      
      if (isDemoMode) {
        const demoTasks = JSON.parse(localStorage.getItem('demo_tasks') || '[]');
        demoTasks.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setTasks(demoTasks);
      } else {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTasks(data || []);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const isDemoMode = import.meta.env.VITE_SUPABASE_URL === undefined || String(import.meta.env.VITE_SUPABASE_URL).includes('placeholder');
      if (isDemoMode) {
        const demoTasks = JSON.parse(localStorage.getItem('demo_tasks') || '[]');
        const updatedTasks = demoTasks.filter((t: any) => t.id !== taskId);
        localStorage.setItem('demo_tasks', JSON.stringify(updatedTasks));
        fetchTasks();
        toast.success("Project deleted successfully");
        return;
      }
      
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      
      fetchTasks();
      toast.success("Project deleted successfully");
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Failed to delete project');
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const filteredTasks = tasks.filter(task =>
    task.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Projects</h2>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Project
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-secondary border-border"
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Task Table */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-lg mb-2">No projects yet</p>
            <p className="text-sm">Click "Create Project" to get started</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="p-4 font-medium">#</th>
                <th className="p-4 font-medium">Project Name</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Progress</th>
                <th className="p-4 font-medium">Updated</th>
                <th className="p-4 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task, index) => {
                const config = statusConfig[task.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                return (
                  <tr
                    key={task.id}
                    className="border-b border-border hover:bg-secondary/50 cursor-pointer transition-colors"
                    onClick={() => onTaskSelect(task.id)}
                  >
                    <td className="p-4 text-muted-foreground">{index + 1}</td>
                    <td className="p-4">
                      <span className="font-medium">{task.name}</span>
                    </td>
                    <td className="p-4">
                      <div className={cn("flex items-center gap-2", config.color)}>
                        <StatusIcon className="h-4 w-4" />
                        <span className="text-sm">{config.label}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              task.progress === 100 ? "bg-success" : "bg-primary"
                            )}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {task.progress}%
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground text-sm">
                      {format(new Date(task.updated_at), 'MMM d, yyyy')}
                    </td>
                    <td className="p-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px]">
                          <DropdownMenuItem 
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                            onClick={(e) => handleDeleteTask(task.id, e as any)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border text-sm text-muted-foreground">
        Showing {filteredTasks.length} of {tasks.length} projects
      </div>

      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onTaskCreated={fetchTasks}
      />
    </div>
  );
};
