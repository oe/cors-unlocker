export const HTTP_TOKEN = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;

export function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch { return false; }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch { return false; }
}

/** HTTP field names are case-insensitive; the latest action wins. */
export function mergeHeaderMaps(...maps: Record<string, string>[]): Record<string, string> {
  const headers = new Map<string, [string, string]>();
  for (const map of maps) {
    for (const [name, value] of Object.entries(map)) headers.set(name.toLowerCase(), [name, value]);
  }
  return Object.fromEntries(headers.values());
}
