import { useState, useEffect } from "react";
import { Plus, Trash2, RefreshCw, Zap, Server, ChevronDown, ChevronUp, AlertCircle, CheckCircle } from "lucide-react";

interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpTool {
  type: string;
  function: { name: string; description: string };
}

const MCP_PRESETS = [
  {
    name: "GitHub",
    id: "github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    placeholder: "Requires GITHUB_PERSONAL_ACCESS_TOKEN"
  },
  {
    name: "Filesystem",
    id: "filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/"],
    env: {},
    placeholder: "Reads local files (path: /)"
  },
  {
    name: "Brave Search",
    id: "brave-search",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" },
    placeholder: "Requires BRAVE_API_KEY"
  }
];

export default function McpSettings() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  // Form state
  const [form, setForm] = useState({
    id: "",
    name: "",
    command: "npx",
    args: "",
    envKey: "",
    envValue: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp/list");
      const data = await res.json();
      if (data.success) {
        setServers(data.servers || []);
      }

      const toolsRes = await fetch("/api/mcp/tools");
      const toolsData = await toolsRes.json();
      if (toolsData.success) {
        setTools(toolsData.tools || []);
      }
    } catch (e) {
      console.error("Failed to fetch MCP data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRemove = async (id: string) => {
    try {
      await fetch(`/api/mcp/remove/${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      console.error("Failed to remove MCP server", e);
    }
  };

  const handlePreset = (preset: typeof MCP_PRESETS[0]) => {
    setForm({
      id: preset.id,
      name: preset.name,
      command: preset.command,
      args: preset.args.join(" "),
      envKey: Object.keys(preset.env)[0] || "",
      envValue: "",
    });
    setShowAddForm(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    setAddSuccess("");

    if (!form.id || !form.name || !form.command) {
      setAddError("ID, name, and command are required.");
      return;
    }

    const env: Record<string, string> = {};
    if (form.envKey && form.envValue) {
      env[form.envKey] = form.envValue;
    }

    const argsArr = form.args.trim().split(/\s+/).filter(Boolean);
    // Remove command from args if user included it
    const args = argsArr[0] === form.command ? argsArr.slice(1) : argsArr;

    try {
      const res = await fetch("/api/mcp/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id, name: form.name, command: form.command, args, env }),
      });
      const data = await res.json();
      if (data.success) {
        setAddSuccess(`✓ "${form.name}" connected!`);
        setForm({ id: "", name: "", command: "npx", args: "", envKey: "", envValue: "" });
        setTimeout(() => {
          setShowAddForm(false);
          setAddSuccess("");
          fetchData();
        }, 1500);
      } else {
        setAddError(data.error || "Failed to add server.");
      }
    } catch (err: any) {
      setAddError(err.message);
    }
  };

  return (
    <div style={{
      height: "100%",
      overflowY: "auto",
      padding: "24px",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 100%)",
      color: "#e2e8f0",
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "10px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Zap size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f1f5f9" }}>
              MCP Integrations
            </h2>
            <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
              Model Context Protocol · Plug in any tool
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={fetchData}
            style={{
              background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: "8px", padding: "8px 12px", color: "#818cf8",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontSize: "12px"
            }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none",
              borderRadius: "8px", padding: "8px 14px", color: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              fontSize: "12px", fontWeight: 600
            }}
          >
            <Plus size={13} /> Add Integration
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div style={{
        background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
        borderRadius: "10px", padding: "12px 16px", marginBottom: "20px",
        display: "flex", alignItems: "flex-start", gap: "10px"
      }}>
        <AlertCircle size={16} color="#818cf8" style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.6 }}>
          MCP (Model Context Protocol) lets Jarvis use <strong style={{ color: "#a5b4fc" }}>external tools</strong> like GitHub, Google Drive, Notion, and more — without custom code.
          Each server you add gives Jarvis new superpowers instantly.
        </p>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={{
          background: "rgba(15,20,30,0.9)", border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: "12px", padding: "20px", marginBottom: "20px",
          backdropFilter: "blur(10px)"
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#c7d2fe" }}>
            New Integration
          </h3>

          {/* Presets */}
          <div style={{ marginBottom: "16px" }}>
            <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Quick Presets
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {MCP_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePreset(p)}
                  style={{
                    background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
                    borderRadius: "6px", padding: "6px 12px", color: "#a5b4fc",
                    cursor: "pointer", fontSize: "12px", fontWeight: 500
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleAdd}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>ID (unique slug)</label>
                <input
                  value={form.id} onChange={e => setForm({ ...form, id: e.target.value })}
                  placeholder="e.g. github"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>Display Name</label>
                <input
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. GitHub"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>Command + Args (full npx command)</label>
              <input
                value={form.args} onChange={e => setForm({ ...form, args: e.target.value })}
                placeholder="e.g. -y @modelcontextprotocol/server-github"
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>Env Key (optional)</label>
                <input
                  value={form.envKey} onChange={e => setForm({ ...form, envKey: e.target.value })}
                  placeholder="e.g. GITHUB_PERSONAL_ACCESS_TOKEN"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>Env Value (secret token)</label>
                <input
                  type="password"
                  value={form.envValue} onChange={e => setForm({ ...form, envValue: e.target.value })}
                  placeholder="your-secret-token"
                  style={inputStyle}
                />
              </div>
            </div>

            {addError && (
              <p style={{ color: "#f87171", fontSize: "12px", marginBottom: "12px" }}>⚠ {addError}</p>
            )}
            {addSuccess && (
              <p style={{ color: "#4ade80", fontSize: "12px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle size={13} /> {addSuccess}
              </p>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none",
                borderRadius: "8px", padding: "9px 18px", color: "#fff", cursor: "pointer",
                fontSize: "13px", fontWeight: 600
              }}>
                Connect
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px", padding: "9px 18px", color: "#94a3b8", cursor: "pointer",
                fontSize: "13px"
              }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active Servers */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
          <RefreshCw size={20} style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ marginTop: "12px", fontSize: "13px" }}>Loading integrations...</p>
        </div>
      ) : servers.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "50px 20px",
          border: "1px dashed rgba(99,102,241,0.2)", borderRadius: "12px", color: "#64748b"
        }}>
          <Server size={40} style={{ opacity: 0.3, marginBottom: "12px" }} />
          <p style={{ fontSize: "14px", margin: 0 }}>No integrations connected yet.</p>
          <p style={{ fontSize: "12px", marginTop: "6px" }}>Add GitHub, Filesystem, or any MCP server above.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {servers.map(server => {
            const serverTools = tools.filter(t => t.function.name.includes(`mcp_${server.id}_`));
            const isExpanded = expandedServer === server.id;
            return (
              <div
                key={server.id}
                style={{
                  background: "rgba(15,20,30,0.7)", border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: "10px", overflow: "hidden"
                }}
              >
                <div
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px", cursor: "pointer"
                  }}
                  onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: serverTools.length > 0 ? "#4ade80" : "#f59e0b",
                      boxShadow: `0 0 6px ${serverTools.length > 0 ? "#4ade80" : "#f59e0b"}`
                    }} />
                    <div>
                      <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#f1f5f9" }}>{server.name}</p>
                      <p style={{ margin: 0, fontSize: "11px", color: "#64748b" }}>
                        {serverTools.length} tools · {server.command} {server.args.join(" ")}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(server.id); }}
                      style={{
                        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                        borderRadius: "6px", padding: "5px 8px", color: "#f87171",
                        cursor: "pointer", display: "flex", alignItems: "center"
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
                  </div>
                </div>

                {isExpanded && serverTools.length > 0 && (
                  <div style={{ borderTop: "1px solid rgba(99,102,241,0.1)", padding: "12px 16px" }}>
                    <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Available Tools
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {serverTools.map((t, i) => (
                        <div key={i} style={{
                          background: "rgba(99,102,241,0.05)", borderRadius: "6px", padding: "8px 10px"
                        }}>
                          <p style={{ margin: 0, fontSize: "12px", fontWeight: 500, color: "#a5b4fc", fontFamily: "monospace" }}>
                            {t.function.name}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748b" }}>
                            {t.function.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(99,102,241,0.2)",
  borderRadius: "7px",
  padding: "8px 12px",
  color: "#e2e8f0",
  fontSize: "13px",
  outline: "none",
  boxSizing: "border-box",
};
