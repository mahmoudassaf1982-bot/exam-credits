
-- 1. transactions: only admins/service_role can INSERT
CREATE POLICY "Only admins can insert transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. wallets: only admins/service_role can INSERT/UPDATE
CREATE POLICY "Only admins can insert wallets"
ON public.wallets
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update wallets"
ON public.wallets
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. payment_orders: only admins/service_role can UPDATE
CREATE POLICY "Only admins can update payment orders"
ON public.payment_orders
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. exam_submissions: only admins/service_role can INSERT
CREATE POLICY "Only admins can insert submissions"
ON public.exam_submissions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. exam_sessions: admins can UPDATE all sessions (for completion via edge functions)
CREATE POLICY "Admins can update all sessions"
ON public.exam_sessions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
