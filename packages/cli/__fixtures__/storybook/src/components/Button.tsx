import { type CSSProperties, type ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
}

const baseStyle: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'transform 80ms ease',
};

const variantStyles: Record<NonNullable<ButtonProps['variant']>, CSSProperties> = {
  primary: { background: '#0b5fff', color: '#fff' },
  secondary: { background: '#f4f4f5', color: '#111', border: '1px solid #d4d4d8' },
  danger: { background: '#e11d48', color: '#fff' },
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 13 },
  md: { padding: '10px 18px', fontSize: 14 },
  lg: { padding: '14px 24px', fontSize: 16 },
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        ...sizeStyles[size],
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
