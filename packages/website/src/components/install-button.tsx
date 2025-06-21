import { useState, useEffect } from 'react';

// Import the CORS Unlocker npm package
// Note: This should be available since it's built in the predev step
let corsUnlocker: any = null;

// Dynamically import the CORS Unlocker package
async function loadCorsUnlocker() {
  if (corsUnlocker) return corsUnlocker;
  
  try {
    // Try to import the npm package - using dynamic import for client-side loading
    if (typeof window !== 'undefined') {
      corsUnlocker = await import('cors-unlocker');
      return corsUnlocker;
    }
    return null;
  } catch (error) {
    console.warn('CORS Unlocker package not available:', error);
    return null;
  }
}

interface InstallButtonProps {
  className?: string;
}

export default function InstallButton({ className = '' }: InstallButtonProps) {
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  // Check if extension is installed on component mount
  useEffect(() => {
    let mounted = true;

    async function checkInstallation() {
      try {
        const lib = await loadCorsUnlocker();
        if (!lib || !mounted) return;

        const installed = await lib.isExtInstalled();
        if (mounted) {
          setIsInstalled(installed);
          
          if (installed) {
            // Keep loading state a bit longer to show the transition
            setTimeout(() => {
              if (mounted) {
                setIsLoading(false);
                
                // Start animation after showing installed state
                setTimeout(() => {
                  if (mounted) {
                    setIsAnimating(true);
                    // Keep animation running longer so user can see it
                    setTimeout(() => {
                      if (mounted) setIsAnimating(false);
                    }, 2000); // Extended from 600ms to 2000ms
                  }
                }, 300); // Small delay before animation starts
              }
            }, 800); // Show loading for 800ms even if installed
          } else {
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.warn('Failed to check extension installation:', error);
        if (mounted) {
          setIsInstalled(false);
          setIsLoading(false);
        }
      }
    }

    checkInstallation();

    return () => {
      mounted = false;
    };
  }, []);

  const handleInstallClick = async () => {
    if (isInstalled) return; // Don't do anything if already installed
    
    try {
      const lib = await loadCorsUnlocker();
      if (lib?.openStorePage) {
        lib.openStorePage();
      } else {
        // Fallback: open Chrome Web Store
        window.open('https://chromewebstore.google.com/detail/cors-unlocker/knhlkjdfmgkmelcjfnbbhpphkmjjacng', '_blank');
      }
    } catch (error) {
      console.error('Failed to open store page:', error);
      // Fallback: open Chrome Web Store
      window.open('https://chromewebstore.google.com/detail/cors-unlocker/knhlkjdfmgkmelcjfnbbhpphkmjjacng', '_blank');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <button
        disabled
        className={`inline-flex items-center px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-2xl transition-all duration-300 ${className}`}
      >
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <span>Checking...</span>
        </div>
      </button>
    );
  }

  // Installed state
  if (isInstalled) {
    return (
      <button
        disabled
        className={`relative inline-flex items-center px-8 py-4 text-lg font-semibold text-white bg-green-600 rounded-2xl transition-all duration-700 transform ${
          isAnimating ? 'scale-110' : 'scale-100'
        } ${className}`}
      >
        <div className="flex items-center space-x-2">
          <svg 
            className={`w-5 h-5 transition-transform duration-700 ${isAnimating ? 'scale-125' : ''}`}
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path 
              fillRule="evenodd" 
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
              clipRule="evenodd" 
            />
          </svg>
          <span>Extension Installed</span>
        </div>
        
        {/* Success animation particles - longer duration */}
        {isAnimating && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 w-3 h-3 bg-white rounded-full animate-ping opacity-75 transform -translate-x-1/2 -translate-y-1/2 animation-duration-1000"></div>
            <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-white rounded-full animate-pulse opacity-60 animation-delay-300"></div>
            <div className="absolute top-3/4 right-1/4 w-2 h-2 bg-white rounded-full animate-pulse opacity-60 animation-delay-600"></div>
            <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-white rounded-full animate-ping opacity-50 animation-delay-900"></div>
          </div>
        )}
      </button>
    );
  }

  // Not installed state
  return (
    <button
      onClick={handleInstallClick}
      className={`relative group inline-flex items-center px-8 py-4 text-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer hover:shadow-blue-500/25 ${className}`}
    >
      <div className="flex items-center space-x-2">
        <svg 
          className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 6v6m0 0v6m0-6h6m-6 0H6" 
          />
        </svg>
        <span>Install Extension</span>
      </div>
      
      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-blue-400 rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none"></div>
    </button>
  );
}
