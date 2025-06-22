import { AlertCircle, CheckCircle } from 'lucide-react';

interface MessageProps {
  message: { type: 'success' | 'error'; text: string } | null;
}

export function Message({ message }: MessageProps) {
  if (!message) return null;

  return (
    <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
      message.type === 'success' 
        ? 'bg-green-100 text-green-800'
        : 'bg-red-100 text-red-800'
    }`}>
      {message.type === 'success' ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <AlertCircle className="w-4 h-4" />
      )}
      {message.text}
    </div>
  );
}
