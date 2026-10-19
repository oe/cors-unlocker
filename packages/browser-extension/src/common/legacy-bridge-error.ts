/** Firefox native messaging rejects with Error(JSON); preserve SDK cancellation types. */
export function legacyBridgeError(cause: unknown): { type: string; message: string } {
  const record = cause && typeof cause === 'object' ? cause as Record<string, unknown> : undefined;
  if (typeof record?.type === 'string' && typeof record.message === 'string')
    return { type: record.type, message: record.message };
  const message = typeof cause === 'string' ? cause : typeof record?.message === 'string' ? record.message : 'Unknown error occurred';
  try {
    const parsed: unknown = JSON.parse(message);
    if (parsed && typeof parsed === 'object' && 'type' in parsed && 'message' in parsed
      && typeof parsed.type === 'string' && typeof parsed.message === 'string')
      return { type: parsed.type, message: parsed.message };
  } catch { /* Browser diagnostics need not be JSON. */ }
  return { type: 'communication-error', message };
}
