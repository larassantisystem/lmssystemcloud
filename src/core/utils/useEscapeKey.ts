import { useEffect } from 'react';

/**
 * Hook to handle Escape key press for closing active modals or overlays
 * @param onClose Callback function to invoke when Escape is pressed
 * @param isActive Whether the listener is active (defaults to true)
 */
export const useEscapeKey = (onClose: () => void, isActive: boolean = true): void => {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, isActive]);
};
