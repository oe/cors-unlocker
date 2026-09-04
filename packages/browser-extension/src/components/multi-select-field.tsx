import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const selected = new Set(value);
  const toggle = (option: string, checked: boolean) => {
    onChange(checked
      ? options.filter((item) => selected.has(item) || item === option)
      : value.filter((item) => item !== option));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={value.length === 0}
            onCheckedChange={() => onChange([])}
          >
            {allLabel}
          </DropdownMenuCheckboxItem>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={selected.has(option)}
              onCheckedChange={(checked) => toggle(option, checked)}
            >
              {option}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
