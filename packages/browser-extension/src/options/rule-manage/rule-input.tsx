import { useState, useEffect } from 'react';

export interface IRuleInputProps {
  value?: string;
  onChange: (value: string, origin: string) => void;
  validateRule: (url: string) => string
  onKeyUp?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

type InputStatus = {
  status: 'idle' | 'valid' | 'invalid';
  message: string;
}

export function RuleInput(props: IRuleInputProps) {
  const [value, setValue] = useState(props.value || '');
  const [status, setStatus] = useState<InputStatus>({status: 'idle', message: ''});

  const validateRule = (url: string) => {
    let origin = '';
    try {
      if (!url.trim()) {
        setStatus({status: 'idle', message: ''});
        return origin;
      }
      origin = props.validateRule(url);
      setStatus({status: 'valid', message: `origin "${origin}" is valid`});
    } catch (error: any) {
      setStatus({status: 'invalid', message: error.message});
    }
    return origin
  }

  useEffect(() => {
    const v = props.value || '';
    setValue(v);
    validateRule(v);
  }, [props.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    let origin = validateRule(value);
    setValue(e.target.value);
    props.onChange(e.target.value, origin);
  };

  const statusClass = status.status === 'valid'
    ? 'text-green-500'
    : status.status === 'invalid' ? 'text-red-500' : '';

  return (
    <div className='flex-grow mr-2'>
      <input
        type="text"
        value={value}
        placeholder='Enter an origin or an url'
        onChange={handleChange}
        className="border p-2 rounded-sm w-full"
        onKeyUp={props.onKeyUp}
      />
      <div className={`${statusClass} text-sm h-6 pl-2`}>{status.message}</div>
    </div>
  );
}

export interface IAddRuleProps {
  validateRule: (url: string) => string;
  addRule: (url: string) => void;
}

export function AddRuleForm(props: IAddRuleProps) {
  const [value, setValue] = useState({value: '', origin: ''});

  const handleAdd = () => {
    if (!value.origin) return;
    props.addRule(value.origin);
    setValue({value: '', origin: ''});
  }

  return (
    <div className="mt-4 flex">
      <RuleInput
        value={value.value}
        validateRule={props.validateRule}
        onChange={(v, o) => setValue({value: v, origin: o})}
        onKeyUp={(e) => { if (e.key === 'Enter') handleAdd(); }}
      />
      <button onClick={handleAdd} disabled={!value.origin} className="bg-blue-500 disabled:bg-blue-300 text-white px-4 py-2 rounded-sm self-baseline">
        Add
      </button>
    </div>
  )
}
