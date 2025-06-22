import { Search } from 'lucide-react';

interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  resultsCount: number;
  show: boolean;
}

export function SearchBar({ 
  searchTerm, 
  onSearchChange, 
  resultsCount, 
  show 
}: SearchBarProps) {
  if (!show) return null;

  return (
    <div className="mb-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search rules by origin or comment..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>
      {searchTerm && (
        <p className="text-sm text-gray-500 mt-1">
          Found {resultsCount} rule{resultsCount !== 1 ? 's' : ''} matching &ldquo;{searchTerm}&rdquo;
        </p>
      )}
    </div>
  );
}
