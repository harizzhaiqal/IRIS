export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: boolean;
          monthly_standard_hours: number;
          yearly_standard_hours: number;
          yearly_threshold_hours: number;
          submission_deadline_day: number;
          reminder_enabled: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          monthly_standard_hours?: number;
          yearly_standard_hours?: number;
          yearly_threshold_hours?: number;
          submission_deadline_day?: number;
          reminder_enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          monthly_standard_hours?: number;
          yearly_standard_hours?: number;
          yearly_threshold_hours?: number;
          submission_deadline_day?: number;
          reminder_enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
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
          id: string;
          action_type: string;
          description: string | null;
          related_table: string | null;
          related_id: string | null;
          performed_by: string | null;
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_type: string;
          description?: string | null;
          related_table?: string | null;
          related_id?: string | null;
          performed_by?: string | null;
          is_system?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_type?: string;
          description?: string | null;
          related_table?: string | null;
          related_id?: string | null;
          performed_by?: string | null;
          is_system?: boolean;
          created_at?: string;
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
      departments: {
        Row: {
          id: string;
          name: string;
          hod_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          hod_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          hod_id?: string | null;
          created_at?: string;
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
          id: string;
          full_name: string;
          email: string;
          designation: string | null;
          date_joined: string | null;
          role: Database["public"]["Enums"]["user_role"];
          department_id: string | null;
          hod_id: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          designation?: string | null;
          date_joined?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          department_id?: string | null;
          hod_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          designation?: string | null;
          date_joined?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          department_id?: string | null;
          hod_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
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
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      training_attachments: {
        Row: {
          id: string;
          training_record_id: string;
          file_path: string;
          file_name: string;
          file_size: number;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          training_record_id: string;
          file_path: string;
          file_name: string;
          file_size?: number;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          training_record_id?: string;
          file_path?: string;
          file_name?: string;
          file_size?: number;
          uploaded_at?: string;
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
          id: string;
          submission_id: string;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          submission_id?: string;
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
          created_at?: string;
          updated_at?: string;
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
          id: string;
          employee_id: string;
          month: number;
          year: number;
          status: Database["public"]["Enums"]["submission_status"];
          is_nil_return: boolean;
          submitted_at: string | null;
          is_late: boolean;
          hod_verified_by: string | null;
          hod_verified_at: string | null;
          hod_comment: string | null;
          hr_verified_by: string | null;
          hr_verified_at: string | null;
          hr_comment: string | null;
          total_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          month: number;
          year: number;
          status?: Database["public"]["Enums"]["submission_status"];
          is_nil_return?: boolean;
          submitted_at?: string | null;
          is_late?: boolean;
          hod_verified_by?: string | null;
          hod_verified_at?: string | null;
          hod_comment?: string | null;
          hr_verified_by?: string | null;
          hr_verified_at?: string | null;
          hr_comment?: string | null;
          total_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          month?: number;
          year?: number;
          status?: Database["public"]["Enums"]["submission_status"];
          is_nil_return?: boolean;
          submitted_at?: string | null;
          is_late?: boolean;
          hod_verified_by?: string | null;
          hod_verified_at?: string | null;
          hod_comment?: string | null;
          hr_verified_by?: string | null;
          hr_verified_at?: string | null;
          hr_comment?: string | null;
          total_minutes?: number;
          created_at?: string;
          updated_at?: string;
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
        Args: { submission: string };
        Returns: boolean;
      };
      can_view_submission: {
        Args: { submission: string };
        Returns: boolean;
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      is_hr_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_my_team_member: {
        Args: { employee: string };
        Returns: boolean;
      };
    };
    Enums: {
      submission_status:
        | "draft"
        | "submitted_pending_hod"
        | "hod_verified"
        | "approved"
        | "returned_by_hod"
        | "rejected";
      training_effectiveness: "effective" | "average" | "not_effective";
      user_role: "staff" | "hod" | "hr_admin";
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
