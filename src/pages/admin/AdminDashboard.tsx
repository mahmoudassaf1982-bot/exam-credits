import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Globe,
  BookOpen,
  HelpCircle,
  Coins,
  Crown,
  Settings,
  Users,
  TrendingUp,
} from 'lucide-react';
import { countries, mockPointsPacks, mockReferralEvents, mockDiamondPlans } from '@/data/mock';
import { mockExamTemplates, mockQuestions } from '@/data/examTemplates';

const stats = [
  {
    label: 'الدول المفعّلة',
    value: countries.filter((c) => c.isActive).length,
    total: countries.length,
    icon: Globe,
    color: 'text-info',
    bg: 'bg-info/10',
    href: '/app/admin/countries',
  },
  {
    label: 'الاختبارات',
    value: mockExamTemplates.filter((t) => t.isActive).length,
    total: mockExamTemplates.length,
    icon: BookOpen,
    color: 'text-primary',
    bg: 'bg-primary/10',
    href: '/app/admin/exams',
  },
  {
    label: 'الأسئلة',
    value: mockQuestions.filter((q) => q.isApproved).length,
    total: mockQuestions.length,
    icon: HelpCircle,
    color: 'text-success',
    bg: 'bg-success/10',
    href: '/app/admin/questions',
  },
  {
    label: 'حزم النقاط',
    value: mockPointsPacks.filter((p) => p.isActive).length,
    total: mockPointsPacks.length,
    icon: Coins,
    color: 'text-gold',
    bg: 'bg-gold/10',
    href: '/app/admin/points-packs',
  },
  {
    label: 'خطط Diamond',
    value: mockDiamondPlans.filter((p) => p.isActive).length,
    total: mockDiamondPlans.length,
    icon: Crown,
    color: 'text-diamond',
    bg: 'bg-diamond/10',
    href: '/app/admin/plans',
  },
  {
    label: 'الدعوات',
    value: mockReferralEvents.filter((e) => e.status === 'rewarded').length,
    total: mockReferralEvents.length,
    icon: Users,
    color: 'text-primary',
    bg: 'bg-primary/10',
    href: '/app/admin/settings',
  },
];

const quickLinks = [
  { label: 'إدارة الدول', icon: Globe, href: '/app/admin/countries', desc: 'إضافة وتعديل الدول والعملات' },
  { label: 'هيكل الاختبارات', icon: BookOpen, href: '/app/admin/exams', desc: 'إدارة الاختبارات والأقسام' },
  { label: 'بنك الأسئلة', icon: HelpCircle, href: '/app/admin/questions', desc: 'إضافة ومراجعة الأسئلة' },
  { label: 'حزم النقاط', icon: Coins, href: '/app/admin/points-packs', desc: 'تسعير حزم النقاط' },
  { label: 'خطط Diamond', icon: Crown, href: '/app/admin/plans', desc: 'إدارة خطط الاشتراك' },
  { label: 'الإعدادات', icon: Settings, href: '/app/admin/settings', desc: 'إعدادات المنصة العامة' },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">لوحة التحكم</h1>
        <p className="mt-1 text-muted-foreground">نظرة عامة على منصة Saris Exams</p>
      </motion.div>

      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Link
              to={stat.href}
              className="block rounded-2xl border bg-card p-4 shadow-card hover:shadow-card-hover transition-all group"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg} mb-3`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <p className="text-2xl font-black text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stat.label}
                {stat.total !== stat.value && (
                  <span className="text-muted-foreground/60"> / {stat.total}</span>
                )}
              </p>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Quick links */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          الوصول السريع
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-card hover:shadow-card-hover transition-all group"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary text-primary-foreground flex-shrink-0">
                <link.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                  {link.label}
                </h3>
                <p className="text-xs text-muted-foreground truncate">{link.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
