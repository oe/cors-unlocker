import { describe, expect, it, vi } from 'vitest';
import { formatJson, highlightJson, jsonProblem, MAX_CODE_LENGTH } from '../../src/common/json-editor';

describe('lossless JSON editing', () => {
  it('formats whitespace without rounding numbers, dropping duplicate keys or rewriting strings', () => {
    const source = '{"id":900719925474099312345,"id":1e999,"path":"\\u0061\\/b","items":[{},[],true,false,null,-0,1.20e-3]}';
    const formatted = formatJson(source)!;
    expect(formatted).toContain('900719925474099312345');
    expect(formatted).toContain('"id": 1e999');
    expect(formatted).toContain('"path": "\\u0061\\/b"');
    expect(formatted).toContain('-0');
    expect(formatted).toContain('1.20e-3');
    expect(JSON.parse(formatted)).toEqual(JSON.parse(source));
    expect(formatJson(formatted)).toBe(formatted);
    expect(formatJson('  "hello world"  ')).toBe('"hello world"');
  });

  it('refuses invalid JSON and gives a location without exposing its contents', () => {
    const source = '{\n  "private": true,\n}';
    expect(formatJson(source)).toBeNull();
    expect(jsonProblem(source)).toEqual({ offset: source.length - 1, line: 3, column: 1 });
    expect(jsonProblem('{')).toEqual({ offset: 1, line: 1, column: 2 });
    expect(jsonProblem('{}')).toBeNull();
  });

  it('supports Firefox coordinates and falls back safely for unknown parser diagnostics', () => {
    const parse = vi.spyOn(JSON, 'parse');
    try {
      parse.mockImplementationOnce(() => { throw new SyntaxError('JSON.parse: expected property name at line 2 column 3 of the JSON data'); });
      expect(jsonProblem('{\n  }')).toEqual({ offset: 4, line: 2, column: 3 });
      parse.mockImplementationOnce(() => { throw new SyntaxError('Unknown diagnostic'); });
      expect(jsonProblem('invalid')).toEqual({});
      parse.mockImplementationOnce(() => { throw new SyntaxError('Unexpected token \'p\', "at position 999, end of data" is not valid JSON'); });
      expect(jsonProblem('at position 999, end of data')).toEqual({});
    } finally { parse.mockRestore(); }
  });

  it('bounds work for large inputs, dense token streams and extreme nesting', () => {
    const large = '"' + 'x'.repeat(MAX_CODE_LENGTH) + '"';
    expect(highlightJson(large)).toBeNull();
    expect(formatJson(large)).toBeNull();
    expect(highlightJson('[' + '0,'.repeat(2000) + '0]')).toBeNull();
    expect(formatJson('['.repeat(101) + '0' + ']'.repeat(101))).toBeNull();
  });
});
