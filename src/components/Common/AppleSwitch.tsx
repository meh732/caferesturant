import React from 'react';

interface AppleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}

/**
 * Apple iOS standard Toggle Switch with tactile spring-like transition
 * Uses dir="ltr" to maintain consistent physical slide direction across RTL/LTR contexts.
 */
export function AppleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  id,
}: AppleSwitchProps) {
  const isSm = size === 'sm';

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      dir="ltr"
      className={`relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/40 ${
        isSm ? 'h-5 w-9' : 'h-6 w-11'
      } ${
        checked ? 'bg-[#007AFF]' : 'bg-neutral-300 dark:bg-neutral-600'
      } ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block transform rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2),0_0_1px_rgba(0,0,0,0.1)] ring-0 transition duration-200 ease-in-out ${
          isSm
            ? checked
              ? 'h-4 w-4 translate-x-4'
              : 'h-4 w-4 translate-x-0'
            : checked
            ? 'h-5 w-5 translate-x-5'
            : 'h-5 w-5 translate-x-0'
        }`}
      />
    </button>
  );
}

interface AppleSegmentedControlProps<T extends string> {
  options: { value: T; label: string; icon?: React.ReactNode; badge?: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Apple macOS / iOS Cupertino Segmented Control with smooth pill design
 */
export function AppleSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: AppleSegmentedControlProps<T>) {
  const isSm = size === 'sm';

  return (
    <div
      className={`inline-flex items-center p-1 bg-black/[0.05] dark:bg-white/[0.08] rounded-xl border border-black/[0.04] dark:border-white/[0.06] select-none ${className}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex items-center justify-center gap-1.5 transition-all duration-150 rounded-lg cursor-pointer ${
              isSm ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'
            } ${
              isSelected
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] active:scale-[0.98]'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 font-medium'
            }`}
          >
            {option.icon && <span className="shrink-0">{option.icon}</span>}
            <span>{option.label}</span>
            {option.badge && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-[#007AFF] text-white">
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
