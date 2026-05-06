import { Message } from '../components/jarvis/ChatWindow';

export async function sendChatMessage(
  message: string, 
  history: Message[] = [],
  onChunk?: (chunk: string) => void,
  onMetadata?: (meta: { model: string, provider: string }) => void,
  signal?: AbortSignal
): Promise<{ reply: string, command?: any, browser_commands?: any[], model?: string, provider?: string }> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message,
        history: history.slice(-5).map(m => ({ role: m.role, content: m.content }))
      }),
      signal
    });
    
    if (!res.ok) {
      const text = await res.text();
      let errorData: any = {};
      try { errorData = JSON.parse(text); } catch (e) {
        console.error('Non-JSON error response:', text.substring(0, 150));
      }
      throw new Error(errorData.error || 'Failed to communicate with J.A.R.V.I.S.');
    }

    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON response from server'); }
      return { reply: data.reply, command: data.command, browser_commands: data.browser_commands };
    }
    
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';
    
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch (e) {
              continue;
            }
            
            if (parsed.content) {
              fullReply += parsed.content;
              if (onChunk) onChunk(parsed.content);
            } else if (parsed.metadata) {
              if (onMetadata) onMetadata(parsed.metadata);
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          }
        }
      }
    }
    return { reply: fullReply };
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}
