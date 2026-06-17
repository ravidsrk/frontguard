import type { ReactNode, ElementType } from 'react';

export type ContainerWidth = 'wide' | 'matrix' | 'brand' | 'faq' | 'changelog' | 'docs';

/** Max-width wrappers from the extract (28px gutter). */
const CONTAINER_MAX: Record<ContainerWidth, string> = {
  wide: 'max-w-[1200px]',
  matrix: 'max-w-[1100px]',
  brand: 'max-w-[1080px]',
  faq: 'max-w-[900px]',
  changelog: 'max-w-[860px]',
  docs: 'max-w-[1400px]',
};

interface ContainerProps {
  children: ReactNode;
  width?: ContainerWidth;
  as?: ElementType;
  className?: string;
}

/** Centered content wrapper with the standard 28px horizontal gutter. */
export function Container({ children, width = 'wide', as: Tag = 'div', className = '' }: ContainerProps) {
  return (
    <Tag className={['mx-auto w-full px-7', CONTAINER_MAX[width], className].join(' ')}>{children}</Tag>
  );
}

export default Container;
