import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor } from '../../src/components/code-editor';
import { MAX_CODE_LENGTH } from '../../src/common/json-editor';

function Editor({ initial = '{"ok":true}', allowPlainText = false }: { initial?: string; allowPlainText?: boolean }) {
  const [value, setValue] = useState(initial);
  return <><CodeEditor label="Payload" value={value} onValueChange={setValue} allowPlainText={allowPlainText} /><button>Next field</button></>;
}
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('lightweight code editor', () => {
  it('formats explicitly and lets users restore the exact original text', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const input = screen.getByRole('textbox', { name: 'Payload' });
    await user.click(screen.getByRole('button', { name: 'Format JSON' }));
    expect(input).toHaveValue('{\n  "ok": true\n}');
    await user.click(screen.getByRole('button', { name: 'Undo format' }));
    expect(input).toHaveValue('{"ok":true}');
    await user.click(input);
    await user.keyboard('{Alt>}{Shift>}f{/Shift}{/Alt}');
    expect(input).toHaveValue('{\n  "ok": true\n}');
  });

  it('reports invalid JSON on blur, keeps the draft intact and locates the error', async () => {
    const user = userEvent.setup();
    const invalid = '{\n  "ok": true,\n}';
    render(<Editor initial={invalid} />);
    const input = screen.getByRole('textbox', { name: 'Payload' });
    expect(input).toHaveAttribute('aria-invalid', 'false');
    await user.click(screen.getByRole('button', { name: 'Format JSON' }));
    expect(input).toHaveValue(invalid);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Invalid JSON at line 3, column 1.');
    await user.click(screen.getByRole('button', { name: 'Go to error' }));
    expect(input).toHaveFocus();
    expect((input as HTMLTextAreaElement).selectionStart).toBe(invalid.length - 1);
    fireEvent.change(input, { target: { value: '{}' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('allows raw response text and treats markup as text, never HTML', async () => {
    const user = userEvent.setup();
    const source = '"<img src=x onerror=alert(1)>"';
    const { container } = render(<Editor initial={source} allowPlainText />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('pre')).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(container.querySelector('pre')).toHaveAttribute('aria-hidden', 'true');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Payload format' }), 'text');
    expect(screen.queryByRole('button', { name: 'Format JSON' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '<html>invalid JSON is intentional</html>' } });
    fireEvent.blur(screen.getByRole('textbox'));
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps large payloads editable while suspending optional work', () => {
    const source = 'x'.repeat(MAX_CODE_LENGTH + 1);
    const { container } = render(<Editor initial={source} />);
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
    expect(screen.getByText('Large input: highlighting and formatting paused. Editing still works.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: source + 'y' } });
    expect(screen.getByRole('textbox')).toHaveValue(source + 'y');
  });

  it('preserves native Tab navigation and suppresses formatting during IME composition', async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor />);
    const input = screen.getByRole('textbox');
    await user.click(input); await user.tab();
    expect(screen.getByRole('button', { name: 'Next field' })).toHaveFocus();
    fireEvent.compositionStart(input);
    expect(container.querySelector('pre')).toBeNull();
    fireEvent.keyDown(input, { key: 'f', altKey: true, shiftKey: true, isComposing: true });
    expect(input).toHaveValue('{"ok":true}');
    fireEvent.compositionEnd(input);
    expect(container.querySelector('pre')).not.toBeNull();
  });
});
