import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Layers,
  Lightbulb,
  ArrowLeft,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface QuestionData {
  id: string;
  text_ar: string;
  options: { id: string; textAr: string }[];
  correct_option_id: string;
  explanation?: string;
  difficulty: string;
  topic: string;
}

interface SectionSnapshot {
  id: string;
  name_ar: string;
  order: number;
  question_count: number;
  time_limit_sec: number | null;
}

interface ExamReviewProps {
  sections: SectionSnapshot[];
  questionsJson: Record<string, QuestionData[]>;
  answers: Record<string, string>;
  onBack: () => void;
}

export default function ExamReview({ sections, questionsJson, answers, onBack }: ExamReviewProps) {
  const [sectionIdx, setSectionIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);

  const currentSection = sections[sectionIdx];
  const sectionQuestions = currentSection ? (questionsJson[currentSection.id] || []) : [];
  const currentQuestion = sectionQuestions[questionIdx];

  const totalQuestions = sections.reduce((sum, s) => sum + (questionsJson[s.id]?.length || 0), 0);

  // Flat index for progress
  let flatIdx = 0;
  for (let i = 0; i < sectionIdx; i++) {
    flatIdx += questionsJson[sections[i].id]?.length || 0;
  }
  flatIdx += questionIdx;

  const optionLetters = ['أ', 'ب', 'ج', 'د'];

  const goNext = () => {
    if (questionIdx < sectionQuestions.length - 1) {
      setQuestionIdx(questionIdx + 1);
    } else if (sectionIdx < sections.length - 1) {
      setSectionIdx(sectionIdx + 1);
      setQuestionIdx(0);
    }
  };

  const goPrev = () => {
    if (questionIdx > 0) {
      setQuestionIdx(questionIdx - 1);
    } else if (sectionIdx > 0) {
      const prevSection = sections[sectionIdx - 1];
      const prevCount = questionsJson[prevSection.id]?.length || 0;
      setSectionIdx(sectionIdx - 1);
      setQuestionIdx(Math.max(0, prevCount - 1));
    }
  };

  const isFirst = sectionIdx === 0 && questionIdx === 0;
  const isLast = sectionIdx === sections.length - 1 && questionIdx === sectionQuestions.length - 1;

  if (!currentQuestion) {
    return (
      <div className="text-center p-12">
        <p className="text-muted-foreground">لا توجد أسئلة للمراجعة</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          <ArrowLeft className="ml-2 h-4 w-4" />
          العودة للنتائج
        </Button>
      </div>
    );
  }

  const userAnswer = answers[currentQuestion.id];
  const isCorrect = userAnswer === currentQuestion.correct_option_id;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="ml-1 h-4 w-4" />
          النتائج
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="h-4 w-4" />
          {currentSection.name_ar}
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>السؤال {flatIdx + 1} من {totalQuestions}</span>
          <span>{isCorrect ? '✓ صحيح' : '✗ خطأ'}</span>
        </div>
        <Progress value={((flatIdx + 1) / totalQuestions) * 100} className="h-1.5" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {/* Question */}
          <div className={`rounded-2xl border p-6 shadow-card ${isCorrect ? 'bg-success/5 border-success/30' : 'bg-destructive/5 border-destructive/30'}`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold flex-shrink-0 ${isCorrect ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                {flatIdx + 1}
              </div>
              <p className="text-lg font-semibold leading-relaxed">{currentQuestion.text_ar}</p>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            {currentQuestion.options.map((opt, idx) => {
              const isUserChoice = userAnswer === opt.id;
              const isCorrectOption = currentQuestion.correct_option_id === opt.id;

              let borderClass = 'border-border bg-card';
              let iconEl = null;

              if (isCorrectOption) {
                borderClass = 'border-success bg-success/5 ring-2 ring-success/20';
                iconEl = <CheckCircle2 className="h-5 w-5 text-success mr-auto flex-shrink-0" />;
              } else if (isUserChoice && !isCorrectOption) {
                borderClass = 'border-destructive bg-destructive/5 ring-2 ring-destructive/20';
                iconEl = <XCircle className="h-5 w-5 text-destructive mr-auto flex-shrink-0" />;
              }

              return (
                <div
                  key={opt.id}
                  className={`flex items-center gap-4 rounded-xl border p-4 ${borderClass}`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold flex-shrink-0 ${
                    isCorrectOption ? 'bg-success text-white' : isUserChoice ? 'bg-destructive text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {optionLetters[idx] || idx + 1}
                  </div>
                  <span className="font-medium">{opt.textAr}</span>
                  {iconEl}
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          {currentQuestion.explanation && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-2 text-primary">
                  <Lightbulb className="h-4 w-4" />
                  الشرح
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-sm leading-relaxed">
                  {currentQuestion.explanation}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 gap-3">
        <Button variant="outline" onClick={goPrev} disabled={isFirst}>
          <ChevronRight className="ml-1 h-4 w-4" />
          السابق
        </Button>

        <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] sm:max-w-md px-2">
          {sectionQuestions.map((q, idx) => {
            const answered = answers[q.id];
            const correct = answered === q.correct_option_id;
            return (
              <button
                key={q.id}
                onClick={() => setQuestionIdx(idx)}
                className={`h-2.5 w-2.5 rounded-full flex-shrink-0 transition-all ${
                  idx === questionIdx ? 'w-5' : ''
                } ${
                  idx === questionIdx
                    ? correct ? 'bg-success' : 'bg-destructive'
                    : answered
                    ? correct ? 'bg-success/40' : 'bg-destructive/40'
                    : 'bg-muted-foreground/20'
                }`}
              />
            );
          })}
        </div>

        <Button variant="outline" onClick={goNext} disabled={isLast}>
          التالي
          <ChevronLeft className="mr-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
