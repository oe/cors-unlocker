export const RESOURCE_TYPES = [
  'Document',
  'Stylesheet',
  'Image',
  'Media',
  'Font',
  'Script',
  'XHR',
  'Fetch',
  'WebSocket',
  'EventSource',
  'Ping',
  'Manifest',
  'Prefetch',
  'Preflight',
  'TextTrack',
  'SignedExchange',
  'CSPReport',
  'Other',
] as const;

export type ResourceType = typeof RESOURCE_TYPES[number];

export function normalizeResourceType(resourceType?: string): ResourceType {
  const normalized = (resourceType || 'other').toLowerCase().replace(/[\s_-]/g, '');
  const aliases: Record<string, ResourceType> = {
    document: 'Document',
    mainframe: 'Document',
    subframe: 'Document',
    stylesheet: 'Stylesheet',
    xslt: 'Stylesheet',
    image: 'Image',
    imageset: 'Image',
    media: 'Media',
    font: 'Font',
    script: 'Script',
    xhr: 'XHR',
    xmlhttprequest: 'XHR',
    fetch: 'Fetch',
    websocket: 'WebSocket',
    eventsource: 'EventSource',
    ping: 'Ping',
    beacon: 'Ping',
    manifest: 'Manifest',
    webmanifest: 'Manifest',
    prefetch: 'Prefetch',
    speculative: 'Prefetch',
    preflight: 'Preflight',
    texttrack: 'TextTrack',
    signedexchange: 'SignedExchange',
    cspreport: 'CSPReport',
    cspviolationreport: 'CSPReport',
    other: 'Other',
    object: 'Other',
    objectsubrequest: 'Other',
    xmldtd: 'Other',
  };
  return aliases[normalized] || 'Other';
}

export function toDnrResourceTypes(types?: string[]): chrome.declarativeNetRequest.ResourceType[] | undefined {
  if (!types?.length) return undefined;
  const mapping: Record<ResourceType, string[]> = {
    Document: ['main_frame', 'sub_frame'],
    Stylesheet: ['stylesheet'],
    Image: ['image'],
    Media: ['media'],
    Font: ['font'],
    Script: ['script'],
    XHR: ['xmlhttprequest'],
    Fetch: ['xmlhttprequest'],
    WebSocket: ['websocket'],
    EventSource: ['xmlhttprequest'],
    Ping: ['ping'],
    Manifest: [],
    Prefetch: [],
    Preflight: [],
    TextTrack: [],
    SignedExchange: [],
    CSPReport: ['csp_report'],
    Other: ['other', 'object'],
  };
  const values = [...new Set(types.flatMap((type) => mapping[normalizeResourceType(type)]))];
  return values as unknown as chrome.declarativeNetRequest.ResourceType[];
}
