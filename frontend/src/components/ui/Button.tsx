import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, icon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
          {
            'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500 shadow-sm': variant === 'primary',
            'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-400': variant === 'secondary',
            'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-500 shadow-sm': variant === 'danger',
            'bg-success-600 text-white hover:bg-success-700 focus-visible:ring-success-500 shadow-sm': variant === 'success',
            'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400': variant === 'ghost',
            'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-primary-500 shadow-sm': variant === 'outline',
          },
          {
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },
          className,
        )}
        {...props}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
