import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        hover && 'cursor-pointer transition-all duration-200 hover:shadow-md hover:border-slate-300',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 py-4 border-b border-slate-100', className)}>{children}</div>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl', className)}>{children}</div>;
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  trend?: string;
  color?: 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'slate';
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  red: 'bg-red-50 text-red-600 border-red-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
  slate: 'bg-slate-50 text-slate-600 border-slate-100',
};

export function StatCard({ title, value, icon, trend, color = 'blue' }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
            {trend && <p className="mt-1 text-xs text-slate-500">{trend}</p>}
          </div>
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl border', colorMap[color])}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
