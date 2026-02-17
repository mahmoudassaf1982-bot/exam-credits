

# Plan: AI Question Generation System for Admin Dashboard

## Overview
Add an AI-powered question generation feature to the admin dashboard. This involves creating a database table, an edge function for AI generation, and a new admin page with the UI.

## Important Note on API Key
You do NOT need to provide an OpenAI API key. This project has built-in Lovable AI access that includes powerful models (like `openai/gpt-5-mini`) which can handle question generation without any external API keys. This is more secure and simpler to maintain.

## Step 1: Create `questions` Database Table

Since questions currently exist only as mock data, we need a real database table:

```text
Table: questions
- id (uuid, primary key, default gen_random_uuid())
- country_id (text, not null)
- exam_template_id (text, nullable)
- section_id (text, nullable)
- topic (text, not null)
- difficulty (text, not null) -- 'easy' | 'medium' | 'hard'
- text_ar (text, not null)
- options (jsonb, not null) -- array of {id, textAr}
- correct_option_id (text, not null)
- explanation (text, nullable)
- is_approved (boolean, default false)
- created_at (timestamptz, default now())
- source (text, default 'manual') -- 'manual' | 'ai' | 'import'
```

RLS: Admin-only access using the existing `has_role` function.

## Step 2: Create `generate-questions` Edge Function

A new edge function at `supabase/functions/generate-questions/index.ts` that:
- Accepts two modes: `automatic` (full Kuwait exam) and `custom` (specific parameters)
- Uses Lovable AI (`openai/gpt-5-mini`) via the built-in `LOVABLE_API_KEY` -- no OpenAI key needed
- Constructs a detailed Arabic prompt for generating medical/aptitude exam questions
- Parses the AI JSON response
- Inserts generated questions into the `questions` table using the service role key
- Returns the generated questions to the UI

## Step 3: Create Admin AI Generator Page

New page at `src/pages/admin/AdminAIGenerator.tsx` with:

**Section A -- Automatic Generation:**
- A card with a button "Generate Full Exam Automatically" that triggers Kuwait University Aptitude Test generation
- Shows a loading spinner during generation
- Displays results count on success

**Section B -- Custom Generation:**
- A form with:
  - Subject dropdown (Mathematics, English, Arabic)
  - Topic text input
  - Difficulty dropdown (Easy, Medium, Hard)
  - Number of questions (number input, 1-50)
  - "Generate Custom Questions" button
- Form validation before submission
- Loading state during generation

**Results Section:**
- After generation, display the generated questions in a list
- Each question shows the text, options, correct answer, and explanation
- Button to navigate to the full question bank

## Step 4: Add Route and Navigation

- Add route `/app/admin/ai-generator` in `App.tsx`
- Add navigation item in `AdminLayout.tsx` sidebar with a sparkle/brain icon
- Add quick link in `AdminDashboard.tsx`

## Technical Details

### Edge Function Prompt Strategy
- For automatic mode: generates questions following Kuwait University Aptitude Test structure across Math, English, and Arabic sections
- For custom mode: generates questions based on the specified subject, topic, difficulty, and count
- The prompt instructs the AI to return a JSON array with `question_text`, `options`, `correct_answer_index`, and `explanation`
- The edge function maps `correct_answer_index` to option IDs before inserting

### Files to Create
1. `supabase/functions/generate-questions/index.ts` -- Edge function
2. `src/pages/admin/AdminAIGenerator.tsx` -- Admin page

### Files to Modify
1. `src/App.tsx` -- Add route
2. `src/components/admin/AdminLayout.tsx` -- Add nav item
3. `src/pages/admin/AdminDashboard.tsx` -- Add quick link and stats
4. Database migration -- Create `questions` table

