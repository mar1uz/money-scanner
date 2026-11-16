import React, { useEffect, useRef } from 'react';
import { useSlidingPill } from '../../hooks/useSlidingPill.js';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
  badge?: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  full?: boolean;
  scrollable?: boolean;
  skipTranslate?: boolean;
  className?: string;
  onItemPointerEnter?: (value: T) => void;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  full = false,
  scrollable = false,
  skipTranslate = false,
  className,
  onItemPointerEnter,
}: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  useSlidingPill(ref, value);

  // Keep the active item visible when the control scrolls horizontally.
  useEffect(() => {
    if (!scrollable) return;
    const container = ref.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !active) return;
    container.scrollTo({
      left: active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [value, scrollable]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      className={`ms-segmented ${className ?? ''}`}
      data-size={size}
      data-full={full ? 'true' : undefined}
      data-scrollable={scrollable ? 'true' : undefined}
      data-i18n-skip={skipTranslate ? '' : undefined}
    >
      <span className="ms-segmented-pill" aria-hidden="true" />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className="ms-segmented-item"
            data-active={active}
            aria-pressed={active}
            title={option.title}
            onPointerEnter={() => onItemPointerEnter?.(option.value)}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
          >
            {option.label}
            {option.badge !== undefined && option.badge !== null && (
              <span className="ms-segmented-badge">{option.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
