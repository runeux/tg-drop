import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Option = {
  value: string;
  label: string;
  badge?: ReactNode;
};

export function SourcePicker({
  label,
  placeholder,
  value,
  options,
  change,
  disabled,
  className,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: Option[];
  change: (value: string) => void;
  disabled: boolean;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      items={options}
      value={selected?.value ?? null}
      disabled={disabled || !options.length}
      onValueChange={(next) => {
        if (next !== null) change(next);
      }}
    >
      <SelectTrigger
        className={cn('source-picker', className)}
        aria-label={label}
      >
        <SelectValue className="source-picker-value" placeholder={placeholder}>
          {selected?.badge ?? selected?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="source-picker-menu"
      >
        <SelectGroup>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              label={option.label}
            >
              {option.badge ?? <span className="truncate">{option.label}</span>}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
