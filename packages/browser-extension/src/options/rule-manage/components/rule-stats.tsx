interface RuleStatsProps {
  currentCount: number;
  maxCount: number;
  filteredCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
}

export function RuleStats({ 
  currentCount, 
  maxCount, 
  filteredCount, 
  pageSize, 
  currentPage, 
  totalPages 
}: RuleStatsProps) {
  const isOverLimit = currentCount >= maxCount;
  
  return (
    <div className="flex justify-between items-center mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Manage Rules</h1>
        <div className="flex items-center gap-4 mt-1">
          <p className="text-sm text-gray-600">
            <span className={`font-medium ${isOverLimit ? 'text-red-600' : 'text-gray-800'}`}>
              {currentCount}
            </span>
            <span className="text-gray-500"> / {maxCount} rules configured</span>
          </p>
          {isOverLimit && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
              Limit reached
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">
          Showing {Math.min(pageSize, filteredCount)} of {filteredCount}
        </span>
        {totalPages > 1 && (
          <span className="text-xs text-gray-400">
            (Page {currentPage} of {totalPages})
          </span>
        )}
      </div>
    </div>
  );
}
