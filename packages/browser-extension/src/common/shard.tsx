export interface ISwitchProps {
  value?: boolean;
  onChange: (value: boolean) => void;
  focusable?: boolean;
  label?: React.ReactNode;
  compact?: boolean;
  disabled?: boolean;
}

export function Switch(props: ISwitchProps) {
  const focusClass = props.focusable ? 'peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 peer0-focus:ring-opacity-50' : '';
  // prevent click A tag to trigger checkbox
  const onClickLabel = (e: React.MouseEvent<HTMLSpanElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      e.stopPropagation();
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    props.onChange(e.target.checked);
  }

  const className = props.compact ? 'text-xs inline' : 'inline-flex items-center text-sm';
  const switchSizeClass = props.compact ? ' inline-block w-5 h-3 after:h-2 after:w-2' : ' w-11 h-6 after:h-5 after:w-5';
  return (
    <label className={className}>
      <input 
        type="checkbox" 
        className="sr-only peer" 
        checked={!!props.value} 
        onChange={onChange} 
        disabled={props.disabled}
      />
      <div className={"relative bg-gray-200 shrink-0 rounded-full  dark:bg-gray-400 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:transition-all dark:border-gray-600 peer-checked:bg-blue-500 " + (props.disabled ? 'opacity-50 cursor-not-allowed' : '') + ' ' + focusClass + switchSizeClass}></div>

      {props.label && <span className={`ml-2 text-gray-400 ${props.disabled ? 'opacity-50' : ''}`} onClick={onClickLabel}>{props.label}</span>}
    </label>
  )
}

export interface IAuthHelpProps {
  /**
   * Whether credentials are enabled for the current rule
   */
  credentialsEnabled?: boolean;
  /**
   * Current rule for editing custom headers
   */
  rule?: { id: number; origin: string } | null;
  /**
   * Callback to open options page with specific rule for editing
   */
  onEditRule?: (ruleId: number) => void;
}

export function AuthHelp(props: IAuthHelpProps) {
  const handleEditHeaders = (e: React.MouseEvent) => {
    e.preventDefault();
    if (props.rule && props.onEditRule) {
      props.onEditRule(props.rule.id);
    }
  };

  return (
    <>
      Off: Block login info (higher privacy); On: Allow login info to be used (full features). 
      <a href="https://cors.forth.ink/faq/#auth" target="_blank" className='text-blue-400 underline' rel="noreferrer">
        Learn more
      </a>
      {props.credentialsEnabled && props.rule && (
        <>
          . <a 
            href="#" 
            onClick={handleEditHeaders}
            className='text-blue-400 underline hover:text-blue-300'
          >
            Custom headers
          </a>
        </>
      )}
    </>
  );
}

export interface ISiteAuthSwitchProps extends Omit<ISwitchProps, 'label'> {
  /**
   * Whether credentials are enabled for the current rule
   */
  credentialsEnabled?: boolean;
  /**
   * Current rule for editing custom headers
   */
  rule?: { id: number; origin: string } | null;
  /**
   * Callback to open options page with specific rule for editing
   */
  onEditRule?: (ruleId: number) => void;
  /**
   * Use vertical layout for compact display (like popup)
   */
  vertical?: boolean;
}

export function SiteAuthSwitch(props: ISiteAuthSwitchProps) {
  const { credentialsEnabled, rule, onEditRule, vertical, ...switchProps } = props;
  
  if (vertical) {
    // Vertical layout for popup
    return (
      <div className="flex flex-col items-center gap-2">
        <Switch
          value={switchProps.value}
          focusable
          compact={switchProps.compact}
          onChange={switchProps.onChange}
          disabled={switchProps.disabled}
        />
        <div className="text-xs text-center dark:text-white">
          <AuthHelp 
            credentialsEnabled={credentialsEnabled} 
            rule={rule}
            onEditRule={onEditRule}
          />
        </div>
      </div>
    );
  }
  
  // Default horizontal layout
  return (
    <Switch
      value={switchProps.value}
      focusable
      compact={switchProps.compact}
      onChange={switchProps.onChange}
      disabled={switchProps.disabled}
      label={
        <AuthHelp 
          credentialsEnabled={credentialsEnabled} 
          rule={rule}
          onEditRule={onEditRule}
        />
      } 
    />
  );
}

export interface ISiteAuthInputProps extends Omit<ISwitchProps, 'label'> {
  /**
   * Whether credentials are enabled for the current rule
   */
  credentialsEnabled?: boolean;
  /**
   * Current rule for editing custom headers
   */
  rule?: { id: number; origin: string } | null;
  /**
   * Callback to open options page with specific rule for editing
   */
  onEditRule?: (ruleId: number) => void;
  /**
   * Use vertical layout for compact display (like popup)
   */
  vertical?: boolean;
}

export function SiteAuthInput(props: ISiteAuthInputProps) {
  const { credentialsEnabled, rule, onEditRule, vertical, ...switchProps } = props;
  const className = switchProps.compact ? 'mb-4 text-xs' : 'mb-4 flex items-center text-sm';
  const labelClassName = switchProps.compact ? 'inline mr-2 text-slate-200 shrink-0' : 'mr-2 text-slate-600 shrink-0';
  
  return (
    <div className={className}>
      <span className={labelClassName}>Site Auth</span>
      <SiteAuthSwitch
        value={switchProps.value}
        focusable
        compact={switchProps.compact}
        onChange={switchProps.onChange}
        disabled={switchProps.disabled}
        credentialsEnabled={credentialsEnabled}
        rule={rule}
        onEditRule={onEditRule}
        vertical={vertical}
      />
    </div>
  );
}