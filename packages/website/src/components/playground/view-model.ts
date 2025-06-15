import appCors from 'cors-unlocker';
import { useState, useEffect } from 'react';

// @ts-expect-error exposed to window object for debugging
globalThis.appCors = appCors;

console.log('%cuse `appCors` in console to test the API of "cors-unlocker"', 'color: #0a0; font-size: 1.5em');

interface PlaygroundState {
  // Extension status
  isInstalled: boolean;
  corsStatus: { enabled: boolean; credentials: boolean };
  
  // Request state
  status: 'idle' | 'loading' | 'success' | 'error' | 'partial';
  isCurlMode: boolean;
  requestForm: {
    method: string;
    url: string;
    curlCommand: string;
  };
  
  // Response state
  response: {
    contentType: string;
    mediaType: string;
    content: string;
  } | null;
  error: Error | null;
  
  // UI state
  isCheckingExtension: boolean;
  isTogglingCors: boolean;
  errorMessage: string | null;
}

export function useViewModel() {
  const [state, setState] = useState<PlaygroundState>({
    isInstalled: false,
    corsStatus: { enabled: false, credentials: false },
    status: 'idle',
    isCurlMode: false,
    requestForm: {
      method: 'GET',
      url: 'https://www.google.com/search?q=cors',
      curlCommand: 'curl -X GET https://www.google.com/search?q=cors',
    },
    response: null,
    error: null,
    isCheckingExtension: true,
    isTogglingCors: false,
    errorMessage: null,
  });

  // Initialize extension status
  useEffect(() => {
    const initializeExtensionStatus = async () => {
      try {
        console.log('Checking extension status...');
        
        // Check if extension is installed with timeout
        const installed = await Promise.race([
          appCors.isExtInstalled().catch(() => false), // If detection fails, default to not installed
          new Promise<boolean>((resolve) => 
            setTimeout(() => resolve(false), 3000) // Shortened timeout and default to not installed
          )
        ]);
        
        console.log('Extension installed:', installed);
        
        let corsStatus = { enabled: false, credentials: false };
        if (installed) {
          try {
            corsStatus = await appCors.isEnabled();
          } catch (error) {
            console.warn('Failed to get CORS status:', error);
            // If getting status fails, the plugin may not actually be installed
            setState(prev => ({
              ...prev,
              isInstalled: false,
              corsStatus: { enabled: false, credentials: false },
              isCheckingExtension: false,
            }));
            return;
          }
        }
        
        setState(prev => ({
          ...prev,
          isInstalled: installed,
          corsStatus,
          isCheckingExtension: false,
        }));

      } catch (error) {
        console.error('Failed to initialize extension status:', error);
        setState(prev => ({
          ...prev,
          isInstalled: false,
          isCheckingExtension: false,
          errorMessage: error instanceof Error ? error.message : 'Failed to check extension status'
        }));
      }
    };

    initializeExtensionStatus();

    return () => {
      // Cleanup if needed
    };
  }, []);

  const setFormValue = (key: keyof typeof state.requestForm, value: string) => {
    setState(prev => ({
      ...prev,
      requestForm: { ...prev.requestForm, [key]: value }
    }));
  };

  const doRequest = async () => {
    if (state.status === 'loading') return;
    
    try {
      setState(prev => ({ ...prev, status: 'loading', error: null, response: null }));
      
      let generator: AsyncGenerator<any, boolean, unknown>;
      if (state.isCurlMode) {
        const [url, options] = parseCurlCommand(state.requestForm.curlCommand);
        if (!url) {
          throw new Error('Invalid cURL command: URL not found');
        }
        generator = sendRequest(url, options);
      } else {
        if (!state.requestForm.url) {
          throw new Error('URL is required');
        }
        generator = sendRequest(state.requestForm.url, { method: state.requestForm.method });
      }
      
      const response = await generator.next();
      if (response.done) return;
      
      setState(prev => ({
        ...prev,
        response: response.value,
        status: 'partial'
      }));
      
      const content = await generator.next();
      const finalContent = typeof content.value === 'string'
        ? content.value
        : URL.createObjectURL(content.value);
      
      setState(prev => ({
        ...prev,
        response: prev.response ? { ...prev.response, content: finalContent } : null,
        status: 'success'
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error,
        status: 'error'
      }));
    }
  };

  const toggleCors = async () => {
    if (!state.isInstalled || state.isTogglingCors) return;
    
    setState(prev => ({ ...prev, isTogglingCors: true, errorMessage: null }));
    
    try {
      console.log('Toggling CORS status...', state.corsStatus);
      if (state.corsStatus.enabled) {
        await appCors.disable();
      } else {
        await appCors.enable({
          reason: 'Testing cross-origin requests in playground',
        });
      }
      
      // Update status after operation
      const newStatus = await appCors.isEnabled();
      setState(prev => ({ ...prev, corsStatus: newStatus }));
    } catch (error: any) {
      setState(prev => ({ ...prev, errorMessage: error?.message || 'Failed to toggle CORS' }));
    } finally {
      setState(prev => ({ ...prev, isTogglingCors: false }));
    }
  };

  const toggleCorsCredentials = async () => {
    if (!state.isInstalled || !state.corsStatus.enabled || state.isTogglingCors) return;
    
    setState(prev => ({ ...prev, isTogglingCors: true, errorMessage: null }));
    
    try {
      await appCors.enable({
        credentials: !state.corsStatus.credentials,
        reason: 'Toggling credentials support in playground',
      });
      
      // Update status after operation
      const newStatus = await appCors.isEnabled();
      setState(prev => ({ ...prev, corsStatus: newStatus }));
    } catch (error: any) {
      setState(prev => ({ ...prev, errorMessage: error?.message || 'Failed to toggle credentials' }));
    } finally {
      setState(prev => ({ ...prev, isTogglingCors: false }));
    }
  };

  const openExtensionStore = () => {
    appCors.openStorePage();
  };

  const clearError = () => {
    setState(prev => ({ ...prev, errorMessage: null }));
  };

  const setIsCurlMode = (isCurlMode: boolean) => {
    setState(prev => ({ ...prev, isCurlMode }));
  };

  return {
    ...state,
    setFormValue,
    doRequest,
    toggleCors,
    toggleCorsCredentials,
    openExtensionStore,
    clearError,
    setIsCurlMode,
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
