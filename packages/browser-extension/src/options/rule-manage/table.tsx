import { Edit, Trash } from 'lucide-react';
import type { IRuleItem } from '@/types';

export interface IRuleTableProps {
  rules: IRuleItem[];
  removeRule: (id: number) => void;
  updateRule: (rule: IRuleItem) => void;
  toggleRule: (rule: IRuleItem) => void;
}

export function RuleTable(props: IRuleTableProps) {
  return (
    <div className="container mx-auto p-2">
      <table className="min-w-full bg-white table-fixed">
        <thead>
          <tr>
            <th className="py-2">#</th>
            <th className="py-2 text-left">Origin</th>
            <th className="py-2">Enabled</th>
            <th className="py-2 w-32">Actions</th>
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
                <label className="inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={!rule.disabled} onChange={() => props.toggleRule(rule)} />
                  <div className="relative w-11 h-6 bg-gray-200 rounded-full  dark:bg-gray-400 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>

              </td>
              <td className="py-2 text-center">
                <button
                  className="text-blue-500 px-2 py-1 mr-2 rounded-sm hover:bg-blue-100"
                  onClick={() => props.updateRule(rule)}
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
        </tbody>
      </table>
    </div>
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