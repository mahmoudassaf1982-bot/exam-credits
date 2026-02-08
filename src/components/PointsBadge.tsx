import { Coins } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

export function PointsBadge({ compact = false }: { compact?: boolean }) {
  const { wallet, user } = useAuth();

  if (!wallet) return null;

  if (user?.isDiamond) {
    return (
      <Link
        to="/app/wallet"
        className="flex items-center gap-2 rounded-full gradient-diamond px-3 py-1.5 text-diamond-foreground text-sm font-bold shadow-diamond transition-transform hover:scale-105"
      >
        <span>💎</span>
        <span>{compact ? '' : 'Diamond'}</span>
      </Link>
    );
  }

  return (
    <Link
      to="/app/wallet"
      className="flex items-center gap-2 rounded-full gradient-gold px-3 py-1.5 text-gold-foreground text-sm font-bold shadow-gold transition-transform hover:scale-105"
    >
      <Coins className="h-4 w-4" />
      <span>{wallet.balance}</span>
      {!compact && <span>نقطة</span>}
    </Link>
  );
}
