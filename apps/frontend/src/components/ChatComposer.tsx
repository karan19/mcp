import type { FormEvent } from 'react';
import { useState } from 'react';

interface ChatComposerProps {
  disabled?: boolean;
  floating?: boolean;
  onSend: (value: string) => Promise<void> | void;
}

export function ChatComposer({ disabled, floating, onSend }: ChatComposerProps) {
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
    <form className={`chat-composer${floating ? ' chat-composer--floating' : ''}`} onSubmit={handleSubmit}>
      <div className="chat-composer__controls">
        <textarea
          className="chat-composer__textarea"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Message Chat MCP"
          rows={2}
          disabled={disabled}
        />
        <button className="chat-composer__submit" type="submit" disabled={disabled || value.trim().length === 0}>
          Send
        </button>
      </div>
      <div className="chat-composer__hint">Press Enter to send • Shift + Enter for a new line</div>
    </form>
  );
}
