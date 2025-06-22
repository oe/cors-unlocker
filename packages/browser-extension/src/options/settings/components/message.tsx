import { AlertCircle, CheckCircle } from 'lucide-react';

interface MessageProps {
  message: { type: 'success' | 'error'; text: string } | null;
}

export function Message({ message }: MessageProps) {
  if (!message) return null;

  const isAutoSaveMessage = message.text === 'Saved';

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 shadow-lg ${
      message.type === 'success' 
        ? isAutoSaveMessage 
          ? 'bg-green-50 text-green-700 border border-green-200' // More subtle for auto-save
          : 'bg-green-50 text-green-800 border border-green-200'
        : 'bg-red-50 text-red-800 border border-red-200'
    }`}>
      {message.type === 'success' ? (
        <CheckCircle className={`${isAutoSaveMessage ? 'w-4 h-4' : 'w-5 h-5'}`} />
      ) : (
        <AlertCircle className="w-5 h-5" />
      )}
      <span className={`${isAutoSaveMessage ? 'text-sm font-medium' : 'font-medium'} whitespace-nowrap`}>{message.text}</span>
    </div>
  );
}
