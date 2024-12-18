import appCors from 'browser-app-cors/src';
import { useState, useRef, useEffect } from 'react';

// @ts-expect-error exposed to window object for debugging
globalThis.appCors = appCors;

console.log('%cuse `appCors` in console to test the API of "browser-app-cors"', 'color: #0a0; font-size: 1.5em');

export function useViewModel() {
  const [isCurlMode, setIsCurlMode] = useState(false);
  const [status, setStatus] = useState('idle');

  const [corsStatus, setCorsStatus] = useState({ enabled: false, credentials: false });

  const [requestForm, setRequestForm] = useState({
    method: 'GET',
    url: '',
    curlCommand: '',
  });

  const responseRef = useRef({
    contentType: '',
    mediaType: '',
    content: '',
  })

  const errorRef = useRef<Error|null>(null)

  useEffect(() => {
    appCors.isEnabled().then((status) => {
      if (status) {
        setCorsStatus(status);
      } else {
        setCorsStatus({ enabled: false, credentials: false });
      }
    });
    // appCors.onChange.addListener(setCorsStatus);
    // return () => {
    //   appCors.onChange.removeListener(setCorsStatus);
    // }
  }, []);

  const doRequest = async () => {
    if (status === 'loading') return;
    try {
      setStatus('loading');
      let generator: AsyncGenerator<any, boolean, unknown>;
      if (isCurlMode) {
        generator = sendRequest(...parseCurlCommand(requestForm.curlCommand));
      } else {
        generator = sendRequest(requestForm.url, { method: requestForm.method });
      }
      const response = await generator.next();
      if (response.done) return;
      responseRef.current = response.value;
      setStatus('partial');
      const content = await generator.next();
      responseRef.current.content =
        typeof content.value === 'string'
          ? content.value
          : URL.createObjectURL(content.value);
      setStatus('success');
    } catch (error: any) {
      errorRef.current = error;
      setStatus('error');
    }
  };

  const setFormValue = (key: keyof typeof requestForm, value: string) => {
    setRequestForm((prev) => ({ ...prev, [key]: value }));
  }

  return {
    isCurlMode,
    setIsCurlMode,
    status,
    requestForm,
    setRequestForm,
    doRequest,
    setFormValue,
    responseRef,
    errorRef,
    corsStatus,
  };

}

async function* sendRequest(url: string, options: RequestInit): AsyncGenerator<any, boolean, unknown> {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const mediaType = detectContentTypeCategory(contentType);
  yield { contentType, mediaType };
  switch (mediaType) {
    case 'text':
      yield await response.text();  
      break;
    default:
      yield await response.blob();
      break;
  }
  return true
}

function detectContentTypeCategory(contentType: string): string {
  if (!contentType) return 'unknown';

  const type = contentType.toLowerCase();

  if (type.startsWith('text/') || 
      type.includes('json') || 
      type.includes('javascript') || 
      type.includes('xml') || 
      type.includes('csv')) {
    return 'text';
  }
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';

  return 'binary';
}

function parseCurlCommand (curl: string) {
  const urlMatch = curl.match(/curl\s+['"]?(https?:\/\/[^\s'"\\]+)['"]?/);
  const methodMatch = curl.match(/-X\s+(\w+)/i);
  const headerMatches = [...curl.matchAll(/-H\s+['"]?([^'"\n]+)['"]?/g)];
  const bodyMatch = curl.match(/--data(?:-raw)?\s+['"]?([^'"\n]+)['"]?/);

  const headersObj: Record<string, string> = {};
  headerMatches.forEach((match) => {
    const [key, value] = match[1].split(/:\s*/);
    if (key && value) headersObj[key.trim()] = value.trim();
  });
  return [
    urlMatch ? urlMatch[1] : '',
    {
      method: methodMatch ? methodMatch[1].toUpperCase() : 'GET',
      headers: headersObj,
      body: bodyMatch ? bodyMatch[1] : null,
    }
  ] as const;
}
