export interface ISwitchProps {
  value?: boolean;
  onChange: (value: boolean) => void;
  focusable?: boolean;
  label?: React.ReactNode;
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

  return (
    <label className="inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" checked={!!props.value} onChange={onChange} />
      <div className={"relative w-11 h-6 bg-gray-200 shrink-0 rounded-full  dark:bg-gray-400 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500 " + focusClass}></div>

      {props.label && <span className="ml-2 text-sm text-gray-400" onClick={onClickLabel}>{props.label}</span>}
    </label>
  )
}