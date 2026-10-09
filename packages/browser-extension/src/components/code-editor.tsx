import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '@/common/i18n';
import { formatJson, highlightJson, jsonProblem, MAX_CODE_LENGTH } from '@/common/json-editor';
import { Button } from '@/components/ui/button';

interface CodeEditorProps {
  id?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  language?: 'json' | 'text';
  allowPlainText?: boolean;
  focusRequest?: number;
}

export function CodeEditor({ id, label, value, onValueChange, language = 'json', allowPlainText = false, focusRequest = 0 }: CodeEditorProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLPreElement>(null);
  const [chosenLanguage, setChosenLanguage] = useState<'json' | 'text' | null>(null);
  const mode = chosenLanguage || language;
  const [checked, setChecked] = useState(false);
  const [composing, setComposing] = useState(false);
  const [formatFailed, setFormatFailed] = useState(false);
  const [lastFormat, setLastFormat] = useState<{ before: string; after: string } | null>(null);
  const large = value.length > MAX_CODE_LENGTH;
  const tokens = useMemo(() => mode === 'json' ? highlightJson(value) : null, [mode, value]);
  const problem = useMemo(() => checked && mode === 'json' && !large ? jsonProblem(value) : null, [checked, mode, large, value]);
  const highlighted = tokens !== null && !composing;
  useLayoutEffect(() => {
    if (focusRequest) { textarea.current?.focus(); setChecked(true); }
  }, [focusRequest]);
  const syncScroll = () => {
    if (preview.current && textarea.current) {
      preview.current.scrollTop = textarea.current.scrollTop;
      preview.current.scrollLeft = textarea.current.scrollLeft;
    }
  };
  useLayoutEffect(() => {
    const input = textarea.current;
    const layer = preview.current;
    if (!input || !layer) return;
    const resize = () => {
      // Exclude the native scrollbar area so the layers agree at scroll edges.
      layer.style.width = `${input.clientWidth}px`;
      layer.style.height = `${input.clientHeight}px`;
      layer.scrollTop = input.scrollTop;
      layer.scrollLeft = input.scrollLeft;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(input);
    return () => observer.disconnect();
  }, [highlighted]);
  const replaceText = (next: string) => {
    const input = textarea.current;
    if (!input) return;
    input.focus(); input.select();
    // insertText keeps the browser's undo history; the explicit Undo format
    // control also works on engines without this optional editing command.
    if (typeof document.execCommand !== 'function' || !document.execCommand('insertText', false, next)) onValueChange(next);
    else onValueChange(input.value);
    input.setSelectionRange(0, 0); input.scrollTop = 0; input.scrollLeft = 0;
    syncScroll();
  };
  const format = () => {
    if (mode !== 'json' || large || composing) return;
    setChecked(true);
    const formatted = formatJson(value);
    setFormatFailed(formatted === null && jsonProblem(value) === null);
    if (formatted !== null && formatted !== value) {
      setLastFormat({ before: value, after: formatted });
      replaceText(formatted);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f' && !event.nativeEvent.isComposing) {
      event.preventDefault(); format();
    }
  };
  const message = problem ? (problem.line ? t('Invalid JSON at line {line}, column {column}.', { line: problem.line, column: problem.column! }) : t('Invalid JSON. Check the syntax.')) : formatFailed ? t('Formatting limit reached. Your text is unchanged.') : null;
  return <div className="code-editor" data-highlighted={highlighted}>
    <div className="code-editor-toolbar">
      {allowPlainText ? <select aria-label={t('{label} format', { label })} value={mode} onChange={(event) => { setChosenLanguage(event.target.value as 'json' | 'text'); setChecked(false); setFormatFailed(false); }}>
        <option value="json">JSON</option><option value="text">{t('Plain text')}</option>
      </select> : <span className="text-xs text-muted-foreground">JSON</span>}
      {mode === 'json' ? <Button size="xs" variant="ghost" disabled={large || composing} onClick={format} title="Alt+Shift+F">{t('Format JSON')}</Button> : null}
      {lastFormat && lastFormat.after === value ? <Button size="xs" variant="ghost" onClick={() => { replaceText(lastFormat.before); setLastFormat(null); setFormatFailed(false); }}>{t('Undo format')}</Button> : null}
    </div>
    <div className="code-editor-input">
      {highlighted ? <pre ref={preview} aria-hidden="true" className="code-editor-preview">{tokens.map((token, index) => <span key={index} className={token.kind ? `code-token-${token.kind}` : undefined}>{token.text}</span>)}{'\n'}</pre> : null}
      <textarea ref={textarea} id={inputId} aria-label={label} aria-invalid={!!problem} aria-describedby={message || (large && mode === 'json') ? `${inputId}-hint` : undefined}
        value={value} rows={8} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off"
        onChange={(event) => { setFormatFailed(false); onValueChange(event.target.value); }} onBlur={() => setChecked(true)} onScroll={syncScroll} onKeyDown={onKeyDown}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
    </div>
    {message ? <div id={`${inputId}-hint`} className="code-editor-hint text-destructive" role="status">
      <span>{message}</span>
      {problem?.offset !== undefined ? <Button size="xs" variant="ghost" onClick={() => { textarea.current?.focus(); textarea.current?.setSelectionRange(problem.offset!, Math.min(problem.offset! + 1, value.length)); }}>{t('Go to error')}</Button> : null}
    </div> : large && mode === 'json' ? <p id={`${inputId}-hint`} className="code-editor-hint text-muted-foreground">{t('Large input: highlighting and formatting paused. Editing still works.')}</p> : null}
  </div>;
}
