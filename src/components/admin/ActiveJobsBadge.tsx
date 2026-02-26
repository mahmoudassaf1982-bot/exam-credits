import { Cog, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useActiveJobsCount } from '@/hooks/useAiJobsRealtime';

export default function ActiveJobsBadge() {
  const count = useActiveJobsCount();
  const navigate = useNavigate();

  if (count === 0) return null;

  return (
    <button
      onClick={() => navigate('/app/admin/jobs')}
      className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm transition-colors hover:bg-blue-500/10"
    >
      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      <span className="font-semibold text-blue-600">{count} مهمة نشطة</span>
      <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
        آمن للإغلاق
      </Badge>
    </button>
  );
}
