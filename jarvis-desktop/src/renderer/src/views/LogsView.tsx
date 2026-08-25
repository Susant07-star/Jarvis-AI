import React, { useEffect, useState, useRef } from 'react'

export default function LogsView() {
  const [logs, setLogs] = useState<string[]>([])
  const endOfLogsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Listen for log events from the Brain Daemon
    const unsubscribe = window.electron.ipcRenderer.on('brain:log', (_event, logLine: string) => {
      setLogs((prev) => [...prev.slice(-999), logLine]) // Keep last 1000 lines
    })

    return () => {
      // Clean up listener
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      } else {
        window.electron.ipcRenderer.removeAllListeners('brain:log')
      }
    }
  }, [])

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    endOfLogsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="flex flex-col h-full w-full bg-black/95 border border-white/10 rounded-xl overflow-hidden font-mono p-4 shadow-2xl">
      <div className="flex justify-between items-center pb-2 border-b border-white/10 mb-2">
        <h2 className="text-white font-bold tracking-widest text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          J.A.R.V.I.S. NEURAL LOGS
        </h2>
        <button 
          onClick={() => setLogs([])}
          className="text-xs text-red-400 hover:text-red-300 transition-colors bg-red-950/30 px-3 py-1 rounded-md border border-red-900/50"
        >
          CLEAR
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 text-xs sm:text-sm text-gray-300">
        {logs.length === 0 ? (
          <div className="text-gray-500 italic mt-4 text-center">
            Awaiting neural activity...
          </div>
        ) : (
          logs.map((log, index) => {
            // Basic syntax highlighting for log levels
            let color = 'text-gray-300'
            if (log.includes('[ERROR]')) color = 'text-red-400'
            else if (log.includes('[WARN]')) color = 'text-yellow-400'
            else if (log.includes('[INFO]')) color = 'text-blue-300'
            else if (log.includes('[DEBUG]')) color = 'text-purple-400'

            return (
              <div key={index} className={`break-words ${color} hover:bg-white/5 px-1 rounded`}>
                {log}
              </div>
            )
          })
        )}
        <div ref={endOfLogsRef} />
      </div>
    </div>
  )
}
