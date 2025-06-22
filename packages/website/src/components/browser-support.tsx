import React, { useState, useEffect } from 'react';

// 检测浏览器类型和支持情况
const detectBrowser = (): { type: string; supported: boolean; name: string } => {
  if (typeof window === 'undefined') return { type: 'unknown', supported: false, name: 'Unknown' };
  
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Chrome 和基于 Chromium 的浏览器
  if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
    return { type: 'chrome', supported: true, name: 'Chrome' };
  }
  
  // Microsoft Edge
  if (userAgent.includes('edg')) {
    return { type: 'edge', supported: true, name: 'Microsoft Edge' };
  }
  
  // Firefox
  if (userAgent.includes('firefox')) {
    return { type: 'firefox', supported: true, name: 'Firefox' };
  }
  
  // Safari
  if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    return { type: 'safari', supported: false, name: 'Safari' };
  }
  
  // 移动端检测
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  if (isMobile) {
    return { type: 'mobile', supported: false, name: 'Mobile Browser' };
  }
  
  // 其他浏览器
  return { type: 'other', supported: false, name: 'Unknown Browser' };
};

interface BrowserSupportProps {
  showOnSupported?: boolean; // 是否在支持的浏览器上也显示信息
  className?: string;
}

export const BrowserSupport: React.FC<BrowserSupportProps> = ({ 
  showOnSupported = false, 
  className = '' 
}) => {
  const [browser, setBrowser] = useState<{ type: string; supported: boolean; name: string }>({
    type: 'unknown',
    supported: false,
    name: 'Unknown'
  });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const browserInfo = detectBrowser();
    setBrowser(browserInfo);
    setIsVisible(!browserInfo.supported || showOnSupported);
  }, [showOnSupported]);

  if (!isVisible) return null;

  if (browser.supported) {
    return (
      <div className={`bg-green-50/80 backdrop-blur border border-green-200 rounded-2xl p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-green-800">
              ✨ Great! {browser.name} is fully supported
            </p>
            <p className="text-xs text-green-600 mt-1">
              You can install and use CORS Unlocker extension seamlessly
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 不支持的浏览器
  const getUnsupportedMessage = () => {
    switch (browser.type) {
      case 'safari':
        return {
          title: 'Safari Not Supported',
          message: 'Safari does not support the extension API required for CORS Unlocker.',
          suggestion: 'Please switch to Chrome, Edge, or Firefox for the best experience.'
        };
      case 'mobile':
        return {
          title: 'Mobile Browser Limitation',
          message: 'Mobile browsers do not support browser extensions.',
          suggestion: 'Please use a desktop browser like Chrome, Edge, or Firefox.'
        };
      default:
        return {
          title: 'Browser Not Supported',
          message: 'Your current browser may not support CORS Unlocker extension.',
          suggestion: 'We recommend using Chrome, Edge, or Firefox for optimal compatibility.'
        };
    }
  };

  const { title, message, suggestion } = getUnsupportedMessage();

  return (
    <div className={`bg-amber-50/80 backdrop-blur border border-amber-200 rounded-2xl p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800 mb-1">{title}</p>
          <p className="text-xs text-amber-700 mb-2">{message}</p>
          <p className="text-xs text-amber-600">{suggestion}</p>
        </div>
      </div>
    </div>
  );
};

// 支持的浏览器列表组件
export const SupportedBrowsers: React.FC<{ className?: string }> = ({ className = '' }) => {
  const browsers = [
    { name: 'Chrome', icon: '🌐', supported: true },
    { name: 'Edge', icon: '🔷', supported: true },
    { name: 'Firefox', icon: '🦊', supported: true },
    { name: 'Brave', icon: '🦁', supported: true, note: 'Chrome Web Store compatible' },
    { name: 'Opera', icon: '🔴', supported: true, note: 'Chrome Web Store compatible' },
    { name: 'Safari', icon: '🧭', supported: false },
    { name: 'Mobile', icon: '📱', supported: false },
  ];

  return (
    <div className={`bg-gray-50/80 backdrop-blur border border-gray-200 rounded-2xl p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Browser Compatibility
      </h3>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {browsers.map((browser) => (
          <div 
            key={browser.name}
            className={`flex items-center gap-2 p-3 rounded-xl border ${
              browser.supported 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-gray-100 border-gray-200 text-gray-600'
            }`}
          >
            <span className="text-lg">{browser.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{browser.name}</div>
              {browser.note && (
                <div className="text-xs opacity-75">{browser.note}</div>
              )}
            </div>
            {browser.supported ? (
              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-xs text-gray-600">
        <p>✅ <strong>Supported:</strong> Chrome, Edge, Firefox, and all Chrome Web Store compatible browsers</p>
        <p>❌ <strong>Not Supported:</strong> Safari (extension API limitations), Mobile browsers (no extension support)</p>
      </div>
    </div>
  );
};
