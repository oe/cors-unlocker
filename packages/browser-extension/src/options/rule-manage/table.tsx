import { useState } from 'react';
import { Edit, Trash } from 'lucide-react';
import type { IRuleItem } from '@/types';
import { Switch } from '@/common/shard';
import { Modal } from '@/common/modal';
import { EditRuleForm } from './rule-form';

export interface IRuleTableProps {
  rules: IRuleItem[];
  removeRule: (id: number) => void;
  updateRule: (rule: Partial<IRuleItem>) => void;
  validateRule: (url: string) => string;
  toggleRule: (rule: IRuleItem) => void;
}

export function RuleTable(props: IRuleTableProps) {
  const [currentRule, setCurrentRule] = useState<IRuleItem | null>(null)
  const onCancel = () => setCurrentRule(null);
  const onEdit = (rule: IRuleItem) => setCurrentRule(rule);
  const onSave = (rule: Partial<IRuleItem>) => {
    props.updateRule(rule);
    setCurrentRule(null);
  }

  // 空状态
  if (props.rules.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No rules found</h3>
        <p className="text-gray-500">
          Add your first CORS rule using the form above to get started.
        </p>
      </div>
    );
  }

  return (
    <>
    <EditRuleModal
      rule={currentRule}
      updateRule={onSave}
      validateRule={props.validateRule} onCancel={onCancel} />
    <div className="container mx-auto p-2">
      <table className="min-w-full bg-white table-fixed">
        <thead>
          <tr>
            <th className="py-2">#</th>
            <th className="py-2 text-left">Origin</th>
            <th className="py-2 w-20 text-xs">Site Auth</th>
            <th className="py-2 w-16">Enabled</th>
            <th className="py-2 w-24">Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.rules.map((rule) => (
            <tr key={rule.id} className="border-t border-gray-200 hover:bg-slate-100/30">
              <td className="py-2 text-center">{rule.id}</td>
              <td className="py-2 text-left break-all">
                {/* <div className='group relative'> */}
                  {rule.origin}
                  <div className='text-slate-400 break-all'>
                    {rule.comment}
                  </div>
                  {/* <div className="bg-zinc-800 p-2 rounded-md group-hover:flex hidden absolute -top-2 -translate-y-full left-12 -translate-x-1/2">
                    <div className="text-zinc-400 whitespace-nowrap">
                      <div className="text-xs">created At <FormattedDate date={rule.createdAt} /></div>
                      <div className="text-xs">updated At <FormattedDate date={rule.updatedAt} /></div>
                      
                    </div>
                    <div className="bg-inherit rotate-45 p-1 absolute bottom-0 translate-y-1/2 left-1/2 -translate-x-1/2"></div>
                  </div> */}
                {/* </div> */}
              </td>
              <td className="py-2 text-center">
                {rule.credentials ? 'Yes' : 'No'}
              </td>
              <td className="py-2 text-center">
                <Switch value={!rule.disabled} onChange={() => props.toggleRule(rule)} />
              </td>
              <td className="py-2 text-center">
                <button
                  className="text-blue-500 px-2 py-1 mr-2 rounded-sm hover:bg-blue-100"
                  onClick={() => onEdit(rule)}
                >
                  <Edit className='w-4'/>
                </button>
                <button
                  className="text-red-500 px-2 py-1 rounded-sm hover:bg-red-100"
                  onClick={() => props.removeRule(rule.id)}
                >
                  <Trash className='w-4' />
                </button>
              </td>
            </tr>
          ))}
          {props.rules.length === 0 && (
            <tr className="border-t border-gray-200">
              <td colSpan={4} className="py-2 text-center text-slate-400">No rules</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}

const rtl = new Intl.RelativeTimeFormat()

export function FormattedDate({ date, className }: { date: number, className?: string }) {
  return (
    <span className={className}>
      {new Date(date).toLocaleString()}
    ({formatTime(date)})
  </span>);
}


function formatTime(time: number) {
  const diff = time - Date.now();
  const seconds = Math.round(diff / 1000);
  if (Math.abs(seconds) < 60) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return rtl.format(minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return rtl.format(hours, 'hour');
  }
  const days = Math.round(hours / 24);
  return rtl.format(days, 'day');

}

interface IEditRuleFormProps {
  rule?: IRuleItem | null;
  updateRule: (rule: Partial<IRuleItem>) => void;
  validateRule: (url: string) => string;
  onCancel: () => void;
}

function EditRuleModal(props: IEditRuleFormProps) {
  return (<Modal
    maskClosable
    title='Edit Rule'
    visible={!!props.rule}
    footer={false}
    onClose={props.onCancel}
  >
    <EditRuleForm rule={props.rule} saveRule={props.updateRule} validateRule={props.validateRule} />
  </Modal>)
}
