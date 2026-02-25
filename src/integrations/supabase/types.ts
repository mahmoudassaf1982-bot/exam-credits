export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      calibration_log: {
        Row: {
          accuracy: number
          attempts_count: number
          calibrated_at: string
          id: string
          new_difficulty: string
          old_difficulty: string
          question_id: string
        }
        Insert: {
          accuracy: number
          attempts_count: number
          calibrated_at?: string
          id?: string
          new_difficulty: string
          old_difficulty: string
          question_id: string
        }
        Update: {
          accuracy?: number
          attempts_count?: number
          calibrated_at?: string
          id?: string
          new_difficulty?: string
          old_difficulty?: string
          question_id?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          created_at: string
          currency: string
          flag: string
          id: string
          is_active: boolean
          name: string
          name_ar: string
        }
        Insert: {
          created_at?: string
          currency?: string
          flag?: string
          id: string
          is_active?: boolean
          name?: string
          name_ar: string
        }
        Update: {
          created_at?: string
          currency?: string
          flag?: string
          id?: string
          is_active?: boolean
          name?: string
          name_ar?: string
        }
        Relationships: []
      }
      diamond_plans: {
        Row: {
          country_id: string
          created_at: string
          currency: string
          duration_months: number
          id: string
          is_active: boolean
          name_ar: string
          price_usd: number
        }
        Insert: {
          country_id: string
          created_at?: string
          currency?: string
          duration_months?: number
          id: string
          is_active?: boolean
          name_ar: string
          price_usd: number
        }
        Update: {
          country_id?: string
          created_at?: string
          currency?: string
          duration_months?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          price_usd?: number
        }
        Relationships: []
      }
      exam_answer_keys: {
        Row: {
          answers_key_json: Json
          created_at: string
          id: string
          session_id: string
        }
        Insert: {
          answers_key_json?: Json
          created_at?: string
          id?: string
          session_id: string
        }
        Update: {
          answers_key_json?: Json
          created_at?: string
          id?: string
          session_id?: string
        }
        Relationships: []
      }
      exam_sections: {
        Row: {
          created_at: string
          difficulty_mix_json: Json | null
          exam_template_id: string
          id: string
          name_ar: string
          order: number
          question_count: number
          time_limit_sec: number | null
          topic_filter_json: Json | null
        }
        Insert: {
          created_at?: string
          difficulty_mix_json?: Json | null
          exam_template_id: string
          id?: string
          name_ar: string
          order?: number
          question_count?: number
          time_limit_sec?: number | null
          topic_filter_json?: Json | null
        }
        Update: {
          created_at?: string
          difficulty_mix_json?: Json | null
          exam_template_id?: string
          id?: string
          name_ar?: string
          order?: number
          question_count?: number
          time_limit_sec?: number | null
          topic_filter_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_sections_exam_template_id_fkey"
            columns: ["exam_template_id"]
            isOneToOne: false
            referencedRelation: "exam_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          answers_json: Json | null
          attempt_token_hash: string | null
          completed_at: string | null
          created_at: string
          exam_snapshot: Json | null
          exam_template_id: string
          expires_at: string | null
          id: string
          last_submit_id: string | null
          order_locked: boolean
          points_cost: number
          question_order: Json
          questions_json: Json | null
          review_questions_json: Json | null
          score_json: Json | null
          session_type: string
          started_at: string
          status: string
          submitted_at: string | null
          time_limit_sec: number
          user_id: string
        }
        Insert: {
          answers_json?: Json | null
          attempt_token_hash?: string | null
          completed_at?: string | null
          created_at?: string
          exam_snapshot?: Json | null
          exam_template_id: string
          expires_at?: string | null
          id?: string
          last_submit_id?: string | null
          order_locked?: boolean
          points_cost?: number
          question_order?: Json
          questions_json?: Json | null
          review_questions_json?: Json | null
          score_json?: Json | null
          session_type?: string
          started_at?: string
          status?: string
          submitted_at?: string | null
          time_limit_sec?: number
          user_id: string
        }
        Update: {
          answers_json?: Json | null
          attempt_token_hash?: string | null
          completed_at?: string | null
          created_at?: string
          exam_snapshot?: Json | null
          exam_template_id?: string
          expires_at?: string | null
          id?: string
          last_submit_id?: string | null
          order_locked?: boolean
          points_cost?: number
          question_order?: Json
          questions_json?: Json | null
          review_questions_json?: Json | null
          score_json?: Json | null
          session_type?: string
          started_at?: string
          status?: string
          submitted_at?: string | null
          time_limit_sec?: number
          user_id?: string
        }
        Relationships: []
      }
      exam_standards: {
        Row: {
          created_at: string
          difficulty_distribution: Json | null
          exam_template_id: string
          id: string
          question_count: number
          section_name: string
          source_id: string | null
          time_limit_minutes: number | null
          topics: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          difficulty_distribution?: Json | null
          exam_template_id: string
          id?: string
          question_count?: number
          section_name: string
          source_id?: string | null
          time_limit_minutes?: number | null
          topics?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          difficulty_distribution?: Json | null
          exam_template_id?: string
          id?: string
          question_count?: number
          section_name?: string
          source_id?: string | null
          time_limit_minutes?: number | null
          topics?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_standards_exam_template_id_fkey"
            columns: ["exam_template_id"]
            isOneToOne: false
            referencedRelation: "exam_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_standards_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "trusted_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_submissions: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          result_json: Json | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          result_json?: Json | null
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          result_json?: Json | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      exam_templates: {
        Row: {
          analysis_cost_points: number
          available_languages: Json
          country_id: string
          created_at: string
          default_question_count: number
          default_time_limit_sec: number
          description_ar: string
          health_alert_threshold_pct: number
          id: string
          is_active: boolean
          name_ar: string
          practice_cost_points: number
          simulation_cost_points: number
          slug: string
          target_easy_pct: number
          target_hard_pct: number
          target_medium_pct: number
        }
        Insert: {
          analysis_cost_points?: number
          available_languages?: Json
          country_id: string
          created_at?: string
          default_question_count?: number
          default_time_limit_sec?: number
          description_ar?: string
          health_alert_threshold_pct?: number
          id?: string
          is_active?: boolean
          name_ar: string
          practice_cost_points?: number
          simulation_cost_points?: number
          slug?: string
          target_easy_pct?: number
          target_hard_pct?: number
          target_medium_pct?: number
        }
        Update: {
          analysis_cost_points?: number
          available_languages?: Json
          country_id?: string
          created_at?: string
          default_question_count?: number
          default_time_limit_sec?: number
          description_ar?: string
          health_alert_threshold_pct?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          practice_cost_points?: number
          simulation_cost_points?: number
          slug?: string
          target_easy_pct?: number
          target_hard_pct?: number
          target_medium_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_templates_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          created_at: string
          id: string
          meta_json: Json | null
          order_type: string
          pack_id: string | null
          paypal_order_id: string | null
          plan_id: string | null
          points_amount: number | null
          price_usd: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta_json?: Json | null
          order_type: string
          pack_id?: string | null
          paypal_order_id?: string | null
          plan_id?: string | null
          points_amount?: number | null
          price_usd: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meta_json?: Json | null
          order_type?: string
          pack_id?: string | null
          paypal_order_id?: string | null
          plan_id?: string | null
          points_amount?: number | null
          price_usd?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      points_packs: {
        Row: {
          country_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          points: number
          popular: boolean
          price_usd: number
        }
        Insert: {
          country_id: string
          created_at?: string
          id: string
          is_active?: boolean
          label?: string
          points: number
          popular?: boolean
          price_usd: number
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          points?: number
          popular?: boolean
          price_usd?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country_id: string
          country_name: string
          created_at: string
          email: string
          id: string
          is_diamond: boolean
          name: string
          referral_code: string | null
        }
        Insert: {
          country_id?: string
          country_name?: string
          created_at?: string
          email?: string
          id: string
          is_diamond?: boolean
          name?: string
          referral_code?: string | null
        }
        Update: {
          country_id?: string
          country_name?: string
          created_at?: string
          email?: string
          id?: string
          is_diamond?: boolean
          name?: string
          referral_code?: string | null
        }
        Relationships: []
      }
      question_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          corrected_questions_json: Json | null
          count: number
          country_id: string
          created_at: string
          created_by: string
          difficulty: string
          draft_questions_json: Json
          exam_template_id: string | null
          generator_model: string
          id: string
          notes: string | null
          reviewer_model: string
          reviewer_report_json: Json | null
          section_id: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          corrected_questions_json?: Json | null
          count?: number
          country_id: string
          created_at?: string
          created_by: string
          difficulty?: string
          draft_questions_json?: Json
          exam_template_id?: string | null
          generator_model?: string
          id?: string
          notes?: string | null
          reviewer_model?: string
          reviewer_report_json?: Json | null
          section_id?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          corrected_questions_json?: Json | null
          count?: number
          country_id?: string
          created_at?: string
          created_by?: string
          difficulty?: string
          draft_questions_json?: Json
          exam_template_id?: string | null
          generator_model?: string
          id?: string
          notes?: string | null
          reviewer_model?: string
          reviewer_report_json?: Json | null
          section_id?: string | null
          status?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          accuracy: number
          attempts_count: number
          correct_count: number
          correct_option_id: string
          country_id: string
          created_at: string
          deleted_at: string | null
          difficulty: string
          difficulty_source: string
          draft_id: string | null
          exam_template_id: string | null
          explanation: string | null
          id: string
          is_approved: boolean
          language: string
          last_calibrated_at: string | null
          last_calibrated_attempts: number
          options: Json
          section_id: string | null
          source: string
          status: string
          text_ar: string
          topic: string
        }
        Insert: {
          accuracy?: number
          attempts_count?: number
          correct_count?: number
          correct_option_id: string
          country_id: string
          created_at?: string
          deleted_at?: string | null
          difficulty?: string
          difficulty_source?: string
          draft_id?: string | null
          exam_template_id?: string | null
          explanation?: string | null
          id?: string
          is_approved?: boolean
          language?: string
          last_calibrated_at?: string | null
          last_calibrated_attempts?: number
          options?: Json
          section_id?: string | null
          source?: string
          status?: string
          text_ar: string
          topic: string
        }
        Update: {
          accuracy?: number
          attempts_count?: number
          correct_count?: number
          correct_option_id?: string
          country_id?: string
          created_at?: string
          deleted_at?: string | null
          difficulty?: string
          difficulty_source?: string
          draft_id?: string | null
          exam_template_id?: string | null
          explanation?: string | null
          id?: string
          is_approved?: boolean
          language?: string
          last_calibrated_at?: string | null
          last_calibrated_attempts?: number
          options?: Json
          section_id?: string | null
          source?: string
          status?: string
          text_ar?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "question_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      score_predictions: {
        Row: {
          calculated_at: string
          confidence_level: string
          created_at: string
          exam_session_count: number
          exam_template_id: string
          id: string
          predicted_score: number
          section_breakdown: Json
          training_session_count: number
          user_id: string
        }
        Insert: {
          calculated_at?: string
          confidence_level?: string
          created_at?: string
          exam_session_count?: number
          exam_template_id: string
          id?: string
          predicted_score?: number
          section_breakdown?: Json
          training_session_count?: number
          user_id: string
        }
        Update: {
          calculated_at?: string
          confidence_level?: string
          created_at?: string
          exam_session_count?: number
          exam_template_id?: string
          id?: string
          predicted_score?: number
          section_breakdown?: Json
          training_session_count?: number
          user_id?: string
        }
        Relationships: []
      }
      skill_memory: {
        Row: {
          created_at: string
          exam_template_id: string
          id: string
          last_exam_date: string | null
          last_exam_score: number | null
          last_training_date: string | null
          last_training_score: number | null
          section_id: string
          section_name: string
          skill_score: number
          total_answered: number
          total_correct: number
          updated_at: string
          user_id: string
          weighted_correct: number
          weighted_total: number
        }
        Insert: {
          created_at?: string
          exam_template_id: string
          id?: string
          last_exam_date?: string | null
          last_exam_score?: number | null
          last_training_date?: string | null
          last_training_score?: number | null
          section_id: string
          section_name?: string
          skill_score?: number
          total_answered?: number
          total_correct?: number
          updated_at?: string
          user_id: string
          weighted_correct?: number
          weighted_total?: number
        }
        Update: {
          created_at?: string
          exam_template_id?: string
          id?: string
          last_exam_date?: string | null
          last_exam_score?: number | null
          last_training_date?: string | null
          last_training_score?: number | null
          section_id?: string
          section_name?: string
          skill_score?: number
          total_answered?: number
          total_correct?: number
          updated_at?: string
          user_id?: string
          weighted_correct?: number
          weighted_total?: number
        }
        Relationships: []
      }
      sync_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          exam_template_id: string
          id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          exam_template_id: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          exam_template_id?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_audit_log_exam_template_id_fkey"
            columns: ["exam_template_id"]
            isOneToOne: false
            referencedRelation: "exam_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          meta_json: Json | null
          reason: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          meta_json?: Json | null
          reason: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          meta_json?: Json | null
          reason?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      trusted_sources: {
        Row: {
          created_at: string
          description: string | null
          exam_template_id: string
          id: string
          last_synced_at: string | null
          source_name: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exam_template_id: string
          id?: string
          last_synced_at?: string | null
          source_name: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exam_template_id?: string
          id?: string
          last_synced_at?: string | null
          source_name?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trusted_sources_exam_template_id_fkey"
            columns: ["exam_template_id"]
            isOneToOne: false
            referencedRelation: "exam_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_soft_delete_questions: {
        Args: { question_ids: string[] }
        Returns: number
      }
      bulk_update_question_status: {
        Args: { new_status: string; question_ids: string[] }
        Returns: number
      }
      bulk_update_status_by_filter: {
        Args: {
          filter_country_id?: string
          filter_difficulty?: string
          filter_exam_template_id?: string
          filter_search?: string
          filter_section_id?: string
          filter_status?: string
          new_status: string
        }
        Returns: number
      }
      get_admin_notification_email: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
