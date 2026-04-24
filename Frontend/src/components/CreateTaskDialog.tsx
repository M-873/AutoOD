import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const taskSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100, 'Project name must be less than 100 characters'),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated: () => void;
}

export const CreateTaskDialog = ({ open, onOpenChange, onTaskCreated }: CreateTaskDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (data: TaskFormData) => {
    setIsLoading(true);
    try {
      const isDemoMode = import.meta.env.VITE_SUPABASE_URL === undefined || String(import.meta.env.VITE_SUPABASE_URL).includes('placeholder');
      
      let userId = 'demo-user-id';
      if (!isDemoMode) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          throw new Error('You must be logged in to create a project');
        }
        userId = userData.user.id;
      } else {
        const demoUser = localStorage.getItem('demo_user_auth');
        if (!demoUser) throw new Error('You must be logged in to create a project');
        userId = JSON.parse(demoUser).id;
      }

      if (isDemoMode) {
        const newTask = {
          id: Math.random().toString(36).substring(2, 11),
          name: data.name,
          assignee: null,
          user_id: userId,
          image_url: null,
          status: 'pending',
          progress: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const tasks = JSON.parse(localStorage.getItem('demo_tasks') || '[]');
        tasks.push(newTask);
        localStorage.setItem('demo_tasks', JSON.stringify(tasks));
      } else {
        const { error } = await supabase.from('tasks').insert({
          name: data.name,
          assignee: null,
          user_id: userId,
          image_url: null,
          status: 'pending',
          progress: 0,
        });
        if (error) throw error;
      }

      toast.success('Project created successfully');
      form.reset();
      onOpenChange(false);
      onTaskCreated();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Street Scene Dataset" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Done
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};