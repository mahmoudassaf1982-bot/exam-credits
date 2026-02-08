import { useState } from 'react';
import type { ExamSection, DifficultyMix } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronUp, ChevronDown, Trash2, GripVertical, Clock, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ExamSectionCardProps {
  section: ExamSection;
  index: number;
  totalSections: number;
  allTopics: string[];
  onUpdate: (updated: ExamSection) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function ExamSectionCard({
  section,
  index,
  totalSections,
  allTopics,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: ExamSectionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const topics = section.topicFilterJson ?? [];
  const mix = section.difficultyMixJson ?? { easy: 33, medium: 34, hard: 33 };

  const toggleTopic = (topic: string) => {
    const current = [...topics];
    const idx = current.indexOf(topic);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(topic);
    }
    onUpdate({ ...section, topicFilterJson: current.length > 0 ? current : null });
  };

  const updateMix = (key: keyof DifficultyMix, value: number) => {
    const newMix = { ...mix, [key]: value };
    onUpdate({ ...section, difficultyMixJson: newMix });
  };

  const formatTime = (sec: number | null) => {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    return `${m} دقيقة`;
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header - always visible */}
      <div
        className="flex items-center gap-2 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />

        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{section.nameAr}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <HelpCircle className="h-3 w-3" />
              {section.questionCount} سؤال
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(section.timeLimitSec)}
            </span>
          </div>
        </div>

        {/* Move buttons */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={index === 0}
            onClick={onMoveUp}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={index === totalSections - 1}
            onClick={onMoveDown}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t p-4 space-y-5">
          {/* Name */}
          <div className="space-y-2">
            <Label className="text-xs">اسم القسم</Label>
            <Input
              value={section.nameAr}
              onChange={(e) => onUpdate({ ...section, nameAr: e.target.value })}
            />
          </div>

          {/* Questions count + time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">عدد الأسئلة</Label>
              <Input
                type="number"
                value={section.questionCount}
                onChange={(e) => onUpdate({ ...section, questionCount: Number(e.target.value) })}
                min={1}
                dir="ltr"
                className="text-center"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">الزمن (بالثواني)</Label>
              <Input
                type="number"
                value={section.timeLimitSec ?? ''}
                onChange={(e) =>
                  onUpdate({
                    ...section,
                    timeLimitSec: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="اختياري"
                dir="ltr"
                className="text-center"
              />
            </div>
          </div>

          {/* Topics filter */}
          <div className="space-y-2">
            <Label className="text-xs">المواضيع / التصنيفات</Label>
            <div className="flex flex-wrap gap-2">
              {allTopics.map((topic) => {
                const isSelected = topics.includes(topic);
                return (
                  <Badge
                    key={topic}
                    variant={isSelected ? 'default' : 'outline'}
                    className={`cursor-pointer transition-all text-xs ${
                      isSelected
                        ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => toggleTopic(topic)}
                  >
                    {topic}
                  </Badge>
                );
              })}
              {allTopics.length === 0 && (
                <p className="text-xs text-muted-foreground">لا توجد مواضيع متاحة</p>
              )}
            </div>
          </div>

          {/* Difficulty mix */}
          <div className="space-y-2">
            <Label className="text-xs">توزيع الصعوبة (%)</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-success font-medium">سهل</p>
                <Input
                  type="number"
                  value={mix.easy}
                  onChange={(e) => updateMix('easy', Number(e.target.value))}
                  min={0}
                  max={100}
                  dir="ltr"
                  className="text-center"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gold font-medium">متوسط</p>
                <Input
                  type="number"
                  value={mix.medium}
                  onChange={(e) => updateMix('medium', Number(e.target.value))}
                  min={0}
                  max={100}
                  dir="ltr"
                  className="text-center"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-destructive font-medium">صعب</p>
                <Input
                  type="number"
                  value={mix.hard}
                  onChange={(e) => updateMix('hard', Number(e.target.value))}
                  min={0}
                  max={100}
                  dir="ltr"
                  className="text-center"
                />
              </div>
            </div>
            {mix.easy + mix.medium + mix.hard !== 100 && (
              <p className="text-xs text-destructive">
                ⚠ المجموع يجب أن يساوي 100% (الحالي: {mix.easy + mix.medium + mix.hard}%)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
