import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navLinks = [
  { label: 'الرئيسية', to: '/' },
  { label: 'التجربة المجانية', to: '/free-test' },
  { label: 'معاينة المنصة', to: '/platform-preview' },
  { label: 'الأسعار', to: '/pricing' },
  { label: 'الأسئلة الشائعة', to: '/faq' },
];

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container flex items-center justify-between py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-base">
            S
          </div>
          <span className="text-lg font-extrabold text-foreground tracking-tight">SARIS EXAMS</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                location.pathname === link.to
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <a href="https://platform.sarisexams.com" target="_blank" rel="noopener noreferrer">
            <Button className="font-bold">دخول المنصة</Button>
          </a>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label="القائمة">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t bg-background pb-4 px-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-semibold ${
                location.pathname === link.to
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <a href="https://platform.sarisexams.com" target="_blank" rel="noopener noreferrer" className="block pt-2">
            <Button className="w-full font-bold">دخول المنصة</Button>
          </a>
        </div>
      )}
    </nav>
  );
}
