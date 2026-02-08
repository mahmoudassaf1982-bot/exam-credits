import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Referral from "./pages/Referral";
import Exams from "./pages/Exams";
import TopUp from "./pages/TopUp";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
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
            <Route
              path="/app"
              element={
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              }
            />
            <Route
              path="/app/exams"
              element={
                <AppLayout>
                  <Exams />
                </AppLayout>
              }
            />
            <Route
              path="/app/wallet"
              element={
                <AppLayout>
                  <Wallet />
                </AppLayout>
              }
            />
            <Route
              path="/app/referral"
              element={
                <AppLayout>
                  <Referral />
                </AppLayout>
              }
            />
            <Route
              path="/app/topup"
              element={
                <AppLayout>
                  <TopUp />
                </AppLayout>
              }
            />
            <Route
              path="/app/admin"
              element={
                <AppLayout>
                  <Admin />
                </AppLayout>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
