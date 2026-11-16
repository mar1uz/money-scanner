import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../../i18n.js';

/** Closed-by-default disclosure for pure help text. Never put data values inside. */
export const HelpDisclosure: React.FC<{ label?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ label, className, children }) => {
  const { language } = useLanguage();
  return (
    <details className={`ms-help ${className ?? ''}`}>
      <summary>
        {label ?? <span data-i18n-skip="">{language === 'ro' ? 'Cum citesc' : 'How to read'}</span>}
        <ChevronDown className="ms-help-chevron" size={14} aria-hidden="true" />
      </summary>
      <div className="ms-help-body">{children}</div>
    </details>
  );
};
