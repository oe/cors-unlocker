import { IRuleItem } from '@/types';
import { Link, MessageSquareMore } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { SiteAuthInput } from '@/common/shard';
import { extConfig } from '@/common/ext-config';


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

  /**
   * validate the url
   * @param url url user input
   * @returns origin if valid, or an empty string
   */
  const validateRule = useCallback((url: string) => {
    let origin = '';
    try {
      if (!url.trim()) {
        setStatus({status: 'idle', message: ''});
        return origin;
      }
      origin = props.validateRule(url);
      setStatus({status: 'valid', message: `origin "${origin}" is valid`});
    } catch (error: unknown) {
      setStatus({status: 'invalid', message: (error as Error).message});
    }
    return origin
  }, []);

  /**
   * make it a controlled input
   */
  useEffect(() => {
    const v = props.value || '';
    setValue(v);
  }, [props.value]);

  /**
   * validate the rule when
   * * value changes
   * * validateRule changes(when the rule is updated / removed)
   */
  useEffect(() => {
    const origin = validateRule(value);
    props.onChange(value, origin);
  }, [value, props.validateRule]);
  
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const statusClass = status.status === 'valid'
    ? 'text-green-500'
    : status.status === 'invalid' ? 'text-red-500' : '';

  return (
    <div className='flex-grow'>
      <InputWithAddOn
        value={value}
        autoFocus
        prepend={<Link className='w-4' />}
        onChange={onChange}
        placeholder='Enter an origin or an url'
        onKeyUp={props.onKeyUp}
      />
      <div className={`${statusClass} text-sm min-h-6 px-2 break-all`}>{status.message}</div>
    </div>
  );
}

export interface IEditRuleProps {
  rule?: IRuleItem | null;
  validateRule: (url: string, id?: number) => string;
  saveRule: (v: { origin: string, comment: string, id?: number, credentials: boolean }) => void;
}

export function EditRuleForm(props: IEditRuleProps) {
  const idRef = useRef(props.rule?.id);
  const [formData, setFormData] = useState<Partial<IRuleItem & { url: string}>>(() => getDefaultFormData(props.rule));

  const validateRule = useCallback((url: string) => {
    return props.validateRule(url, idRef.current);
  }, [props.validateRule])

  const handleSave = () => {
    if (!formData.origin) return;
    props.saveRule({
      id: props.rule?.id,
      credentials: !!formData.credentials,
      origin: formData.origin,
      comment: formData.comment || ''
    });
    // 
    setTimeout(() => {
      setFormData(() => getDefaultFormData());
    }, 0);
  }

  const setFormValue = (val: Record<string, string | boolean>) => {
    setFormData((prev) => ({...prev, ...val}));
  }

  const onKeyUp = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    const current = e.target as HTMLInputElement;
    const form = e.currentTarget;
    if (!form || current.tagName !== 'INPUT') return;
    const index = Array.prototype.indexOf.call(form.elements, current);
    const nextInput = form.elements[index + 1];
    if (nextInput && nextInput.tagName === 'INPUT') {
      (nextInput as HTMLInputElement).focus();
    } else {
      handleSave();
    }
  };

  return (
    <form className="flex flex-col" onKeyUp={onKeyUp}>
      <RuleInput
        value={formData.url}
        validateRule={validateRule}
        onChange={(v, o) => setFormValue({url: v, origin: o})}
      />
      
      <SiteAuthInput
        value={!!formData.credentials}
        focusable
        onChange={(v) => setFormValue({ credentials: v})}
        />

      <InputWithAddOn
        className='mb-4'
        value={formData.comment || ''}
        prepend={<MessageSquareMore className='w-4'/>}
        onChange={(e) => setFormValue({ comment: e.target.value })}
        placeholder='comment(optional)' />
      <div className={'flex ' + (idRef.current ? 'justify-end' : '') }>
        <button type="button" onClick={handleSave} disabled={!formData.origin} className="bg-blue-500 disabled:bg-blue-300 text-white px-4 py-2 rounded-md self-baseline">
          { props.rule ? 'Save' : 'Add' }
        </button>

      </div>
    </form>
  )
}


interface IInputWithAddOnProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyUp?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  prepend?: React.ReactNode;
  className?: string;
  autoFocus?: boolean;
}

function InputWithAddOn(props: IInputWithAddOnProps) {
  return (
    <div className={"flex items-center rounded-md bg-white pl-3 outline outline-1 -outline-offset-1 outline-gray-300 has-[input:focus-within]:outline has-[input:focus-within]:outline-2 has-[input:focus-within]:-outline-offset-2 has-[input:focus-within]:outline-blue-500 " + (props.className || '')}>
      {props.prepend && <div className="shrink-0 select-none text-base text-gray-500 sm:text-sm/6">{props.prepend}</div>}
      <input type="text" value={props.value} onChange={props.onChange}
      autoFocus={props.autoFocus}
      onKeyUp={props.onKeyUp}
      className="block min-w-0 grow py-1.5 pl-1 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline focus:outline-0 sm:text-sm/6" placeholder={props.placeholder} />
    </div>

  )
}

function getDefaultFormData(rule?: IRuleItem | null) {
  if (rule) {
    return {
      url: rule.origin,
      origin: rule.origin,
      comment: rule.comment,
      credentials: rule.credentials
    }
  }
  return { url: '', origin: '', comment: '', credentials: extConfig.get().dftEnableCredentials };
}
