import React from 'react';
import { useViewModel } from './view-model';

export const PlaygroundPage: React.FC = () => {
  const {
    status, setFormValue, requestForm, errorRef, corsStatus,
    isCurlMode, setIsCurlMode, doRequest, responseRef,
    toggleCors, toggleCorsCredentials, isInstalled,
  } = useViewModel();


  const renderResponse = () => {
    if (status === 'idle') return <p>No request yet.</p>;
    if (status === 'loading') return <p>Loading...</p>;
    if (status === 'error') return <p>Error occurred while fetching response: {errorRef.current?.message}</p>;
    if (status === 'partial') return (
      <p>Response is being fetched, {responseRef.current.mediaType}({responseRef.current.contentType}) received, body is been handling...</p>
    )
    return <ResponseContent {...responseRef.current} />;
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Cross-Origin Request Playground</h1>

      {/* Request Area */}
      <div className="mb-6 border-b pb-4 relative">
        <label className="text-lg font-medium absolute top-0 right-0">
          cURL
          <input
            type="checkbox"
            checked={isCurlMode}
            onChange={() => setIsCurlMode(!isCurlMode)}
            className="w-4 h-4 cursor-pointer"
          />
        </label>

        {isCurlMode ? (
          <div>
            <label className="block mb-2">cURL Command:</label>
            <textarea
              autoFocus
              placeholder="Enter a valid cURL command"
              value={requestForm.curlCommand}
              onChange={(e) => setFormValue('curlCommand', e.target.value)}
              className="border rounded p-2 w-full h-32"
            />
          </div>
        ) : (
          <div className='flex gap-4 items-center justify-center'>
            <div className='w-32'>
              <label className="block mb-2">Method:</label>
              <select
                value={requestForm.method}
                onChange={(e) => setFormValue('method', e.target.value)}
                className="border rounded p-2 h-10 w-full"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div className='flex-1'>
              <label className="block mb-2">URL:</label>
              <input
                type="url"
                autoFocus
                placeholder="Enter a valid URL"
                value={requestForm.url}
                onChange={(e) => setFormValue('url', e.target.value)}
                className="border rounded p-2 h-10 w-full"
              />
            </div>
          </div>
        )}

        <div className='mt-4 flex items-center'>
          <button
            disabled={status === 'loading'}
            onClick={doRequest}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Send Request
          </button>
          {
            isInstalled
            ? (<>
              <div className='ml-4 text-sm'>
                CORS Manage
              </div>
              <div className='ml-4'>
                <input type="checkbox" id="toggle-cors" readOnly hidden className='peer' checked={corsStatus.enabled} />
                <label
                  htmlFor="toggle-cors"
                  className='px-2 py-1 transition-all bg-gray-200 text-gray-800 rounded hover:bg-gray-300 bg-gradient-to-r opacity-80  peer-checked:from-cyan-500 peer-checked:to-blue-500 peer-checked:text-white'
                  onClick={toggleCors}
                  >CORS</label>
              </div>
              <div className='ml-4'>
                <input type="checkbox" id="toggle-credentials" readOnly hidden className='peer' checked={corsStatus.credentials} />
                <label
                  htmlFor="toggle-credentials"
                  aria-disabled={!corsStatus.enabled}
                  className='px-2 py-1 transition-all bg-gray-200 text-gray-800 rounded hover:bg-gray-300 bg-gradient-to-r opacity-80 aria-disabled:opacity-50  peer-checked:from-cyan-500 peer-checked:to-blue-500 peer-checked:text-white'
                  onClick={toggleCorsCredentials}
                  >with credentials</label>
              </div>
            </>)
            : (
              <div className='ml-2 text-sm text-red-500'>
                You need to <a href="/" className='text-blue-400'>install the extension</a> to manage CORS
              </div>
            )
          }
        </div>
      </div>

      {/* Response Area */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Response</h2>
        <div className="border p-4 rounded bg-gray-50">
          {renderResponse()}
        </div>
      </div>
    </div>
  );
};


function ResponseContent(props: { content: string, mediaType: string, contentType: string }) {
  const responseType = <div className='mb-2 text-gray-400'>Response Type: {props.mediaType}({props.contentType})</div>;
  switch (props.mediaType) {
    case 'text':
      return (
        <>
          {responseType}
          <pre className="whitespace-pre-line break-words">{props.content}</pre>
        </>
      )
    case 'audio':
      return (
        <>
          {responseType}
          <audio controls src={props.content} className='block max-w-full' />;
        </>
      )
    case 'video':
      return (
        <>
          {responseType}
          <video controls src={props.content} className="block max-w-full" />;
        </>
      )
    case 'image':
      return (
        <>
          {responseType}
          <img src={props.content} alt="Response" className="block max-w-full h-auto" />;
        </>
      )
    default:
      return (
      <div>
        <p>Unsupported response type: {props.contentType}</p>
        <a
          href={props.content}
          download="response"
          className="text-blue-500 hover:underline"
        >
          Download Content
        </a>
      </div>)
  }
}
