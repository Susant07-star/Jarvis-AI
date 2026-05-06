import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

export interface TokenMetrics {
  classifier: number;
  planner: number;
  direct: number;
  dom: number;
  voice: number;
}

export interface RequestMetricsData {
  input: string;
  intent: string;
  mode: string;
  planner_output?: any;
  execution_result?: string;
  tokens: TokenMetrics;
  startTime: number;
}

export class MetricsTracker {
  private data: RequestMetricsData;
  private logFilePath: string;

  constructor(input: string) {
    this.data = {
      input,
      intent: 'unknown',
      mode: 'none',
      tokens: { classifier: 0, planner: 0, direct: 0, dom: 0, voice: 0 },
      startTime: Date.now()
    };
    const logsDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFilePath = path.join(logsDir, 'token_detailed.json');
  }

  setIntent(intent: string) { this.data.intent = intent; }
  setMode(mode: string) { this.data.mode = mode; }
  setPlannerOutput(output: any) { this.data.planner_output = output; }
  setExecutionResult(result: string) { this.data.execution_result = result; }
  
  addTokens(module: keyof TokenMetrics, tokens: number) {
    this.data.tokens[module] += tokens;
  }

  finalize() {
    const latency_ms = Date.now() - this.data.startTime;
    const totalTokens = Object.values(this.data.tokens).reduce((a, b) => a + b, 0);

    const logEntry = {
      timestamp: new Date().toISOString(),
      input: this.data.input,
      intent: this.data.intent,
      mode: this.data.mode,
      tokens: {
        ...this.data.tokens,
        total: totalTokens
      },
      latency_ms
    };

    try {
      // Step 1: Append Token Detailed Log
      fs.appendFileSync(this.logFilePath, JSON.stringify(logEntry) + '\n');
      
      // Step 5: Logger Improvement (log summary per request)
      logger.info('MetricsTracker', `Request details:\n` +
        `  Input: "${this.data.input}"\n` +
        `  Intent: ${this.data.intent}\n` +
        `  Mode: ${this.data.mode}\n` +
        `  Planner Output: ${JSON.stringify(this.data.planner_output || 'N/A')}\n` +
        `  Execution Result: ${this.data.execution_result || 'N/A'}\n` +
        `  Token Usage: ${totalTokens} total\n` +
        `  Latency: ${latency_ms}ms`
      );

    } catch (err) {
      logger.error('MetricsTracker', 'Failed to log metrics', err);
    }
  }
}
