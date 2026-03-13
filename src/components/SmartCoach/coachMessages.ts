/**
 * Bilingual contextual messages for SARIS Coach.
 * Arabic primary + English subtitle.
 */

export interface CoachMessage {
  ar: string;
  en: string;
}

// ── Training session messages ──

export const trainingStartMessages: CoachMessage[] = [
  { ar: 'هيا نبدأ جلسة التدريب! 💪', en: "Let's begin your training session!" },
  { ar: 'مستعد؟ لنبدأ التدريب الذكي!', en: "Ready? Let's start smart training!" },
  { ar: 'أنا هنا معك طوال الجلسة 🎯', en: "I'm here with you throughout the session." },
];

export const improvementMessages: CoachMessage[] = [
  { ar: 'أداء رائع! دقتك في تحسن مستمر 📈', en: 'Great progress! Your accuracy is improving.' },
  { ar: 'ممتاز! أنت تتقدم بثبات 🌟', en: 'Excellent! You are progressing steadily.' },
  { ar: 'عمل رائع! استمر على هذا المستوى 💪', en: 'Amazing work! Keep up this level!' },
];

export const levelUpMessages: CoachMessage[] = [
  { ar: 'أتقنت هذا المستوى! لننتقل للتحدي التالي 🚀', en: 'You have mastered this level. Let\'s move to the next challenge.' },
  { ar: 'أنت جاهز لمستوى أعلى من الصعوبة! 🎯', en: 'You are ready for a higher difficulty level.' },
  { ar: 'مبروك! انتقلت للمرحلة التالية بنجاح ⬆️', en: 'Congratulations! You have advanced to the next stage.' },
];

export const levelDownMessages: CoachMessage[] = [
  { ar: 'لا بأس! لنراجع الأساسيات مرة أخرى 📖', en: "No worries! Let's review the basics again." },
  { ar: 'لنعود خطوة للخلف ونعزز فهمك 💡', en: "Let's step back and strengthen your understanding." },
];

export const encouragementMessages: CoachMessage[] = [
  { ar: 'لا تستسلم! كل خطأ هو فرصة للتعلم 💪', en: "Don't give up! Every mistake is a learning opportunity." },
  { ar: 'استمر! أنت قريب من الإتقان 🎯', en: "Keep going! You're close to mastery." },
  { ar: 'ركز وخذ وقتك في التفكير 🧠', en: 'Focus and take your time thinking.' },
];

export const sessionCompleteMessages: CoachMessage[] = [
  { ar: 'أنهيت الجلسة! لنراجع أداءك 📊', en: "Session complete! Let's review your performance." },
  { ar: 'عمل رائع! النتائج جاهزة للمراجعة 🏆', en: 'Great work! Results are ready for review.' },
];

export const idleGreetings: CoachMessage[] = [
  { ar: 'مرحباً! كيف يمكنني مساعدتك اليوم؟', en: 'Hello! How can I help you today?' },
  { ar: 'أنا SARIS، مدربك الذكي 👋', en: "I'm SARIS, your smart coach." },
  { ar: 'جاهز لمساعدتك في التدريب! 📚', en: 'Ready to help you with training!' },
];

export const pointingMessages: CoachMessage[] = [
  { ar: 'ألق نظرة على أدائك هنا 👈', en: 'Take a look at your performance here.' },
  { ar: 'هذا القسم يحتاج انتباهك 📌', en: 'This section needs your attention.' },
];

// ── Utility to pick random message ──

export function pickRandom(messages: CoachMessage[]): CoachMessage {
  return messages[Math.floor(Math.random() * messages.length)];
}
