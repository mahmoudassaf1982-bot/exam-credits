import { PredictiveScoreCard } from '@/components/PredictiveScoreCard';

interface Props {
  examTemplateIds: string[];
}

/**
 * Shows PredictiveScoreCard for each exam template the student has trained on.
 */
export default function PredictedScoreOverview({ examTemplateIds }: Props) {
  if (examTemplateIds.length === 0) return null;

  return (
    <div className="space-y-3">
      {examTemplateIds.map(id => (
        <PredictiveScoreCard key={id} examTemplateId={id} />
      ))}
    </div>
  );
}
