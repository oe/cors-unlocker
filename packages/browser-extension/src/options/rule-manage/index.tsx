import { useViewModel } from './view-model';
import { RuleTable } from './table';
import { EditRuleForm } from './rule-form';
import './style.scss';

export function RuleManage() {
  const { rules, addRule, removeRule, updateRule, validateRule, toggleRule } = useViewModel();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Manage Rules</h1>
      <EditRuleForm saveRule={addRule} validateRule={validateRule} />
      <RuleTable
        rules={rules}
        toggleRule={toggleRule}
        removeRule={removeRule}
        validateRule={validateRule}
        updateRule={updateRule} />
    </div>
  );
}

