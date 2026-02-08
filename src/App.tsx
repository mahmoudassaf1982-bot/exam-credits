import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Referral from "./pages/Referral";
import Exams from "./pages/Exams";
import TopUp from "./pages/TopUp";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCountries from "./pages/admin/AdminCountries";
import AdminExamsList from "./pages/admin/AdminExamsList";
import AdminExamDetail from "./pages/admin/AdminExamDetail";
import AdminQuestions from "./pages/admin/AdminQuestions";
import AdminPointsPacks from "./pages/admin/AdminPointsPacks";
import AdminPlans from "./pages/admin/AdminPlans";
import AdminSettings from "./pages/admin/AdminSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}

function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/register" element={<Auth />} />

            {/* App routes */}
            <Route path="/app" element={<AppLayout><Dashboard /></AppLayout>} />
            <Route path="/app/exams" element={<AppLayout><Exams /></AppLayout>} />
            <Route path="/app/wallet" element={<AppLayout><Wallet /></AppLayout>} />
            <Route path="/app/referral" element={<AppLayout><Referral /></AppLayout>} />
            <Route path="/app/topup" element={<AppLayout><TopUp /></AppLayout>} />

            {/* Admin routes */}
            <Route path="/app/admin" element={<AdminAppLayout><AdminDashboard /></AdminAppLayout>} />
            <Route path="/app/admin/countries" element={<AdminAppLayout><AdminCountries /></AdminAppLayout>} />
            <Route path="/app/admin/exams" element={<AdminAppLayout><AdminExamsList /></AdminAppLayout>} />
            <Route path="/app/admin/exams/:id" element={<AdminAppLayout><AdminExamDetail /></AdminAppLayout>} />
            <Route path="/app/admin/questions" element={<AdminAppLayout><AdminQuestions /></AdminAppLayout>} />
            <Route path="/app/admin/points-packs" element={<AdminAppLayout><AdminPointsPacks /></AdminAppLayout>} />
            <Route path="/app/admin/plans" element={<AdminAppLayout><AdminPlans /></AdminAppLayout>} />
            <Route path="/app/admin/settings" element={<AdminAppLayout><AdminSettings /></AdminAppLayout>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
