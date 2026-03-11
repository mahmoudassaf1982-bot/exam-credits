import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SmartCoachProvider, SmartCoachFloating } from "@/components/SmartCoach";
import { Layout } from "@/components/Layout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Referral from "./pages/Referral";
import Exams from "./pages/Exams";
import ExamSession from "./pages/ExamSession";
import AdaptiveTrainingSession from "./pages/AdaptiveTrainingSession";
import ExamHistory from "./pages/ExamHistory";
import PerformanceProfile from "./pages/PerformanceProfile";
import TopUp from "./pages/TopUp";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCountries from "./pages/admin/AdminCountries";
import AdminExamsList from "./pages/admin/AdminExamsList";
import AdminExamDetail from "./pages/admin/AdminExamDetail";
import AdminQuestions from "./pages/admin/AdminQuestions";
import AdminPointsPacks from "./pages/admin/AdminPointsPacks";
import AdminPlans from "./pages/admin/AdminPlans";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminAIGenerator from "./pages/admin/AdminAIGenerator";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminStats from "./pages/admin/AdminStats";
import AdminContentManager from "./pages/admin/AdminContentManager";
import AdminAIReviewQueue from "./pages/admin/AdminAIReviewQueue";
import AdminBankHealth from "./pages/admin/AdminBankHealth";
import AdminJobs from "./pages/admin/AdminJobs";
import AdminExamProfiles from "./pages/admin/AdminExamProfiles";
import AdminDNABuilder from "./pages/admin/AdminDNABuilder";
import ChooseCountry from "./pages/ChooseCountry";
import Welcome from "./pages/Welcome";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}

function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <SmartCoachProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/login" element={<Auth />} />
            <Route path="/auth/register" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/choose-country" element={<ChooseCountry />} />
            <Route path="/welcome" element={<Welcome />} />

            {/* App routes - protected */}
            <Route path="/app" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
            <Route path="/app/exams" element={<ProtectedRoute><AppLayout><Exams /></AppLayout></ProtectedRoute>} />
            <Route path="/app/exam-session/:sessionId" element={<ProtectedRoute><ExamSession /></ProtectedRoute>} />
            <Route path="/app/adaptive-training/:sessionId" element={<ProtectedRoute><AdaptiveTrainingSession /></ProtectedRoute>} />
            <Route path="/app/history" element={<ProtectedRoute><AppLayout><ExamHistory /></AppLayout></ProtectedRoute>} />
            <Route path="/app/performance" element={<ProtectedRoute><AppLayout><PerformanceProfile /></AppLayout></ProtectedRoute>} />
            <Route path="/app/wallet" element={<ProtectedRoute><AppLayout><Wallet /></AppLayout></ProtectedRoute>} />
            <Route path="/app/referral" element={<ProtectedRoute><AppLayout><Referral /></AppLayout></ProtectedRoute>} />
            <Route path="/app/topup" element={<ProtectedRoute><AppLayout><TopUp /></AppLayout></ProtectedRoute>} />

            {/* Payment callback routes */}
            <Route path="/payment/success" element={<PaymentSuccess />} />
            <Route path="/payment/cancel" element={<PaymentCancel />} />

            {/* Admin routes - protected */}
            <Route path="/app/admin" element={<ProtectedRoute><AdminAppLayout><AdminDashboard /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/countries" element={<ProtectedRoute><AdminAppLayout><AdminCountries /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/exams" element={<ProtectedRoute><AdminAppLayout><AdminExamsList /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/exams/:id" element={<ProtectedRoute><AdminAppLayout><AdminExamDetail /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/questions" element={<ProtectedRoute><AdminAppLayout><AdminQuestions /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/points-packs" element={<ProtectedRoute><AdminAppLayout><AdminPointsPacks /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/plans" element={<ProtectedRoute><AdminAppLayout><AdminPlans /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/settings" element={<ProtectedRoute><AdminAppLayout><AdminSettings /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/ai-generator" element={<ProtectedRoute><AdminAppLayout><AdminAIGenerator /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/users" element={<ProtectedRoute><AdminAppLayout><AdminUsers /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/stats" element={<ProtectedRoute><AdminAppLayout><AdminStats /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/content" element={<ProtectedRoute><AdminAppLayout><AdminContentManager /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/review-queue" element={<ProtectedRoute><AdminAppLayout><AdminAIReviewQueue /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/bank-health" element={<ProtectedRoute><AdminAppLayout><AdminBankHealth /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/jobs" element={<ProtectedRoute><AdminAppLayout><AdminJobs /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/exam-profiles" element={<ProtectedRoute><AdminAppLayout><AdminExamProfiles /></AdminAppLayout></ProtectedRoute>} />
            <Route path="/app/admin/dna-builder" element={<ProtectedRoute><AdminAppLayout><AdminDNABuilder /></AdminAppLayout></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
