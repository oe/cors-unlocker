// Keep editing bounded. Larger payloads remain editable as ordinary text.
export const MAX_CODE_LENGTH = 50_000;
const MAX_HIGHLIGHT_TOKENS = 2_000;
const MAX_FORMATTED_LENGTH = 200_000;

export interface JsonProblem { offset?: number; line?: number; column?: number }
export function jsonProblem(source: string): JsonProblem | null {
  try { JSON.parse(source); return null; }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    const position = message.match(/position (\d+)/);
    const coordinates = message.match(/line (\d+) column (\d+)/);
    let offset: number | undefined;
    if (position) offset = Math.min(Number(position[1]), source.length);
    else if (coordinates) {
      const lines = source.split('\n');
      offset = lines.slice(0, Number(coordinates[1]) - 1).reduce((sum, line) => sum + line.length + 1, 0) + Number(coordinates[2]) - 1;
      offset = Math.min(offset, source.length);
    } else if (/end of|unterminated/i.test(message)) offset = source.length;
    if (offset === undefined) return {};
    const before = source.slice(0, offset).split('\n');
    return { offset, line: before.length, column: before[before.length - 1].length + 1 };
  }
}

// Strings (including incomplete strings) stay intact. Never interpret markup or execute code.
const TOKEN = /"(?:\\[\s\S]|[^"\\])*"?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:]|\s+|[^\s]/g;
export interface JsonToken { text: string; kind?: 'key' | 'string' | 'number' | 'literal' }
export function highlightJson(source: string): JsonToken[] | null {
  if (source.length > MAX_CODE_LENGTH) return null;
  const result: JsonToken[] = [];
  let scanned = 0;
  for (const match of source.matchAll(TOKEN)) {
    if (++scanned > MAX_HIGHLIGHT_TOKENS) return null;
    const text = match[0];
    let kind: JsonToken['kind'];
    if (text.startsWith('"')) {
      let next = match.index + text.length;
      while (/\s/.test(source[next] || '') && next < source.length) next++;
      kind = source[next] === ':' ? 'key' : 'string';
    } else if (/^-?\d/.test(text)) kind = 'number';
    else if (/^(true|false|null)$/.test(text)) kind = 'literal';
    const previous = result[result.length - 1];
    if (previous && previous.kind === kind) previous.text += text;
    else result.push({ text, kind });
  }
  return result;
}

// Validate with the platform parser, but format the original tokens. Parsing and
// serializing would round large numbers, remove duplicate keys, and rewrite escapes.
export function formatJson(source: string): string | null {
  if (source.length > MAX_CODE_LENGTH || jsonProblem(source)) return null;
  const tokens = Array.from(source.matchAll(TOKEN), (match) => match[0]).filter((token) => !/^\s+$/.test(token));
  const parts: string[] = [];
  let depth = 0;
  let length = 0;
  const append = (value: string) => { parts.push(value); length += value.length; };
  const newline = () => append('\n' + '  '.repeat(depth));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{' || token === '[') {
      append(token); depth++;
      if (depth > 100) return null;
      if (tokens[i + 1] !== '}' && tokens[i + 1] !== ']') newline();
    } else if (token === '}' || token === ']') {
      depth--;
      if (tokens[i - 1] !== '{' && tokens[i - 1] !== '[') newline();
      append(token);
    } else if (token === ',') { append(token); newline(); }
    else if (token === ':') append(': ');
    else append(token);
    if (length > MAX_FORMATTED_LENGTH) return null;
  }
  return parts.join('');
}
