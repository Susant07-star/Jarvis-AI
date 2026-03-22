import { Message } from '../components/jarvis/ChatWindow';

export async function sendChatMessage(
  message: string, 
  history: Message[] = [],
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<{ reply: string, command?: any }> {
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
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to communicate with J.A.R.V.I.S.');
    }

    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await res.json();
      return { reply: data.reply, command: data.command };
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
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullReply += parsed.content;
                if (onChunk) onChunk(parsed.content);
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {}
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
