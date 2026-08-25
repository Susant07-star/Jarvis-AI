import React, { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

interface McpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
}

export default function MCPHub() {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [newServer, setNewServer] = useState<Partial<McpServerConfig>>({ name: '', command: '', args: [] })

  const fetchServers = async () => {
    try {
      const config = await window.electron.ipcRenderer.invoke('brain:get-mcp-servers')
      setServers(config)
    } catch (e) {
      console.error('Failed to fetch MCP servers', e)
    }
  }

  useEffect(() => {
    fetchServers()
    const interval = setInterval(fetchServers, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleAddServer = async () => {
    if (!newServer.name || !newServer.command) return
    
    const config: McpServerConfig = {
      id: uuidv4(),
      name: newServer.name,
      command: newServer.command,
      args: newServer.args || []
    }

    const res = await window.electron.ipcRenderer.invoke('brain:add-mcp-server', config)
    if (res.success) {
      setIsAdding(false)
      setNewServer({ name: '', command: '', args: [] })
      fetchServers()
    } else {
      alert(`Error adding server: ${res.error}`)
    }
  }

  const handleRemoveServer = async (id: string) => {
    await window.electron.ipcRenderer.invoke('brain:remove-mcp-server', id)
    fetchServers()
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] text-white p-6 rounded-xl border border-white/5">
      <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-wide flex items-center gap-2">
            <span className="text-purple-500">🔌</span> 
            MCP Hub
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Connect local Model Context Protocol tools to J.A.R.V.I.S.
          </p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-sm rounded-md transition-colors font-medium"
        >
          + Add Server
        </button>
      </div>

      {isAdding && (
        <div className="bg-white/5 p-4 rounded-lg mb-6 border border-purple-500/30">
          <h3 className="text-sm font-semibold mb-3 text-purple-300">New MCP Connection</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Server Name</label>
              <input 
                type="text" 
                value={newServer.name}
                onChange={e => setNewServer({...newServer, name: e.target.value})}
                placeholder="e.g. Local Filesystem" 
                className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Command / Executable</label>
              <input 
                type="text" 
                value={newServer.command}
                onChange={e => setNewServer({...newServer, command: e.target.value})}
                placeholder="e.g. npx" 
                className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1">Arguments (comma separated)</label>
            <input 
              type="text" 
              value={newServer.args?.join(', ')}
              onChange={e => setNewServer({...newServer, args: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
              placeholder="e.g. -y, @modelcontextprotocol/server-filesystem, C:\Users" 
              className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button 
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-sm rounded transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleAddServer}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-sm rounded transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {servers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 italic">
            No MCP servers connected. Add one to expand J.A.R.V.I.S. capabilities.
          </div>
        ) : (
          servers.map(server => (
            <div key={server.id} className="bg-white/5 border border-white/10 rounded-lg p-4 flex flex-col hover:border-purple-500/50 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium text-purple-200">{server.name}</h3>
                <span className="flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              </div>
              
              <div className="text-xs text-gray-400 font-mono bg-black/50 p-2 rounded mb-4 overflow-hidden text-ellipsis whitespace-nowrap">
                {server.command} {server.args.join(' ')}
              </div>

              <div className="mt-auto flex justify-end">
                <button 
                  onClick={() => handleRemoveServer(server.id)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors bg-red-950/30 px-3 py-1 rounded border border-red-900/50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
