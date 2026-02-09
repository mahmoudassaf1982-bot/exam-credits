
-- Create payment_orders table to track PayPal transactions
CREATE TABLE public.payment_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('points_pack', 'diamond_plan')),
  paypal_order_id TEXT,
  pack_id TEXT,
  plan_id TEXT,
  points_amount INTEGER,
  price_usd NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view their own orders"
ON public.payment_orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own orders
CREATE POLICY "Users can insert their own orders"
ON public.payment_orders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Service role can update orders (for webhook/capture)
-- No policy needed for service role as it bypasses RLS

-- Create index for faster lookups
CREATE INDEX idx_payment_orders_user_id ON public.payment_orders (user_id);
CREATE INDEX idx_payment_orders_paypal_order_id ON public.payment_orders (paypal_order_id);
CREATE INDEX idx_payment_orders_status ON public.payment_orders (status);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_payment_orders_updated_at
BEFORE UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
