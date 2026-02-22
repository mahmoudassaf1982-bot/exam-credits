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
          completed_at: string | null
          created_at: string
          exam_snapshot: Json | null
          exam_template_id: string
          id: string
          points_cost: number
          questions_json: Json | null
          review_questions_json: Json | null
          score_json: Json | null
          session_type: string
          started_at: string
          status: string
          time_limit_sec: number
          user_id: string
        }
        Insert: {
          answers_json?: Json | null
          completed_at?: string | null
          created_at?: string
          exam_snapshot?: Json | null
          exam_template_id: string
          id?: string
          points_cost?: number
          questions_json?: Json | null
          review_questions_json?: Json | null
          score_json?: Json | null
          session_type?: string
          started_at?: string
          status?: string
          time_limit_sec?: number
          user_id: string
        }
        Update: {
          answers_json?: Json | null
          completed_at?: string | null
          created_at?: string
          exam_snapshot?: Json | null
          exam_template_id?: string
          id?: string
          points_cost?: number
          questions_json?: Json | null
          review_questions_json?: Json | null
          score_json?: Json | null
          session_type?: string
          started_at?: string
          status?: string
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
      exam_templates: {
        Row: {
          analysis_cost_points: number
          country_id: string
          created_at: string
          default_question_count: number
          default_time_limit_sec: number
          description_ar: string
          id: string
          is_active: boolean
          name_ar: string
          practice_cost_points: number
          simulation_cost_points: number
          slug: string
        }
        Insert: {
          analysis_cost_points?: number
          country_id: string
          created_at?: string
          default_question_count?: number
          default_time_limit_sec?: number
          description_ar?: string
          id?: string
          is_active?: boolean
          name_ar: string
          practice_cost_points?: number
          simulation_cost_points?: number
          slug?: string
        }
        Update: {
          analysis_cost_points?: number
          country_id?: string
          created_at?: string
          default_question_count?: number
          default_time_limit_sec?: number
          description_ar?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          practice_cost_points?: number
          simulation_cost_points?: number
          slug?: string
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
      questions: {
        Row: {
          correct_option_id: string
          country_id: string
          created_at: string
          difficulty: string
          exam_template_id: string | null
          explanation: string | null
          id: string
          is_approved: boolean
          options: Json
          section_id: string | null
          source: string
          text_ar: string
          topic: string
        }
        Insert: {
          correct_option_id: string
          country_id: string
          created_at?: string
          difficulty?: string
          exam_template_id?: string | null
          explanation?: string | null
          id?: string
          is_approved?: boolean
          options?: Json
          section_id?: string | null
          source?: string
          text_ar: string
          topic: string
        }
        Update: {
          correct_option_id?: string
          country_id?: string
          created_at?: string
          difficulty?: string
          exam_template_id?: string | null
          explanation?: string | null
          id?: string
          is_approved?: boolean
          options?: Json
          section_id?: string | null
          source?: string
          text_ar?: string
          topic?: string
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
