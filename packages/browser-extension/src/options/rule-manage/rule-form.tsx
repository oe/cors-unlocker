import { IRuleItem } from '@/types';
import { Link, Tags, X } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { SiteAuthInput } from '@/common/shard';
import { extConfig } from '@/common/ext-config';
import { PRESET_CORS_HEADERS, validateExtraHeaders } from '@/common/rules';


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
  saveRule: (v: { origin: string, extraHeaders?: string, id?: number, credentials: boolean }) => Promise<boolean>;
}

export function EditRuleForm(props: IEditRuleProps) {
  const idRef = useRef(props.rule?.id);
  const [formData, setFormData] = useState<Partial<IRuleItem & { url: string}>>(() => getDefaultFormData(props.rule));
  const [saveError, setSaveError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const validateRule = useCallback((url: string) => {
    return props.validateRule(url, idRef.current);
  }, [props.validateRule])

  const handleSave = async () => {
    if (!formData.origin) return;
    
    setIsSaving(true);
    setSaveError('');
    
    try {
      const success = await props.saveRule({
        id: props.rule?.id,
        credentials: !!formData.credentials,
        origin: formData.origin,
        extraHeaders: formData.extraHeaders || ''
      });
      
      if (success) {
        // Clear form on successful save (only for new rules)
        if (!props.rule?.id) {
          setTimeout(() => {
            setFormData(() => getDefaultFormData());
          }, 0);
        }
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save rule');
    } finally {
      setIsSaving(false);
    }
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
      
      {saveError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{saveError}</p>
        </div>
      )}
      
      <SiteAuthInput
        value={!!formData.credentials}
        focusable
        onChange={(v) => setFormValue({ credentials: v})}
        />

      {formData.credentials && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Tags className="w-4 h-4 inline mr-1" />
            Custom Headers
          </label>
          <TagInput
            value={formData.extraHeaders || ''}
            onChange={(v) => setFormValue({ extraHeaders: v })}
            placeholder="Enter custom headers (press space/comma to add)"
            showCredentials={true}
          />
        </div>
      )}

      <div className={'flex ' + (idRef.current ? 'justify-end' : '') }>
        <button 
          type="button" 
          onClick={handleSave} 
          disabled={!formData.origin || isSaving} 
          className="bg-blue-500 disabled:bg-blue-300 text-white px-4 py-2 rounded-md self-baseline"
        >
          {isSaving ? 'Saving...' : (props.rule ? 'Save' : 'Add')}
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
    <div className={"flex items-center rounded-md bg-white pl-3 outline-1 -outline-offset-1 outline-gray-300 has-[input:focus-within]:outline-2 has-[input:focus-within]:-outline-offset-2 has-[input:focus-within]:outline-blue-500 " + (props.className || '')}>
      {props.prepend && <div className="shrink-0 select-none text-base text-gray-500 sm:text-sm/6">{props.prepend}</div>}
      <input type="text" value={props.value} onChange={props.onChange}
      autoFocus={props.autoFocus}
      onKeyUp={props.onKeyUp}
      className="block min-w-0 grow py-1.5 pl-1 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-0 sm:text-sm/6" placeholder={props.placeholder} />
    </div>

  )
}

function getDefaultFormData(rule?: IRuleItem | null) {
  if (rule) {
    return {
      url: rule.origin,
      origin: rule.origin,
      extraHeaders: rule.extraHeaders,
      credentials: rule.credentials
    }
  }
  return { url: '', origin: '', extraHeaders: '', credentials: extConfig.get().dftEnableCredentials };
}

// Tag input component for extra headers
interface ITagInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showCredentials?: boolean;
}

function TagInput(props: ITagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [validationMessage, setValidationMessage] = useState<{ type: 'success' | 'warning' | 'error', text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const tags = props.value ? props.value.split(',').filter(t => t.trim()) : [];

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;

    const validation = validateExtraHeaders(trimmed);
    
    // Show validation messages
    if (validation.invalid.length > 0) {
      setValidationMessage({ type: 'error', text: `Invalid header format: ${validation.invalid.join(', ')}` });
      return;
    }
    
    if (validation.duplicates.length > 0) {
      setValidationMessage({ type: 'warning', text: `Already exists in preset headers: ${validation.duplicates.join(', ')}` });
      return;
    }

    if (validation.headers.length > 0) {
      const currentTags = props.value ? props.value.split(',').filter(t => t.trim()) : [];
      const newTags = [...currentTags, ...validation.headers];
      props.onChange(newTags.join(','));
      setValidationMessage({ type: 'success', text: `Added: ${validation.headers.join(', ')}` });
    }

    setInputValue('');
    setTimeout(() => setValidationMessage(null), 3000);
  };

  const removeTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    props.onChange(newTags.join(','));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 p-2 border border-gray-300 rounded-md bg-white min-h-[42px] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
        {tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="text-blue-600 hover:text-blue-800"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={tags.length === 0 ? props.placeholder : ''}
          className="flex-1 min-w-[120px] border-0 outline-0 bg-transparent"
        />
      </div>
      
      {validationMessage && (
        <div className={`text-sm px-2 ${
          validationMessage.type === 'error' ? 'text-red-600' : 
          validationMessage.type === 'warning' ? 'text-yellow-600' : 
          'text-green-600'
        }`}>
          {validationMessage.text}
        </div>
      )}
      
      {props.showCredentials && (
        <div className="text-sm text-gray-500 px-2">
          <div className="mb-1">Preset headers included:</div>
          <div className="flex flex-wrap gap-1">
            {PRESET_CORS_HEADERS.map((header) => (
              <span key={header} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                {header}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
