
-- Add question_order and order_locked to exam_sessions
ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS question_order jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS order_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.exam_sessions.question_order IS 'Server-generated deterministic question order. Immutable once order_locked=true.';
COMMENT ON COLUMN public.exam_sessions.order_locked IS 'True once question order has been finalized server-side.';
