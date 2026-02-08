import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'gold' | 'diamond' | 'success' | 'info';
  children?: ReactNode;
}

const variantStyles = {
  default: {
    card: 'bg-card shadow-card',
    iconBg: 'bg-muted',
    iconColor: 'text-foreground',
  },
  gold: {
    card: 'bg-card shadow-card border-gold/20',
    iconBg: 'gradient-gold',
    iconColor: 'text-gold-foreground',
  },
  diamond: {
    card: 'bg-card shadow-card border-diamond/20',
    iconBg: 'gradient-diamond',
    iconColor: 'text-diamond-foreground',
  },
  success: {
    card: 'bg-card shadow-card border-success/20',
    iconBg: 'bg-success',
    iconColor: 'text-success-foreground',
  },
  info: {
    card: 'bg-card shadow-card border-info/20',
    iconBg: 'bg-info',
    iconColor: 'text-info-foreground',
  },
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
  children,
}: StatsCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        'rounded-2xl border p-5 transition-all duration-300 hover:shadow-card-hover animate-fade-in',
        styles.card
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-black text-foreground tracking-tight">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-2xl',
            styles.iconBg,
            styles.iconColor
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {children}
    </div>
  );
}
