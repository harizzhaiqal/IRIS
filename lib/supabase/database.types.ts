export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Every `id` in the public schema is an integer identity column, so ids are
 * numbers here. The single exception is `users.auth_user_id`: it points at
 * `auth.users`, which Supabase Auth owns and keys by uuid, so that one column
 * stays a string.
 *
 * Identity columns are `generated always`, which the database refuses to accept
 * a written value for. Those are typed `never` on Insert and Update so a
 * client-supplied key does not compile.
 */
export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number;
          monthly_standard_hours: number;
          yearly_standard_hours: number;
          yearly_threshold_hours: number;
          submission_deadline_day: number;
          reminder_enabled: boolean;
          updated_by: number | null;
          modified_time: string;
        };
        Insert: {
          // Not an identity column: the row is a singleton pinned to id 1.
          id?: number;
          monthly_standard_hours?: number;
          yearly_standard_hours?: number;
          yearly_threshold_hours?: number;
          submission_deadline_day?: number;
          reminder_enabled?: boolean;
          updated_by?: number | null;
          modified_time?: string;
        };
        Update: {
          id?: number;
          monthly_standard_hours?: number;
          yearly_standard_hours?: number;
          yearly_threshold_hours?: number;
          submission_deadline_day?: number;
          reminder_enabled?: boolean;
          updated_by?: number | null;
          modified_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_logs: {
        Row: {
          id: number;
          action_type: string;
          description: string | null;
          related_table: string | null;
          related_id: number | null;
          performed_by: number | null;
          is_system: boolean;
          created_time: string;
        };
        Insert: {
          id?: never;
          action_type: string;
          description?: string | null;
          related_table?: string | null;
          related_id?: number | null;
          performed_by?: number | null;
          is_system?: boolean;
          created_time?: string;
        };
        Update: {
          id?: never;
          action_type?: string;
          description?: string | null;
          related_table?: string | null;
          related_id?: number | null;
          performed_by?: number | null;
          is_system?: boolean;
          created_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_logs_performed_by_fkey";
            columns: ["performed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_media_assets: {
        Row: {
          id: number;
          uploader_id: number;
          title: string;
          category: string;
          description: string | null;
          ai_tags: string[];
          file_name: string;
          storage_path: string;
          mime_type: string;
          file_size_bytes: number;
          created_time: string;
        };
        Insert: {
          id?: never;
          uploader_id: number;
          title: string;
          category: string;
          description?: string | null;
          ai_tags?: string[];
          file_name: string;
          storage_path: string;
          mime_type: string;
          file_size_bytes: number;
          created_time?: string;
        };
        Update: {
          id?: never;
          uploader_id?: number;
          title?: string;
          category?: string;
          description?: string | null;
          ai_tags?: string[];
          file_name?: string;
          storage_path?: string;
          mime_type?: string;
          file_size_bytes?: number;
          created_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_media_assets_uploader_id_fkey";
            columns: ["uploader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          id: number;
          name: string;
          hod_id: number | null;
          created_time: string;
        };
        Insert: {
          id?: never;
          name: string;
          hod_id?: number | null;
          created_time?: string;
        };
        Update: {
          id?: never;
          name?: string;
          hod_id?: number | null;
          created_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_hod_id_fkey";
            columns: ["hod_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: number;
          auth_user_id: string;
          full_name: string;
          email: string;
          designation: string | null;
          date_joined: string | null;
          role: Database["public"]["Enums"]["user_role"];
          department_id: number | null;
          hod_id: number | null;
          is_active: boolean;
          created_time: string;
        };
        Insert: {
          id?: never;
          auth_user_id: string;
          full_name: string;
          email: string;
          designation?: string | null;
          date_joined?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          department_id?: number | null;
          hod_id?: number | null;
          is_active?: boolean;
          created_time?: string;
        };
        Update: {
          id?: never;
          auth_user_id?: string;
          full_name?: string;
          email?: string;
          designation?: string | null;
          date_joined?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          department_id?: number | null;
          hod_id?: number | null;
          is_active?: boolean;
          created_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_auth_user_id_fkey";
            columns: ["auth_user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_hod_id_fkey";
            columns: ["hod_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_schedules: {
        Row: {
          id: number;
          name: string;
          is_enabled: boolean;
          day_of_month: number;
          send_time: string;
          timezone: string;
          audience: Database["public"]["Enums"]["reminder_audience"];
          target_roles: Database["public"]["Enums"]["user_role"][];
          subject: string;
          body: string;
          action_label: string | null;
          action_url: string | null;
          reply_to: string | null;
          created_by: number | null;
          updated_by: number | null;
          created_time: string;
          modified_time: string;
        };
        Insert: {
          id?: never;
          name: string;
          is_enabled?: boolean;
          day_of_month?: number;
          send_time?: string;
          timezone?: string;
          audience?: Database["public"]["Enums"]["reminder_audience"];
          target_roles?: Database["public"]["Enums"]["user_role"][];
          subject: string;
          body: string;
          action_label?: string | null;
          action_url?: string | null;
          reply_to?: string | null;
          created_by?: number | null;
          updated_by?: number | null;
          created_time?: string;
          modified_time?: string;
        };
        Update: {
          id?: never;
          name?: string;
          is_enabled?: boolean;
          day_of_month?: number;
          send_time?: string;
          timezone?: string;
          audience?: Database["public"]["Enums"]["reminder_audience"];
          target_roles?: Database["public"]["Enums"]["user_role"][];
          subject?: string;
          body?: string;
          action_label?: string | null;
          action_url?: string | null;
          reply_to?: string | null;
          created_by?: number | null;
          updated_by?: number | null;
          created_time?: string;
          modified_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_schedules_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminder_schedules_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_runs: {
        Row: {
          id: number;
          schedule_id: number;
          period_start: string;
          scheduled_for: string;
          status: Database["public"]["Enums"]["reminder_run_status"];
          audience_snapshot: Database["public"]["Enums"]["reminder_audience"];
          target_roles_snapshot: Database["public"]["Enums"]["user_role"][];
          subject_snapshot: string;
          body_snapshot: string;
          action_label_snapshot: string | null;
          action_url_snapshot: string | null;
          reply_to_snapshot: string | null;
          recipient_count: number;
          accepted_count: number;
          failed_count: number;
          attempt_count: number;
          lease_expires_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          last_error: string | null;
          created_time: string;
        };
        Insert: {
          id?: never;
          schedule_id: number;
          period_start: string;
          scheduled_for: string;
          status?: Database["public"]["Enums"]["reminder_run_status"];
          audience_snapshot: Database["public"]["Enums"]["reminder_audience"];
          target_roles_snapshot: Database["public"]["Enums"]["user_role"][];
          subject_snapshot: string;
          body_snapshot: string;
          action_label_snapshot?: string | null;
          action_url_snapshot?: string | null;
          reply_to_snapshot?: string | null;
          recipient_count?: number;
          accepted_count?: number;
          failed_count?: number;
          attempt_count?: number;
          lease_expires_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          last_error?: string | null;
          created_time?: string;
        };
        Update: {
          id?: never;
          schedule_id?: number;
          period_start?: string;
          scheduled_for?: string;
          status?: Database["public"]["Enums"]["reminder_run_status"];
          audience_snapshot?: Database["public"]["Enums"]["reminder_audience"];
          target_roles_snapshot?: Database["public"]["Enums"]["user_role"][];
          subject_snapshot?: string;
          body_snapshot?: string;
          action_label_snapshot?: string | null;
          action_url_snapshot?: string | null;
          reply_to_snapshot?: string | null;
          recipient_count?: number;
          accepted_count?: number;
          failed_count?: number;
          attempt_count?: number;
          lease_expires_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          last_error?: string | null;
          created_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_runs_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "reminder_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_deliveries: {
        Row: {
          id: number;
          run_id: number;
          recipient_profile_id: number | null;
          recipient_name: string;
          recipient_email: string;
          status: Database["public"]["Enums"]["reminder_delivery_status"];
          idempotency_key: string;
          provider_message_id: string | null;
          attempt_count: number;
          last_attempt_at: string | null;
          accepted_at: string | null;
          delivered_at: string | null;
          last_error: string | null;
          created_time: string;
          modified_time: string;
        };
        Insert: {
          id?: never;
          run_id: number;
          recipient_profile_id?: number | null;
          recipient_name: string;
          recipient_email: string;
          status?: Database["public"]["Enums"]["reminder_delivery_status"];
          idempotency_key: string;
          provider_message_id?: string | null;
          attempt_count?: number;
          last_attempt_at?: string | null;
          accepted_at?: string | null;
          delivered_at?: string | null;
          last_error?: string | null;
          created_time?: string;
          modified_time?: string;
        };
        Update: {
          id?: never;
          run_id?: number;
          recipient_profile_id?: number | null;
          recipient_name?: string;
          recipient_email?: string;
          status?: Database["public"]["Enums"]["reminder_delivery_status"];
          idempotency_key?: string;
          provider_message_id?: string | null;
          attempt_count?: number;
          last_attempt_at?: string | null;
          accepted_at?: string | null;
          delivered_at?: string | null;
          last_error?: string | null;
          created_time?: string;
          modified_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_deliveries_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "reminder_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminder_deliveries_recipient_profile_id_fkey";
            columns: ["recipient_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      requests: {
        Row: {
          id: number;
          requester_id: number;
          title: string;
          description: string;
          category: Database["public"]["Enums"]["request_category"];
          estimated_cost_cents: number;
          attachment_path: string | null;
          attachment_name: string | null;
          priority: Database["public"]["Enums"]["request_priority"];
          assigned_department: string | null;
          approval_required: boolean;
          status: Database["public"]["Enums"]["request_status"];
          ai_suggestion: Json | null;
          reviewed_by: number | null;
          reviewed_at: string | null;
          review_comment: string | null;
          created_time: string;
          modified_time: string;
        };
        Insert: {
          id?: never;
          requester_id: number;
          title: string;
          description: string;
          category?: Database["public"]["Enums"]["request_category"];
          estimated_cost_cents?: number;
          attachment_path?: string | null;
          attachment_name?: string | null;
          priority?: Database["public"]["Enums"]["request_priority"];
          assigned_department?: string | null;
          approval_required?: boolean;
          status?: Database["public"]["Enums"]["request_status"];
          ai_suggestion?: Json | null;
          reviewed_by?: number | null;
          reviewed_at?: string | null;
          review_comment?: string | null;
          created_time?: string;
          modified_time?: string;
        };
        Update: {
          id?: never;
          requester_id?: number;
          title?: string;
          description?: string;
          category?: Database["public"]["Enums"]["request_category"];
          estimated_cost_cents?: number;
          attachment_path?: string | null;
          attachment_name?: string | null;
          priority?: Database["public"]["Enums"]["request_priority"];
          assigned_department?: string | null;
          approval_required?: boolean;
          status?: Database["public"]["Enums"]["request_status"];
          ai_suggestion?: Json | null;
          reviewed_by?: number | null;
          reviewed_at?: string | null;
          review_comment?: string | null;
          created_time?: string;
          modified_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      request_comments: {
        Row: {
          id: number;
          request_id: number;
          author_id: number;
          body: string;
          created_time: string;
        };
        Insert: {
          id?: never;
          request_id: number;
          author_id: number;
          body: string;
          created_time?: string;
        };
        Update: {
          id?: never;
          request_id?: number;
          author_id?: number;
          body?: string;
          created_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_comments_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      training_attachments: {
        Row: {
          id: number;
          training_record_id: number;
          file_path: string;
          file_name: string;
          file_size: number;
          created_time: string;
        };
        Insert: {
          id?: never;
          training_record_id: number;
          file_path: string;
          file_name: string;
          file_size?: number;
          created_time?: string;
        };
        Update: {
          id?: never;
          training_record_id?: number;
          file_path?: string;
          file_name?: string;
          file_size?: number;
          created_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_attachments_training_record_id_fkey";
            columns: ["training_record_id"];
            isOneToOne: false;
            referencedRelation: "training_records";
            referencedColumns: ["id"];
          },
        ];
      };
      training_records: {
        Row: {
          id: number;
          submission_id: number;
          seq_no: number;
          title: string;
          start_datetime: string;
          end_datetime: string;
          calculated_minutes: number;
          recorded_minutes: number;
          override_reason: string | null;
          location: string | null;
          trainer_provider: string | null;
          effectiveness:
            | Database["public"]["Enums"]["training_effectiveness"]
            | null;
          remarks: string | null;
          created_time: string;
          modified_time: string;
        };
        Insert: {
          id?: never;
          submission_id: number;
          seq_no?: number;
          title: string;
          start_datetime: string;
          end_datetime: string;
          calculated_minutes?: number;
          recorded_minutes?: number;
          override_reason?: string | null;
          location?: string | null;
          trainer_provider?: string | null;
          effectiveness?:
            | Database["public"]["Enums"]["training_effectiveness"]
            | null;
          remarks?: string | null;
          created_time?: string;
          modified_time?: string;
        };
        Update: {
          id?: never;
          submission_id?: number;
          seq_no?: number;
          title?: string;
          start_datetime?: string;
          end_datetime?: string;
          calculated_minutes?: number;
          recorded_minutes?: number;
          override_reason?: string | null;
          location?: string | null;
          trainer_provider?: string | null;
          effectiveness?:
            | Database["public"]["Enums"]["training_effectiveness"]
            | null;
          remarks?: string | null;
          created_time?: string;
          modified_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_records_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "training_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      training_submissions: {
        Row: {
          id: number;
          employee_id: number;
          month: number;
          year: number;
          status: Database["public"]["Enums"]["submission_status"];
          is_nil_return: boolean;
          submitted_at: string | null;
          is_late: boolean;
          hod_verified_by: number | null;
          hod_verified_at: string | null;
          hod_comment: string | null;
          hr_verified_by: number | null;
          hr_verified_at: string | null;
          hr_comment: string | null;
          total_minutes: number;
          created_time: string;
          modified_time: string;
        };
        Insert: {
          id?: never;
          employee_id: number;
          month: number;
          year: number;
          status?: Database["public"]["Enums"]["submission_status"];
          is_nil_return?: boolean;
          submitted_at?: string | null;
          is_late?: boolean;
          hod_verified_by?: number | null;
          hod_verified_at?: string | null;
          hod_comment?: string | null;
          hr_verified_by?: number | null;
          hr_verified_at?: string | null;
          hr_comment?: string | null;
          total_minutes?: number;
          created_time?: string;
          modified_time?: string;
        };
        Update: {
          id?: never;
          employee_id?: number;
          month?: number;
          year?: number;
          status?: Database["public"]["Enums"]["submission_status"];
          is_nil_return?: boolean;
          submitted_at?: string | null;
          is_late?: boolean;
          hod_verified_by?: number | null;
          hod_verified_at?: string | null;
          hod_comment?: string | null;
          hr_verified_by?: number | null;
          hr_verified_at?: string | null;
          hr_comment?: string | null;
          total_minutes?: number;
          created_time?: string;
          modified_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_submissions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_submissions_hod_verified_by_fkey";
            columns: ["hod_verified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_submissions_hr_verified_by_fkey";
            columns: ["hr_verified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_edit_submission: {
        Args: { submission: number };
        Returns: boolean;
      };
      can_view_submission: {
        Args: { submission: number };
        Returns: boolean;
      };
      current_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      claim_due_reminder_runs: {
        Args: { p_now?: string; p_lease_minutes?: number };
        Returns: Database["public"]["Tables"]["reminder_runs"]["Row"][];
      };
      is_hr_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_ceo: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_my_team_member: {
        Args: { employee: number };
        Returns: boolean;
      };
      storage_path_owner: {
        Args: { object_name: string };
        Returns: number;
      };
      can_view_request: {
        Args: { request: number };
        Returns: boolean;
      };
    };
    Enums: {
      reminder_audience: "all_active_employees" | "incomplete_training";
      reminder_run_status:
        | "pending"
        | "processing"
        | "completed"
        | "partial"
        | "failed";
      reminder_delivery_status:
        | "pending"
        | "processing"
        | "accepted"
        | "delivered"
        | "failed"
        | "unknown"
        | "skipped";
      submission_status:
        | "draft"
        | "submitted_pending_hod"
        | "hod_verified"
        | "approved"
        | "returned_by_hod"
        | "rejected";
      request_status:
        | "submitted"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "in_progress"
        | "completed";
      request_category:
        | "it_equipment"
        | "office_furniture"
        | "software"
        | "access_card"
        | "name_card"
        | "office_equipment"
        | "maintenance"
        | "other";
      request_priority: "low" | "normal" | "high" | "urgent";
      training_effectiveness: "effective" | "average" | "not_effective";
      user_role: "staff" | "hod" | "hr_admin" | "ceo";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
