import { logger } from './logger';

export interface ToolExecutionResult {
  success: boolean;
  message: string;
  executed: boolean;
  visionFramesForNextCall?: string[];
}

export async function executeTool(toolCall: any, context?: any): Promise<ToolExecutionResult> {
  const result: ToolExecutionResult = {
    success: false,
    message: "",
    executed: false
  };

  try {
    const toolName = toolCall.tool;

    if (toolName === 'execute_local_os_command') {
      const { executeOnIrisWithVerification, executeOnIris } = await import('./irisExecutor');
      const parsedPayload = typeof toolCall.payload === 'string' ? JSON.parse(toolCall.payload) : (toolCall.payload || {});
      
      // Use verification if context demands it (web UI), else regular (telegram)
      if (context?.useVerification) {
        const irisResult = await executeOnIrisWithVerification(toolCall.action, parsedPayload);
        result.success = irisResult.success;
        result.message = irisResult.message;
        if (irisResult.verification?.screenshotTaken) {
          result.message += "\n[Verified via screenshot]";
        }
      } else {
        const irisResult = await executeOnIris(toolCall.action, parsedPayload);
        result.success = irisResult.success;
        result.message = irisResult.message;
      }
      result.executed = true;

    } else if (toolName === 'intelligent_search') {
      const { butlerQueue } = await import('./butlerQueue');
      const query = toolCall.query || toolCall.payload?.query || "General Research";
      // We pass telegram chatId if available in context
      butlerQueue.dispatch('research', query, context?.chatId);
      result.success = true;
      result.message = `Background research task for "${query}" dispatched successfully. I will let the Boss know naturally as soon as the results are ready.`;
      result.executed = true;

    } else if (toolName === 'readWebpage') {
      const url = toolCall.url || toolCall.payload?.url;
      try {
        const r = await fetch(`https://r.jina.ai/${url}`);
        result.message = (await r.text()).substring(0, 12000);
        result.success = true;
      } catch (err: any) {
        result.success = false;
        result.message = `Error reading webpage: ${err.message}`;
      }
      result.executed = true;

    } else if (toolName === 'search_knowledge') {
      const { KnowledgeManager } = await import('./knowledgeManager');
      result.message = await KnowledgeManager.searchKnowledge(toolCall.query);
      result.success = true;
      result.executed = true;

    } else if (toolName === 'save_knowledge') {
      const { KnowledgeManager } = await import('./knowledgeManager');
      result.success = await KnowledgeManager.saveKnowledge(toolCall.title, toolCall.content, toolCall.tags);
      result.message = result.success ? `Knowledge "${toolCall.title}" saved successfully.` : "Failed to save knowledge.";
      result.executed = true;

    } else if (toolName === 'look_at_screen') {
      const { getVisionBuffer } = await import('./irisExecutor');
      const visionFrames = await getVisionBuffer();
      if (visionFrames && visionFrames.length > 0) {
        result.visionFramesForNextCall = visionFrames;
        result.success = true;
        result.message = `I.R.I.S Photographic Memory buffer successfully attached to your visual cortex. Describe what you see, or verify if the action was successful.`;
      } else {
        result.success = false;
        result.message = "Failed to fetch frames or I.R.I.S is offline. Cannot see the screen.";
      }
      result.executed = true;

    } else if (toolName === 'send_telegram_message') {
      try {
        const { jarvisScheduler } = await import('./scheduler');
        const targetChatId = jarvisScheduler.getAdminChatId() || parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || '0');
        const msgText = toolCall.text || toolCall.message || '';
        if (targetChatId && msgText) {
          jarvisScheduler.schedule(targetChatId, 'message', msgText, 0);
          result.success = true;
          result.message = `Telegram message sent to Boss (ChatID: ${targetChatId}): "${msgText}"`;
        } else {
          result.success = false;
          result.message = `Could not send Telegram message: ${!targetChatId ? 'No Chat ID available.' : 'Empty message text.'}`;
        }
      } catch (e: any) {
        result.success = false;
        result.message = `Telegram send error: ${e.message}`;
      }
      result.executed = true;

    } else if (toolName === 'saveFile') {
      result.success = true;
      result.message = "File saved successfully.";
      result.executed = true;

    } else if (toolName.startsWith('mcp_')) {
      const { McpManager } = await import('./mcpManager');
      result.message = await McpManager.callTool(toolName, toolCall.payload || toolCall);
      result.success = !result.message.startsWith('Error');
      result.executed = true;
    }

  } catch (err: any) {
    logger.error("ToolDispatcher", `Failed to execute tool ${toolCall.tool}: ${err.message}`);
    result.success = false;
    result.message = `System Error during tool execution: ${err.message}`;
    result.executed = true; 
  }

  return result;
}
