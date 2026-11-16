import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../../i18n.js';

const HIDE_MS = 320;

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onDismiss }) => {
  const { language } = useLanguage();
  // Keep the last message mounted while the closing transition runs.
  const [shown, setShown] = useState<string | null>(message);

  useEffect(() => {
    if (message !== null) {
      setShown(message);
      return;
    }
    const timer = window.setTimeout(() => setShown(null), HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (shown === null || typeof document === 'undefined') return null;
  const host = document.getElementById('ms-overlays') ?? document.body;
  return createPortal(
    <div role="status" aria-live="polite" className="ms-toast" data-state={message ? 'open' : 'closed'}>
      <span>{shown}</span>
      <button
        type="button"
        className="ms-icon-btn"
        style={{ width: 28, height: 28, minHeight: 28 }}
        onClick={onDismiss}
        aria-label={language === 'ro' ? 'Închide' : 'Close'}
      >
        <X size={14} />
      </button>
    </div>,
    host
  );
};
