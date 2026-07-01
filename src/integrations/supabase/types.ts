export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      overlay_test_events: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          payload: Json;
          room_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          payload: Json;
          room_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: Json;
          room_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "overlay_test_events_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_cents: number;
          commission_cents: number;
          created_at: string;
          expires_at: string | null;
          id: string;
          net_cents: number;
          owner_id: string;
          paid_at: string | null;
          payer_email: string | null;
          payer_name: string;
          pix_copy_paste: string | null;
          pix_qr_code: string | null;
          pix_qr_code_base64: string | null;
          provider: string;
          provider_payment_id: string | null;
          queue_item_id: string | null;
          room_id: string;
          song_payload: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          commission_cents?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          net_cents: number;
          owner_id: string;
          paid_at?: string | null;
          payer_email?: string | null;
          payer_name: string;
          pix_copy_paste?: string | null;
          pix_qr_code?: string | null;
          pix_qr_code_base64?: string | null;
          provider?: string;
          provider_payment_id?: string | null;
          queue_item_id?: string | null;
          room_id: string;
          song_payload: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          commission_cents?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          net_cents?: number;
          owner_id?: string;
          paid_at?: string | null;
          payer_email?: string | null;
          payer_name?: string;
          pix_copy_paste?: string | null;
          pix_qr_code?: string | null;
          pix_qr_code_base64?: string | null;
          provider?: string;
          provider_payment_id?: string | null;
          queue_item_id?: string | null;
          room_id?: string;
          song_payload?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_queue_item_id_fkey";
            columns: ["queue_item_id"];
            isOneToOne: false;
            referencedRelation: "queue_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_settings: {
        Row: {
          allow_signups: boolean;
          commission_rate: number;
          id: number;
          maintenance_mode: boolean;
          max_boost_global_cents: number;
          min_boost_global_cents: number;
          min_withdrawal_cents: number;
          platform_name: string;
          support_email: string | null;
          updated_at: string;
        };
        Insert: {
          allow_signups?: boolean;
          commission_rate?: number;
          id?: number;
          maintenance_mode?: boolean;
          max_boost_global_cents?: number;
          min_boost_global_cents?: number;
          min_withdrawal_cents?: number;
          platform_name?: string;
          support_email?: string | null;
          updated_at?: string;
        };
        Update: {
          allow_signups?: boolean;
          commission_rate?: number;
          id?: number;
          maintenance_mode?: boolean;
          max_boost_global_cents?: number;
          min_boost_global_cents?: number;
          min_withdrawal_cents?: number;
          platform_name?: string;
          support_email?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      queue_items: {
        Row: {
          artist: string | null;
          created_at: string;
          duration_sec: number | null;
          id: string;
          is_top: boolean;
          manual_order: number | null;
          paid_amount_cents: number;
          payment_id: string | null;
          played_at: string | null;
          room_id: string;
          source: string;
          status: string;
          submitter_name: string;
          thumbnail_url: string | null;
          title: string;
          url: string;
        };
        Insert: {
          artist?: string | null;
          created_at?: string;
          duration_sec?: number | null;
          id?: string;
          is_top?: boolean;
          manual_order?: number | null;
          paid_amount_cents?: number;
          payment_id?: string | null;
          played_at?: string | null;
          room_id: string;
          source: string;
          status?: string;
          submitter_name: string;
          thumbnail_url?: string | null;
          title: string;
          url: string;
        };
        Update: {
          artist?: string | null;
          created_at?: string;
          duration_sec?: number | null;
          id?: string;
          is_top?: boolean;
          manual_order?: number | null;
          paid_amount_cents?: number;
          payment_id?: string | null;
          played_at?: string | null;
          room_id?: string;
          source?: string;
          status?: string;
          submitter_name?: string;
          thumbnail_url?: string | null;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "queue_items_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "queue_items_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          allow_soundcloud: boolean;
          allow_spotify: boolean;
          allow_upload: boolean;
          allow_youtube: boolean;
          cover_url: string | null;
          created_at: string;
          description: string | null;
          archived_at: string | null;
          id: string;
          is_open: boolean;
          max_boost_cents: number;
          max_duration_sec: number;
          min_boost_cents: number;
          name: string;
          owner_id: string;
          require_payment: boolean;
          slug: string;
          total_commission_cents: number;
          total_gross_cents: number;
          total_net_cents: number;
        };
        Insert: {
          allow_soundcloud?: boolean;
          allow_spotify?: boolean;
          allow_upload?: boolean;
          allow_youtube?: boolean;
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          archived_at?: string | null;
          id?: string;
          is_open?: boolean;
          max_boost_cents?: number;
          max_duration_sec?: number;
          min_boost_cents?: number;
          name: string;
          owner_id: string;
          require_payment?: boolean;
          slug: string;
          total_commission_cents?: number;
          total_gross_cents?: number;
          total_net_cents?: number;
        };
        Update: {
          allow_soundcloud?: boolean;
          allow_spotify?: boolean;
          allow_upload?: boolean;
          allow_youtube?: boolean;
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          archived_at?: string | null;
          id?: string;
          is_open?: boolean;
          max_boost_cents?: number;
          max_duration_sec?: number;
          min_boost_cents?: number;
          name?: string;
          owner_id?: string;
          require_payment?: boolean;
          slug?: string;
          total_commission_cents?: number;
          total_gross_cents?: number;
          total_net_cents?: number;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      withdrawals: {
        Row: {
          admin_notes: string | null;
          amount_cents: number;
          bank_account: string | null;
          bank_account_type: string | null;
          bank_agency: string | null;
          bank_holder_doc: string | null;
          bank_holder_name: string | null;
          bank_name: string | null;
          created_at: string;
          id: string;
          method: string;
          pix_key: string | null;
          pix_key_type: string | null;
          processed_at: string | null;
          processed_by: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          admin_notes?: string | null;
          amount_cents: number;
          bank_account?: string | null;
          bank_account_type?: string | null;
          bank_agency?: string | null;
          bank_holder_doc?: string | null;
          bank_holder_name?: string | null;
          bank_name?: string | null;
          created_at?: string;
          id?: string;
          method: string;
          pix_key?: string | null;
          pix_key_type?: string | null;
          processed_at?: string | null;
          processed_by?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          admin_notes?: string | null;
          amount_cents?: number;
          bank_account?: string | null;
          bank_account_type?: string | null;
          bank_agency?: string | null;
          bank_holder_doc?: string | null;
          bank_holder_name?: string | null;
          bank_name?: string | null;
          created_at?: string;
          id?: string;
          method?: string;
          pix_key?: string | null;
          pix_key_type?: string | null;
          processed_at?: string | null;
          processed_by?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      confirm_payment: { Args: { _payment_id: string }; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const;
