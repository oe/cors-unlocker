import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      aria-hidden="true"
      className={cn('size-8 shrink-0 object-contain', className)}
      src="/icon/128.png"
    />
  );
}
