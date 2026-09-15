import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from './logger';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'mcp_config.json');

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class McpManager {
  private static clients: Map<string, Client> = new Map();
  private static config: McpServerConfig[] = [];
  
  static async initialize() {
    this.loadConfig();
    await this.connectAll();
  }

  static loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
        this.config = JSON.parse(data);
      } else {
        this.config = [];
        if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
          fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        }
        fs.writeFileSync(CONFIG_PATH, JSON.stringify([], null, 2));
      }
    } catch (err: any) {
      logger.error("MCP", `Failed to load config: ${err.message}`);
    }
  }

  static saveConfig() {
    try {
      if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
    } catch (err: any) {
      logger.error("MCP", `Failed to save config: ${err.message}`);
    }
  }

  static getConfig() {
    return this.config;
  }

  static async addServer(config: McpServerConfig) {
    this.config.push(config);
    this.saveConfig();
    await this.connect(config);
  }

  static async removeServer(id: string) {
    this.config = this.config.filter(c => c.id !== id);
    this.saveConfig();
    const client = this.clients.get(id);
    if (client) {
      try {
        await client.close();
      } catch (err) {}
      this.clients.delete(id);
    }
  }

  private static async connectAll() {
    for (const conf of this.config) {
      await this.connect(conf);
    }
  }

  private static async connect(config: McpServerConfig) {
    if (this.clients.has(config.id)) {
      return; // already connected
    }

    try {
      logger.info("MCP", `Connecting to server: ${config.name}`);
      
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env }
      });

      const client = new Client(
        { name: "jarvis-hub", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);
      this.clients.set(config.id, client);
      logger.info("MCP", `Successfully connected to: ${config.name}`);
    } catch (err: any) {
      logger.error("MCP", `Failed to connect to ${config.name}: ${err.message}`);
    }
  }

  static async getAllTools(): Promise<any[]> {
    const allTools: any[] = [];
    
    for (const [id, client] of this.clients.entries()) {
      try {
        const response = await client.listTools();
        if (response && response.tools) {
          for (const tool of response.tools) {
            // Namespace the tool name to avoid collisions
            const namespacedName = `mcp_${id}_${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            
            // Format for Gemini schema
            allTools.push({
              type: "function",
              function: {
                name: namespacedName,
                description: `[MCP: ${id}] ${tool.description || ''}`,
                parameters: {
                  type: "object",
                  properties: tool.inputSchema?.properties || {},
                  required: tool.inputSchema?.required || []
                }
              }
            });
          }
        }
      } catch (err: any) {
        logger.error("MCP", `Error fetching tools from ${id}: ${err.message}`);
      }
    }
    
    return allTools;
  }

  static async callTool(namespacedName: string, args: any): Promise<string> {
    const match = namespacedName.match(/^mcp_([^_]+)_(.+)$/);
    if (!match) {
      return `Error: Invalid MCP tool name format: ${namespacedName}`;
    }

    const serverId = match[1];
    const originalToolName = match[2];

    const client = this.clients.get(serverId);
    if (!client) {
      return `Error: MCP server '${serverId}' is not connected.`;
    }

    try {
      logger.info("MCP", `Executing tool ${originalToolName} on server ${serverId}`);
      const result = await client.callTool({
        name: originalToolName,
        arguments: args
      });
      
      if (result.isError) {
        return `Error from MCP Server: ${JSON.stringify(result.content)}`;
      }

      if (Array.isArray(result.content)) {
        return result.content.map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
      }
      return JSON.stringify(result.content);
    } catch (err: any) {
      logger.error("MCP", `Tool execution failed: ${err.message}`);
      return `Error executing tool: ${err.message}`;
    }
  }
}
