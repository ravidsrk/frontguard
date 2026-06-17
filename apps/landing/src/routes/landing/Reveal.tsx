import type { ElementType, ReactNode } from 'react';
import { useInView } from '../../hooks/useInView';

interface RevealProps {
  children: ReactNode;
  as?: ElementType;
  /** Extra classes applied to the wrapper (layout, ids, etc.). */
  className?: string;
  id?: string;
  'aria-labelledby'?: string;
}

/*
  Scroll-reveal wrapper (floor item 13). A below-the-fold section fades and lifts
  into view via IntersectionObserver. It degrades safely: `useInView` reveals
  immediately when reduced motion is requested or IntersectionObserver is absent
  (SSG/no-JS), and `motion-reduce` pins the visible state so content is never
  trapped behind an animation. The text is always in the DOM, so crawlers and the
  prerendered HTML see the full section regardless of reveal state.
*/
export function Reveal({ children, as: Tag = 'div', className = '', id, ...rest }: RevealProps) {
  const { ref, inView } = useInView();
  return (
    <Tag
      ref={ref}
      id={id}
      {...rest}
      className={[
        'transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 motion-reduce:opacity-100 motion-reduce:translate-y-0',
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
