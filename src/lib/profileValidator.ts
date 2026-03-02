/**
 * Deterministic Validator: validateQuestionsAgainstProfile
 * NO AI — pure rule-based validation against profile snapshot.
 */

export interface ValidationError {
  questionIndex: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  passedCount: number;
  failedCount: number;
}

export function validateQuestionsAgainstProfile(
  profileSnapshot: any,
  questions: any[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const rules = profileSnapshot?.generation_rules || {};
  const spec = profileSnapshot?.official_spec || {};
  const dna = profileSnapshot?.psychometric_dna || {};
  const sectionIds = new Set((spec.sections || []).map((s: any) => s.section_id));
  const languages = spec.languages || ['ar'];

  questions.forEach((q, i) => {
    // 1. Options count must be exactly 4
    const optCount = rules.options_count || 4;
    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length !== optCount) {
      errors.push({ questionIndex: i, field: 'options', message: `عدد الخيارات ${opts.length} بدلاً من ${optCount}` });
    }

    // 2. Exactly one correct answer
    if (!q.correct_option_id) {
      errors.push({ questionIndex: i, field: 'correct_option_id', message: 'لا يوجد معرف إجابة صحيحة' });
    } else if (opts.length > 0 && !opts.some((o: any) => o.id === q.correct_option_id)) {
      errors.push({ questionIndex: i, field: 'correct_option_id', message: 'معرف الإجابة الصحيحة غير موجود في الخيارات' });
    }

    // 3. No answer in stem (basic check)
    if (rules.no_answer_in_stem && q.text_ar && q.correct_option_id) {
      const correctOpt = opts.find((o: any) => o.id === q.correct_option_id);
      if (correctOpt?.textAr && q.text_ar.includes(correctOpt.textAr) && correctOpt.textAr.length > 5) {
        errors.push({ questionIndex: i, field: 'text_ar', message: 'الإجابة الصحيحة موجودة في نص السؤال' });
      }
    }

    // 4. Stem length check
    const maxChars = rules.stem_max_chars || 200;
    if (q.text_ar && q.text_ar.length > maxChars * 1.5) {
      errors.push({ questionIndex: i, field: 'text_ar', message: `نص السؤال طويل جداً (${q.text_ar.length} حرف، الحد ${maxChars})` });
    }

    // 5. Section assignment valid
    if (sectionIds.size > 0 && q.section_id && !sectionIds.has(q.section_id)) {
      errors.push({ questionIndex: i, field: 'section_id', message: 'القسم المحدد غير موجود في مواصفات الاختبار' });
    }

    // 6. Difficulty must be valid
    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) {
      errors.push({ questionIndex: i, field: 'difficulty', message: `مستوى صعوبة غير صالح: ${q.difficulty}` });
    }

    // 7. Time fit check
    const expectedTimes = dna.expected_time_per_question_seconds;
    if (expectedTimes && q.difficulty) {
      const expected = expectedTimes[q.difficulty];
      // This is informational - we can't truly measure time at generation
    }
  });

  const failedIndices = new Set(errors.map(e => e.questionIndex));
  return {
    valid: errors.length === 0,
    errors,
    passedCount: questions.length - failedIndices.size,
    failedCount: failedIndices.size,
  };
}
