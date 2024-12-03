import { useViewModel } from './view-model';
import { RuleTable } from './table';
import { AddRuleForm } from './rule-input';
import './style.scss';

export function RuleManage() {
  const { rules, addRule, removeRule, updateRule, validateRule } = useViewModel();

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Manage Rules</h1>
      <AddRuleForm addRule={addRule} validateRule={validateRule} />
      <RuleTable rules={rules} removeRule={removeRule} updateRule={updateRule} />
    </div>
  );
}

