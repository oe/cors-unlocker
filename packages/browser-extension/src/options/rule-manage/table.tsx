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
            <tr key={rule.id} className="border-t hover:bg-slate-100/30">
              <td className="py-2 text-center">{rule.id}</td>
              <td className="py-2 text-left">
                {rule.origin}
                <div className='text-slate-400'>
                  {rule.comment}
                </div>
              </td>
              {/* <td className="py-2 text-center">
                <FormattedDate date={rule.createdAt} /> / <FormattedDate date={rule.updatedAt} />
              </td> */}
              <td className="py-2 text-center">
                {rule.credentials ? 'On' : 'Off'}
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
            <tr className="border-t">
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

function FormattedDate({ date, className }: { date: number, className?: string }) {
  return (<span title={new Date(date).toLocaleString()} className={className}>
    {formatTime(date)}
  </span>);
}


function formatTime(time: number) {
  const diff = time - Date.now();
  const seconds = Math.round(diff / 1000);
  if (Math.abs(seconds) < 60) {
    return rtl.format(seconds, 'second');
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
  console.log('props.rule', props.rule)
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
