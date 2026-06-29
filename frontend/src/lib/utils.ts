import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = then.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(diffHours) < 1) return 'just now';
  if (Math.abs(diffHours) < 24) return `${Math.abs(diffHours)}h ${diffMs > 0 ? 'remaining' : 'ago'}`;
  return `${Math.abs(diffDays)}d ${diffMs > 0 ? 'remaining' : 'ago'}`;
}

export function truncateArn(arn: string) {
  const parts = arn.split(':');
  return parts.length > 6 ? `...${parts.slice(-1)[0]}` : arn;
}
