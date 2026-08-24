import { callChatWithCascade } from './llmRouter';
import { ThreadMessage } from './threadManager';
import { executeTool } from './toolDispatcher';
import { logger } from './logger';
import { ThreadManager } from './threadManager';

export interface LoopContext {
  threadId?: string;
  chatId?: number;
  useVerification?: boolean;
  onStreamEvent?: (type: string, data: any) => void;
}

export async function runAutonomousLoop(
  initialMessages: ThreadMessage[], 
  context: LoopContext, 
  maxSteps: number = 7
) {
  let messages = [...initialMessages];
  let stepCount = 0;
  let finalResponse = null;
  let visionFramesForNextCall: string[] | undefined = undefined;

  while (stepCount < maxSteps) {
    stepCount++;
    logger.info("AgentLoop", `--- Step ${stepCount}/${maxSteps} ---`);

    // Call LLM
    const result = await callChatWithCascade(messages as any, visionFramesForNextCall);
    const textContent = result.content;
    
    // Check for Tool Call
    if (textContent.includes('"tool"')) {
      try {
        const jsonMatch = textContent.match(/\{[\s\S]*"tool"[\s\S]*\}/);
        const rawJson = jsonMatch ? jsonMatch[0] : textContent;
        const toolCall = JSON.parse(rawJson);

        logger.info("AgentLoop", `Action requested: ${toolCall.tool}`);

        // Fire UI Event if applicable
        if (context.onStreamEvent) {
          context.onStreamEvent('tool_start', { tool: toolCall.tool, payload: toolCall.payload });
        }

        // Execute Tool
        const toolResult = await executeTool(toolCall, context);
        
        if (toolResult.executed) {
          // Update vision frames for next LLM turn if requested (e.g. by look_at_screen)
          visionFramesForNextCall = toolResult.visionFramesForNextCall;

          // Append assistant's tool call intent
          messages.push({ role: "assistant", content: textContent });
          if (context.threadId) {
            await ThreadManager.appendMessage(context.threadId, { role: "assistant", content: textContent });
          }

          // Append tool execution result
          const sysResultMsg = `[SYSTEM - TOOL RESULT]\nSuccess: ${toolResult.success}\nMessage/Output:\n${toolResult.message}\n\nPlease proceed or summarize this result naturally for the user.`;
          messages.push({ role: "user", content: sysResultMsg });
          if (context.threadId) {
            await ThreadManager.appendMessage(context.threadId, { role: "user", content: sysResultMsg });
          }

          if (context.onStreamEvent) {
            context.onStreamEvent('tool_end', { tool: toolCall.tool, success: toolResult.success });
          }

          // Loop continues...
          continue;
        }
      } catch (err: any) {
        logger.error("AgentLoop", `Error parsing/executing tool: ${err.message}`);
        // If JSON fails to parse, treat as normal text fallback
      }
    }

    // No tool called (or loop exhausted) - this is the final conversational response
    finalResponse = result;
    
    // Save final response to thread
    if (context.threadId) {
      await ThreadManager.appendMessage(context.threadId, { role: "assistant", content: finalResponse.content });
    }
    
    break; 
  }

  if (!finalResponse) {
    // If it hit max steps and is still trying to call tools, force an abort response
    finalResponse = {
      content: "I have reached my maximum thought limit of 7 steps and had to abort to prevent an infinite loop. Here is where I got stuck.",
      model: "system",
      provider: "system",
      tokens: 0
    };
    if (context.threadId) {
      await ThreadManager.appendMessage(context.threadId, { role: "assistant", content: finalResponse.content });
    }
  }

  return finalResponse;
}
