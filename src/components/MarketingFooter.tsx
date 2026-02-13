import { Link } from 'react-router-dom';

export function MarketingFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-sm">
                S
              </div>
              <span className="font-extrabold text-foreground">SARIS EXAMS</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              منصة ذكية لمحاكاة اختبار القدرات الرسمي بدقة عالية باستخدام الذكاء الاصطناعي.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-bold text-foreground mb-3">روابط سريعة</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-foreground transition-colors">الرئيسية</Link></li>
              <li><Link to="/free-test" className="hover:text-foreground transition-colors">التجربة المجانية</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground transition-colors">الأسعار</Link></li>
              <li><Link to="/faq" className="hover:text-foreground transition-colors">الأسئلة الشائعة</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-bold text-foreground mb-3">قانوني</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">سياسة الخصوصية</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">الشروط والأحكام</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-foreground mb-3">تواصل معنا</h4>
            <p className="text-sm text-muted-foreground">support@sarisexams.com</p>
            <a
              href="https://platform.sarisexams.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-sm font-semibold text-primary hover:underline"
            >
              دخول المنصة ←
            </a>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} SARIS EXAMS. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
  );
}
