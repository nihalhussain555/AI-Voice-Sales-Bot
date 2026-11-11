import { useEffect, useRef } from 'react';

// Shared by the search panel, the notification panel and the profile menu:
// three popovers, one dismissal rule (outside click + Escape).
export default function useDismiss({ open, onClose, returnFocus }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        if (returnFocus) ref.current?.querySelector('button, a, input')?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, returnFocus]);

  return ref;
}
