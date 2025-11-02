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
    <form className="chatgpt-composer" onSubmit={handleSubmit}>
      <div className="chatgpt-input-row">
        <textarea
          className="chatgpt-textarea"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Message NexusNote Assistant"
          rows={2}
          disabled={disabled}
        />
        <button className="chatgpt-send" type="submit" disabled={disabled || value.trim().length === 0}>
          Send
        </button>
      </div>
      <div className="chatgpt-composer-hint">Press Enter to send • Shift + Enter for a new line</div>
    </form>
  );
}
