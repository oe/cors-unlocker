import { useViewModel } from './view-model';
import { RuleTable } from './table';
import { EditRuleForm } from './rule-form';
import { SearchBar } from './components/search-bar';
import { Pagination } from './components/pagination';
import './style.scss';

export function RuleManage() {
  const { 
    rules, 
    saveRule,
    removeRule, 
    updateRule, 
    validateRule, 
    toggleRule,
    filteredRules,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    totalPages,
    pageSize,
    maxRules,
    paginatedRules
  } = useViewModel();

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Rules</h1>
      </div>
      
      <div className="space-y-6">
        <EditRuleForm saveRule={saveRule} validateRule={validateRule} />
        
        <div className="space-y-4">
          {/* 规则统计信息 - 两端对齐 */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-600">
                <span className={`font-medium ${rules.length >= maxRules ? 'text-red-600' : 'text-gray-800'}`}>
                  {rules.length}
                </span>
                <span className="text-gray-500"> / {maxRules} rules configured</span>
              </p>
              {rules.length >= maxRules && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                  Limit reached
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                Showing {Math.min(pageSize, filteredRules.length)} of {filteredRules.length}
              </span>
              {totalPages > 1 && (
                <span className="text-xs text-gray-400">
                  (Page {currentPage} of {totalPages})
                </span>
              )}
            </div>
          </div>

          <SearchBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            resultsCount={filteredRules.length}
            show={rules.length > 10}
          />
          
          <RuleTable
            rules={paginatedRules}
            toggleRule={toggleRule}
            removeRule={removeRule}
            validateRule={validateRule}
            updateRule={updateRule} 
          />
          
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            filteredCount={filteredRules.length}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
}

