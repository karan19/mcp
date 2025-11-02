import type { FormEvent } from 'react';
import { useState } from 'react';

interface ChatComposerProps {
  disabled?: boolean;
  onSend: (value: string) => Promise<void> | void;
}

export function ChatComposer({ disabled, onSend }: ChatComposerProps) {
  const [value, setValue] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    await onSend(trimmed);
    setValue('');
  };

  return (
    <form className="chat-composer" onSubmit={handleSubmit}>
      <textarea
        className="chat-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ask a question about your data…"
        rows={2}
        disabled={disabled}
      />
      <div className="chat-actions">
        <button className="chat-send-button" type="submit" disabled={disabled || value.trim().length === 0}>
          Send
        </button>
      </div>
    </form>
  );
}
