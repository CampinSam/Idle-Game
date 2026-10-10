import { useEffect } from 'react';
import { createPortal } from 'react-dom';

let scrollLockCount = 0;

interface FullscreenModalProps {
  children: React.ReactNode;
  onDismiss?: () => void;
  dismissOnBackdropClick?: boolean;
  className?: string;
}

export function FullscreenModal({
  children,
  onDismiss,
  dismissOnBackdropClick = true,
  className = 'flex items-center justify-center',
}: FullscreenModalProps) {
  useEffect(() => {
    scrollLockCount++;
    if (scrollLockCount === 1) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      scrollLockCount--;
      if (scrollLockCount === 0) {
        document.body.style.overflow = '';
      }
    };
  }, []);

  const handleBackdrop = () => {
    if (dismissOnBackdropClick && onDismiss) {
      onDismiss();
    }
  };

  return createPortal(
    <div className={`fixed inset-0 z-[110] ${className}`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleBackdrop} />
      {children}
    </div>,
    document.body,
  );
}
