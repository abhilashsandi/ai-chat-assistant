import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const ApprovalTasks: React.FC = () => {
  const queryClient = useQueryClient();
  
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3001/api/tasks');
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
    refetchInterval: 2000 // Poll every 2 seconds for new tasks
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`http://localhost:3001/api/tasks/${taskId}/complete`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to complete task');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });

  if (isLoading || !tasks || tasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {tasks.map((task: any) => (
        <div key={task.userTaskKey} className="border-2 border-orange-300 bg-orange-50 rounded-lg p-4 shadow-sm flex items-center justify-between animate-pulse">
          <div>
            <h3 className="font-bold text-orange-800">Action Requires Approval</h3>
            <p className="text-sm text-orange-700">Task: {task.elementId} (Process ID: {task.processInstanceKey})</p>
          </div>
          <button 
            onClick={() => completeMutation.mutate(task.userTaskKey)}
            disabled={completeMutation.isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded shadow font-semibold disabled:opacity-50"
          >
            {completeMutation.isPending ? 'Approving...' : 'Approve Action'}
          </button>
        </div>
      ))}
    </div>
  );
};
