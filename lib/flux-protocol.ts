export type QueueMessage = {
  msg?: string;
  event_id?: string;
  rank?: number;
  success?: boolean;
  title?: string;
  output?: { error?: unknown; title?: string; data?: { url?: string }[] };
};
export type QueueResult =
  | { type: 'status'; message: string }
  | { type: 'error'; kind: 'quota' | 'provider' | 'busy'; message: string }
  | { type: 'result'; url: string }
  | { type: 'ignore' };

export class FluxServiceError extends Error {
  kind: string;
  constructor(kind: string, message: string) { super(message); this.name = 'FluxServiceError'; this.kind = kind; }
}

export function interpretQueueMessage(message: QueueMessage): QueueResult {
  if (message.msg === 'estimation') {
    return { type: 'status', message: typeof message.rank === 'number' ? `Waiting for a free GPU · position ${message.rank + 1} in the queue.` : 'Waiting for a free GPU…' };
  }
  if (message.msg === 'process_starts') return { type: 'status', message: 'The model has started your edit…' };
  if (message.msg === 'queue_full') return { type: 'error', kind: 'busy', message: 'The free GPU queue is full. Please try again later.' };
  if (message.msg !== 'process_completed') return { type: 'ignore' };
  if (!message.success) {
    const detail = typeof message.output?.error === 'string' ? message.output.error : '';
    const title = message.output?.title || message.title || '';
    if (/quota|runs limit|daily.*limit/i.test(`${title} ${detail}`)) {
      return { type: 'error', kind: 'quota', message: 'The free AI service says this daily allowance has been used. It did not provide a reset time. Generation here must wait for the allowance to reset. You can also open the model on Hugging Face and use its signed-in free allowance there. Changing your photo will not reset the allowance.' };
    }
    return { type: 'error', kind: 'provider', message: detail ? `The AI service could not finish: ${detail.slice(0, 280)}` : 'The AI service could not finish and did not provide a reason. Please try again later.' };
  }
  const url = message.output?.data?.[0]?.url;
  return url ? { type: 'result', url } : { type: 'error', kind: 'provider', message: 'The AI service finished without returning an image.' };
}

export function createEventParser() {
  let buffer = '';
  return (chunk: string): QueueMessage[] => {
    buffer += chunk;
    const messages: QueueMessage[] = [];
    let separator: RegExpMatchArray | null;
    while ((separator = buffer.match(/\r?\n\r?\n/))) {
      const start = separator.index!;
      const block = buffer.slice(0, start);
      buffer = buffer.slice(start + separator[0].length);
      const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (data) messages.push(JSON.parse(data));
    }
    return messages;
  };
}
