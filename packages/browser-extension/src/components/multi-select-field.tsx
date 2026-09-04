import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

type MultiSelectFieldProps = {
  id: string;
  label: string;
  options: readonly string[];
  value: string[];
  allLabel: string;
  onChange: (value: string[]) => void;
};

function selectedLabel(value: string[], allLabel: string): string {
  if (value.length === 0) return allLabel;
  if (value.length <= 2) return value.join(', ');
  return `${value.length} selected`;
}

export function MultiSelectField({
  id,
  label,
  options,
  value,
  allLabel,
  onChange,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const toggle = (option: string) => {
    onChange(selected.has(option)
      ? value.filter((item) => item !== option)
      : options.filter((item) => selected.has(item) || item === option));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            aria-label={`${label}: ${selectedLabel(value, allLabel)}`}
          />
        )}
      >
        <span className="truncate">{selectedLabel(value, allLabel)}</span>
        <ChevronDown data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-56 gap-1 p-1">
        <PopoverHeader className="px-2 py-1">
          <PopoverTitle>{label}</PopoverTitle>
          <PopoverDescription>Select any combination.</PopoverDescription>
        </PopoverHeader>
        <div role="listbox" aria-label={label} aria-multiselectable="true" className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            role="option"
            aria-selected={value.length === 0}
            className="w-full justify-between font-normal"
            onClick={() => onChange([])}
          >
            <span className="truncate">{allLabel}</span>
            <Check className={value.length === 0 ? undefined : 'invisible'} data-icon="inline-end" />
          </Button>
          {options.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={selected.has(option)}
              className="w-full justify-between font-normal"
              onClick={() => toggle(option)}
            >
              <span className="truncate">{option}</span>
              <Check className={selected.has(option) ? undefined : 'invisible'} data-icon="inline-end" />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
