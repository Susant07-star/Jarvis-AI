import React, { useEffect, useState } from 'react'

interface ScheduledTask {
  id: string
  chatId: number
  type: 'call' | 'message' | 'alarm'
  content: string
  executionTime: number
}

export default function SchedulerView() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])

  const fetchTasks = async () => {
    try {
      const activeTasks = await window.electron.ipcRenderer.invoke('brain:get-scheduler')
      setTasks(activeTasks)
    } catch (e) {
      console.error('Failed to fetch scheduler tasks', e)
    }
  }

  useEffect(() => {
    fetchTasks()
    // Poll every 5 seconds to keep the scheduler UI fresh
    const interval = setInterval(fetchTasks, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] text-white p-6 rounded-xl border border-white/5">
      <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-wide flex items-center gap-2">
            <span className="text-blue-500">⏱</span> 
            Task Scheduler
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Active Neural Routines and Background Jobs
          </p>
        </div>
        <button 
          onClick={fetchTasks}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-sm rounded-md transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium rounded-tl-md">ID</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Payload</th>
              <th className="px-4 py-3 font-medium rounded-tr-md">Time Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500 italic">
                  No active routines scheduled.
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const now = Date.now()
                const diff = task.executionTime - now
                const seconds = Math.max(0, Math.floor(diff / 1000))
                
                const formatTime = (sec: number) => {
                  const m = Math.floor(sec / 60)
                  const s = sec % 60
                  return `${m}m ${s}s`
                }

                return (
                  <tr key={task.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{task.id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs uppercase tracking-wider ${
                        task.type === 'call' ? 'bg-green-500/20 text-green-400' :
                        task.type === 'message' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {task.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 truncate max-w-[300px]">
                      {task.content}
                    </td>
                    <td className="px-4 py-3 text-blue-300 font-mono">
                      {formatTime(seconds)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
