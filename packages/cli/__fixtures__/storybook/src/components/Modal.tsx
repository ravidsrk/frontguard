import { useState, type CSSProperties, type ReactNode } from 'react';

export interface ModalProps {
  /** Initial open state — useful for stories that want the modal showing on mount. */
  defaultOpen?: boolean;
  /** Modal title rendered in the header. */
  title?: string;
  /** Modal body content. */
  children?: ReactNode;
  /** Label for the opening trigger button. */
  triggerLabel?: string;
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

const dialog: CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 24,
  width: 360,
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

/**
 * Minimal accessible modal used as a play()-aware Storybook fixture.
 *
 * When `defaultOpen` is false, the modal renders only its trigger button;
 * the story's `play()` function clicks the trigger to assert that
 * Frontguard's renderer waits for `play()` before capturing.
 */
export function Modal({
  defaultOpen = false,
  title = 'Confirm action',
  children = 'Are you sure you want to continue?',
  triggerLabel = 'Open modal',
}: ModalProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <button
        type="button"
        data-testid="modal-trigger"
        onClick={() => setOpen(true)}
        style={{
          padding: '10px 18px',
          borderRadius: 8,
          background: '#0b5fff',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          fontWeight: 600,
        }}
      >
        {triggerLabel}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" data-testid="modal-overlay" style={overlay}>
          <div style={dialog}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
            <p style={{ color: '#475569' }}>{children}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="modal-confirm"
                onClick={() => setOpen(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  background: '#0b5fff',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
