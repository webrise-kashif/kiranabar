import { useEffect } from "react";

const AUTO_DISMISS_MS = 4000;

/** A transient success popup, fixed to the top-right of the viewport. Auto-dismisses, or the user can close it early. */
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role="status"
      className="fixed right-4 top-4 z-50 flex items-start gap-3 rounded-lg border border-green-200 bg-white px-4 py-3 shadow-lg"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
      <p className="text-sm font-medium text-gray-900">{message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="-mr-1 -mt-0.5 text-gray-400 hover:text-gray-600"
      >
        &times;
      </button>
    </div>
  );
}
