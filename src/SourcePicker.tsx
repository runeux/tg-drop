import { useId, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  ItemIndicator,
  RadioGroup,
  RadioItem,
} from '@radix-ui/react-dropdown-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

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
  className = '',
}: {
  label: string;
  placeholder: string;
  value: string;
  options: Option[];
  change: (value: string) => void;
  disabled: boolean;
  className?: string;
}) {
  const valueId = useId();
  const selected = options.find((option) => option.value === value);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        type="button"
        className={`source-picker ${className}`}
        aria-label={label}
        aria-describedby={valueId}
        disabled={disabled || !options.length}
      >
        <span className="source-picker-value" id={valueId}>
          {selected?.badge ?? selected?.label ?? placeholder}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        inline
        align="start"
        className="file-command-menu source-picker-menu"
      >
        <RadioGroup value={value} onValueChange={change}>
          {options.map((option) => (
            <RadioItem
              key={option.value}
              data-slot="dropdown-menu-item"
              className="source-picker-option"
              value={option.value}
              textValue={option.label}
            >
              <span className="source-picker-value">
                {option.badge ?? option.label}
              </span>
              <ItemIndicator asChild>
                <Check size={14} aria-hidden="true" />
              </ItemIndicator>
            </RadioItem>
          ))}
        </RadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
