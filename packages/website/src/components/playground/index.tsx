import React from 'react';
import { useViewModel } from './view-model';

export const PlaygroundPage: React.FC = () => {
  const vm = useViewModel();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section - Apple Style */}
      <div className="relative overflow-hidden ">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-purple-50/20 to-indigo-50/30"></div>
        
        {/* Background decoration */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-purple-200/20 to-indigo-200/20 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-gray-900 mb-6 tracking-tight">
            CORS Unlocker
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Playground
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto font-light leading-relaxed">
            Test cross-origin requests with power and precision.
            <br />
            Experience seamless CORS management.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Extension Status Section */}
        <ExtensionStatusCard vm={vm} />

        {/* Request and Response Section */}
        <div className="mt-16 grid grid-cols-1 xl:grid-cols-2 gap-8">
          <RequestConfigCard vm={vm} />
          <ResponseDisplayCard vm={vm} />
        </div>
      </div>
    </div>
  );
};

// Extension Status Card Component
const ExtensionStatusCard: React.FC<{ vm: ReturnType<typeof useViewModel> }> = ({ vm }) => {
  if (vm.isCheckingExtension) {
    return (
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200/50 p-8 shadow-2xl">
        <div className="flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin"></div>
          <span className="ml-4 text-gray-700 font-medium">Checking extension status...</span>
        </div>
      </div>
    );
  }

  if (!vm.isInstalled) {
    return (
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-red-200/50 p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-1">Extension Required</h3>
              <p className="text-gray-600 font-light">Install CORS Unlocker to unlock cross-origin capabilities and test requests seamlessly.</p>
            </div>
          </div>
          <button
            onClick={vm.openExtensionStore}
            className="ml-6 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-medium transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer"
          >
            Install Extension
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-green-200/50 p-8 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-1">Extension Active</h3>
            <p className="text-gray-600 font-light">CORS Unlocker is installed and ready to break barriers.</p>
          </div>
        </div>
        <CorsControls vm={vm} />
      </div>
      
      {vm.errorMessage && (
        <div className="mt-6 bg-red-50/80 backdrop-blur border border-red-200 rounded-2xl p-4">
          <div className="flex justify-between items-center">
            <p className="text-red-800 text-sm font-medium">{vm.errorMessage}</p>
            <button
              onClick={vm.clearError}
              className="text-red-600 hover:text-red-800 p-1 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// CORS Controls Component
const CorsControls: React.FC<{ vm: ReturnType<typeof useViewModel> }> = ({ vm }) => {
  return (
    <div className="flex items-center space-x-6">
      {/* CORS Toggle */}
      <div className="flex items-center">
        <label className="text-sm font-medium text-gray-700 mr-3">CORS</label>
        <button
          onClick={vm.toggleCors}
          disabled={vm.isTogglingCors}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            vm.corsStatus?.enabled ? 'bg-blue-600' : 'bg-gray-300'
          } ${vm.isTogglingCors ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-lg ${
              vm.corsStatus?.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Credentials Toggle */}
      <div className="flex items-center">
        <label className="text-sm font-medium text-gray-700 mr-3">Credentials</label>
        <button
          onClick={vm.toggleCorsCredentials}
          disabled={vm.isTogglingCors || !vm.corsStatus?.enabled}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            vm.corsStatus?.credentials ? 'bg-blue-600' : 'bg-gray-300'
          } ${vm.isTogglingCors || !vm.corsStatus?.enabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-lg ${
              vm.corsStatus?.credentials ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center">
        <div className={`h-3 w-3 rounded-full mr-3 shadow-sm ${
          vm.corsStatus?.enabled ? 'bg-green-500' : 'bg-gray-400'
        }`} />
        <span className="text-sm font-medium text-gray-700">
          {vm.corsStatus?.enabled ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
};

// Request Configuration Card
const RequestConfigCard: React.FC<{ vm: ReturnType<typeof useViewModel> }> = ({ vm }) => {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200/50 p-8 shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold text-gray-900">Request Configuration</h2>
        <div className="flex items-center">
          <label className="text-sm font-medium text-gray-700 mr-3">cURL Mode</label>
          <input
            type="checkbox"
            checked={vm.isCurlMode}
            onChange={(e) => vm.setIsCurlMode(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
          />
        </div>
      </div>

      {vm.isCurlMode ? (
        <div>
          <label className="block text-lg font-medium text-gray-900 mb-4">
            cURL Command
          </label>
          <textarea
            placeholder="curl -X GET https://www.google.com/search?q=cors"
            value={vm.requestForm.curlCommand}
            onChange={(e) => vm.setFormValue('curlCommand', e.target.value)}
            className="w-full h-40 px-6 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm bg-gray-50/50 backdrop-blur transition-all duration-200"
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
            <div>
              <label className="block text-lg font-medium text-gray-900 mb-3">
                Method
              </label>
              <select
                value={vm.requestForm.method}
                onChange={(e) => vm.setFormValue('method', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 backdrop-blur font-medium transition-all duration-200"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-lg font-medium text-gray-900 mb-3">
                URL
              </label>
              <input
                type="url"
                placeholder="https://www.google.com/search?q=cors"
                value={vm.requestForm.url}
                onChange={(e) => vm.setFormValue('url', e.target.value)}
                className="w-full px-6 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 backdrop-blur transition-all duration-200"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <button
          onClick={vm.doRequest}
          disabled={vm.status === 'loading'}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-200 hover:scale-[1.02] disabled:hover:scale-100 shadow-lg hover:shadow-xl flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
        >
          {vm.status === 'loading' ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
              Sending Request...
            </>
          ) : (
            'Send Request'
          )}
        </button>
      </div>
    </div>
  );
};

// Response Display Card
const ResponseDisplayCard: React.FC<{ vm: ReturnType<typeof useViewModel> }> = ({ vm }) => {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200/50 p-8 shadow-2xl">
      <h2 className="text-2xl font-semibold text-gray-900 mb-8">Response</h2>
      
      <div className="bg-gray-50/50 backdrop-blur rounded-2xl p-6 min-h-[400px] border border-gray-200/50">
        <ResponseContent vm={vm} />
      </div>
    </div>
  );
};

// Response Content Component
const ResponseContent: React.FC<{ vm: ReturnType<typeof useViewModel> }> = ({ vm }) => {
  if (vm.status === 'idle') {
    return (
      <div className="flex items-center justify-center h-80 text-gray-500">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-600">Ready to test</p>
          <p className="text-sm text-gray-500 mt-1">Send a request to see the response here</p>
        </div>
      </div>
    );
  }

  if (vm.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-lg font-medium text-gray-700">Sending request...</p>
          <p className="text-sm text-gray-500 mt-1">Please wait while we process your request</p>
        </div>
      </div>
    );
  }

  if (vm.status === 'error') {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-red-600">Request Failed</p>
          <p className="text-sm text-gray-600 mt-2 max-w-md">{vm.error?.message}</p>
        </div>
      </div>
    );
  }

  if (vm.status === 'partial') {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="text-center">
          <div className="animate-pulse mb-6">
            <div className="h-3 bg-blue-200/60 rounded-full w-32 mx-auto mb-3"></div>
            <div className="h-3 bg-blue-200/60 rounded-full w-24 mx-auto mb-3"></div>
            <div className="h-3 bg-blue-200/60 rounded-full w-28 mx-auto"></div>
          </div>
          <p className="text-lg font-medium text-gray-700">Processing response...</p>
          <p className="text-sm text-gray-500 mt-1">Analyzing the response data</p>
        </div>
      </div>
    );
  }

  if (!vm.response) return null;

  return (
    <div>
      <div className="mb-4 text-sm text-gray-600">
        Response Type: {vm.response.mediaType} ({vm.response.contentType})
      </div>
      <ResponseViewer response={vm.response} />
    </div>
  );
};

// Response Viewer Component
const ResponseViewer: React.FC<{ response: { mediaType: string; contentType: string; content: string } }> = ({ response }) => {
  switch (response.mediaType) {
    case 'text':
      return (
        <div className="bg-white/50 backdrop-blur rounded-2xl border border-gray-200/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Content-Type: {response.contentType}</span>
            <button 
              onClick={() => navigator.clipboard.writeText(response.content)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Copy
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words text-sm text-gray-800 max-h-96 overflow-auto font-mono leading-relaxed">
            {response.content}
          </pre>
        </div>
      );
    case 'image':
      return (
        <div className="bg-white/50 backdrop-blur rounded-2xl border border-gray-200/50 p-6">
          <div className="mb-4">
            <span className="text-sm font-medium text-gray-600">Content-Type: {response.contentType}</span>
          </div>
          <div className="flex justify-center">
            <img 
              src={response.content} 
              alt="Response" 
              className="max-w-full h-auto rounded-xl shadow-lg"
            />
          </div>
        </div>
      );
    case 'audio':
      return (
        <div className="bg-white/50 backdrop-blur rounded-2xl border border-gray-200/50 p-6">
          <div className="mb-4">
            <span className="text-sm font-medium text-gray-600">Content-Type: {response.contentType}</span>
          </div>
          <div className="flex justify-center">
            <audio controls src={response.content} className="w-full max-w-md" />
          </div>
        </div>
      );
    case 'video':
      return (
        <div className="bg-white/50 backdrop-blur rounded-2xl border border-gray-200/50 p-6">
          <div className="mb-4">
            <span className="text-sm font-medium text-gray-600">Content-Type: {response.contentType}</span>
          </div>
          <div className="flex justify-center">
            <video controls src={response.content} className="max-w-full h-auto rounded-xl" />
          </div>
        </div>
      );
    default:
      return (
        <div className="bg-white/50 backdrop-blur rounded-2xl border border-gray-200/50 p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-700 mb-2">Binary Content</p>
            <p className="text-sm text-gray-500 mb-6">Content-Type: {response.contentType}</p>
            <a
              href={response.content}
              download="response"
              className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-medium transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3" />
              </svg>
              Download Content
            </a>
          </div>
        </div>
      );
  }
};
