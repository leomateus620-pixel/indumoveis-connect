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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          all_day: boolean
          assignee_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          edition_id: string
          end_at: string | null
          id: string
          idempotency_key: string | null
          kind: string
          location: string | null
          related_id: string | null
          related_type: string | null
          start_at: string | null
          status: Database["public"]["Enums"]["activity_status"]
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          all_day?: boolean
          assignee_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          edition_id: string
          end_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          location?: string | null
          related_id?: string | null
          related_type?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          all_day?: boolean
          assignee_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          edition_id?: string
          end_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          location?: string | null
          related_id?: string | null
          related_type?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "activities_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "activity_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_assignees: {
        Row: {
          activity_id: string
          created_at: string
          is_primary: boolean
          profile_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          is_primary?: boolean
          profile_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          is_primary?: boolean
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_assignees_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_assignees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_categories: {
        Row: {
          created_at: string
          edition_id: string
          id: string
          is_active: boolean
          name: string
          slug: string
          source: string | null
          updated_at: string
          verified_on: string | null
        }
        Insert: {
          created_at?: string
          edition_id: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          source?: string | null
          updated_at?: string
          verified_on?: string | null
        }
        Update: {
          created_at?: string
          edition_id?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          source?: string | null
          updated_at?: string
          verified_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_categories_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_commissions: {
        Row: {
          activity_id: string
          commission_id: string
          created_at: string
        }
        Insert: {
          activity_id: string
          commission_id: string
          created_at?: string
        }
        Update: {
          activity_id?: string
          commission_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_commissions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_commissions_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_versions: {
        Row: {
          activity_id: string
          actor: string | null
          created_at: string
          id: string
          snapshot: Json
          version: number
        }
        Insert: {
          activity_id: string
          actor?: string | null
          created_at?: string
          id?: string
          snapshot: Json
          version: number
        }
        Update: {
          activity_id?: string
          actor?: string | null
          created_at?: string
          id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_versions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          changes: Json | null
          created_at: string
          id: number
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          changes?: Json | null
          created_at?: string
          id?: never
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          changes?: Json | null
          created_at?: string
          id?: never
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      checklist_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          items: Json
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          items?: Json
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          items?: Json
          name?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          created_at: string
          edition_id: string
          id: string
          is_active: boolean
          is_coordinating: boolean
          name: string
          slug: string
          source_url: string | null
          updated_at: string
          verified_on: string | null
        }
        Insert: {
          created_at?: string
          edition_id: string
          id?: string
          is_active?: boolean
          is_coordinating?: boolean
          name: string
          slug: string
          source_url?: string | null
          updated_at?: string
          verified_on?: string | null
        }
        Update: {
          created_at?: string
          edition_id?: string
          id?: string
          is_active?: boolean
          is_coordinating?: boolean
          name?: string
          slug?: string
          source_url?: string | null
          updated_at?: string
          verified_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_demo: boolean
          legal_name: string
          notes: string | null
          phone: string | null
          segment: string | null
          state: string | null
          tax_id: string | null
          trade_name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          legal_name: string
          notes?: string | null
          phone?: string | null
          segment?: string | null
          state?: string | null
          tax_id?: string | null
          trade_name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          legal_name?: string
          notes?: string | null
          phone?: string | null
          segment?: string | null
          state?: string | null
          tax_id?: string | null
          trade_name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_participations: {
        Row: {
          company_id: string
          created_at: string
          edition_id: string
          id: string
          notes: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          edition_id: string
          id?: string
          notes?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          edition_id?: string
          id?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_participations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_participations_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          role: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_spaces: {
        Row: {
          contract_id: string
          space_id: string
        }
        Insert: {
          contract_id: string
          space_id: string
        }
        Update: {
          contract_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_spaces_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_spaces_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space_status_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_spaces_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_versions: {
        Row: {
          body: string
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          version: number
        }
        Insert: {
          body: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          version: number
        }
        Update: {
          body?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          current_version: number
          deal_id: string
          deal_snapshot: Json | null
          edition_id: string
          id: string
          issued_at: string | null
          number: string | null
          signature_note: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["contract_status"]
          total_cents: number
          updated_at: string
        }
        Insert: {
          body?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          deal_id: string
          deal_snapshot?: Json | null
          edition_id: string
          id?: string
          issued_at?: string | null
          number?: string | null
          signature_note?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          total_cents?: number
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          deal_id?: string
          deal_snapshot?: Json | null
          edition_id?: string
          id?: string
          issued_at?: string | null
          number?: string | null
          signature_note?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_events: {
        Row: {
          actor: string | null
          created_at: string
          deal_id: string
          from_status: Database["public"]["Enums"]["deal_status"] | null
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["deal_status"]
        }
        Insert: {
          actor?: string | null
          created_at?: string
          deal_id: string
          from_status?: Database["public"]["Enums"]["deal_status"] | null
          id?: string
          note?: string | null
          to_status: Database["public"]["Enums"]["deal_status"]
        }
        Update: {
          actor?: string | null
          created_at?: string
          deal_id?: string
          from_status?: Database["public"]["Enums"]["deal_status"] | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["deal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "deal_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_spaces: {
        Row: {
          deal_id: string
          price_cents: number
          space_id: string
        }
        Insert: {
          deal_id: string
          price_cents?: number
          space_id: string
        }
        Update: {
          deal_id?: string
          price_cents?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_spaces_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_spaces_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space_status_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_spaces_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          company_id: string
          conditions: string | null
          created_at: string
          created_by: string | null
          edition_id: string
          id: string
          idempotency_key: string | null
          is_demo: boolean
          notes: string | null
          owner_id: string | null
          reserved_at: string | null
          status: Database["public"]["Enums"]["deal_status"]
          total_cents: number
          updated_at: string
        }
        Insert: {
          company_id: string
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          edition_id: string
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          notes?: string | null
          owner_id?: string | null
          reserved_at?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          total_cents?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          edition_id?: string
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          notes?: string | null
          owner_id?: string | null
          reserved_at?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_links: {
        Row: {
          document_id: string
          entity_id: string
          entity_type: string
        }
        Insert: {
          document_id: string
          entity_id: string
          entity_type: string
        }
        Update: {
          document_id?: string
          entity_id?: string
          entity_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          created_at: string
          edition_id: string | null
          id: string
          mime_type: string | null
          name: string
          previous_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          category?: string
          created_at?: string
          edition_id?: string | null
          id?: string
          mime_type?: string | null
          name: string
          previous_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          edition_id?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          previous_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_previous_id_fkey"
            columns: ["previous_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      editions: {
        Row: {
          contract_template: string | null
          created_at: string
          ends_on: string
          id: string
          is_active: boolean
          name: string
          reservation_expiry_action: string | null
          reservation_hold_days: number | null
          starts_on: string
          timezone: string
          venue: string | null
          year: number
        }
        Insert: {
          contract_template?: string | null
          created_at?: string
          ends_on: string
          id?: string
          is_active?: boolean
          name: string
          reservation_expiry_action?: string | null
          reservation_hold_days?: number | null
          starts_on: string
          timezone?: string
          venue?: string | null
          year: number
        }
        Update: {
          contract_template?: string | null
          created_at?: string
          ends_on?: string
          id?: string
          is_active?: boolean
          name?: string
          reservation_expiry_action?: string | null
          reservation_hold_days?: number | null
          starts_on?: string
          timezone?: string
          venue?: string | null
          year?: number
        }
        Relationships: []
      }
      floor_plans: {
        Row: {
          created_at: string
          edition_id: string
          id: string
          name: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          edition_id: string
          id?: string
          name: string
          storage_path: string
        }
        Update: {
          created_at?: string
          edition_id?: string
          id?: string
          name?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_plans_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          condition: string
          id: string
          inspection_id: string
          label: string
          note: string | null
          position: number
        }
        Insert: {
          condition?: string
          id?: string
          inspection_id: string
          label: string
          note?: string | null
          position?: number
        }
        Update: {
          condition?: string
          id?: string
          inspection_id?: string
          label?: string
          note?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          acceptance_at: string | null
          acceptance_name: string | null
          acceptance_signature: string | null
          company_id: string | null
          completed_at: string | null
          contract_id: string | null
          created_at: string
          edition_id: string
          id: string
          inspector_id: string | null
          kind: Database["public"]["Enums"]["inspection_kind"]
          notes: string | null
          scheduled_for: string | null
          space_id: string
          status: Database["public"]["Enums"]["inspection_status"]
        }
        Insert: {
          acceptance_at?: string | null
          acceptance_name?: string | null
          acceptance_signature?: string | null
          company_id?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          edition_id: string
          id?: string
          inspector_id?: string | null
          kind: Database["public"]["Enums"]["inspection_kind"]
          notes?: string | null
          scheduled_for?: string | null
          space_id: string
          status?: Database["public"]["Enums"]["inspection_status"]
        }
        Update: {
          acceptance_at?: string | null
          acceptance_name?: string | null
          acceptance_signature?: string | null
          company_id?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          edition_id?: string
          id?: string
          inspector_id?: string | null
          kind?: Database["public"]["Enums"]["inspection_kind"]
          notes?: string | null
          scheduled_for?: string | null
          space_id?: string
          status?: Database["public"]["Enums"]["inspection_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space_status_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          amount_cents: number
          contract_id: string
          created_at: string
          due_date: string
          edition_id: string
          id: string
          number: number
          status: Database["public"]["Enums"]["installment_status"]
        }
        Insert: {
          amount_cents: number
          contract_id: string
          created_at?: string
          due_date: string
          edition_id: string
          id?: string
          number: number
          status?: Database["public"]["Enums"]["installment_status"]
        }
        Update: {
          amount_cents?: number
          contract_id?: string
          created_at?: string
          due_date?: string
          edition_id?: string
          id?: string
          number?: number
          status?: Database["public"]["Enums"]["installment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "installments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          installment_id: string
          method: string | null
          note: string | null
          paid_on: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          installment_id: string
          method?: string | null
          note?: string | null
          paid_on: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          installment_id?: string
          method?: string | null
          note?: string | null
          paid_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_read: boolean
          can_write: boolean
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_read?: boolean
          can_write?: boolean
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_read?: boolean
          can_write?: boolean
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      spaces: {
        Row: {
          area_m2: number | null
          blocked: boolean
          code: string
          created_at: string
          edition_id: string
          floor_plan_id: string | null
          id: string
          is_demo: boolean
          list_price_cents: number | null
          notes: string | null
          pos_h: number | null
          pos_w: number | null
          pos_x: number | null
          pos_y: number | null
          sector: string | null
        }
        Insert: {
          area_m2?: number | null
          blocked?: boolean
          code: string
          created_at?: string
          edition_id: string
          floor_plan_id?: string | null
          id?: string
          is_demo?: boolean
          list_price_cents?: number | null
          notes?: string | null
          pos_h?: number | null
          pos_w?: number | null
          pos_x?: number | null
          pos_y?: number | null
          sector?: string | null
        }
        Update: {
          area_m2?: number | null
          blocked?: boolean
          code?: string
          created_at?: string
          edition_id?: string
          floor_plan_id?: string | null
          id?: string
          is_demo?: boolean
          list_price_cents?: number | null
          notes?: string | null
          pos_h?: number | null
          pos_w?: number | null
          pos_x?: number | null
          pos_y?: number | null
          sector?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spaces_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaces_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
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
    }
    Views: {
      space_status_v: {
        Row: {
          active_deal_id: string | null
          area_m2: number | null
          blocked: boolean | null
          code: string | null
          commercial_status: string | null
          created_at: string | null
          edition_id: string | null
          floor_plan_id: string | null
          id: string | null
          is_demo: boolean | null
          list_price_cents: number | null
          notes: string | null
          pos_h: number | null
          pos_w: number | null
          pos_x: number | null
          pos_y: number | null
          sector: string | null
        }
        Insert: {
          active_deal_id?: never
          area_m2?: number | null
          blocked?: boolean | null
          code?: string | null
          commercial_status?: never
          created_at?: string | null
          edition_id?: string | null
          floor_plan_id?: string | null
          id?: string | null
          is_demo?: boolean | null
          list_price_cents?: number | null
          notes?: string | null
          pos_h?: number | null
          pos_w?: number | null
          pos_x?: number | null
          pos_y?: number | null
          sector?: string | null
        }
        Update: {
          active_deal_id?: never
          area_m2?: number | null
          blocked?: boolean | null
          code?: string | null
          commercial_status?: never
          created_at?: string | null
          edition_id?: string | null
          floor_plan_id?: string | null
          id?: string | null
          is_demo?: boolean | null
          list_price_cents?: number | null
          notes?: string | null
          pos_h?: number | null
          pos_w?: number | null
          pos_x?: number | null
          pos_y?: number | null
          sector?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spaces_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaces_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activity_snapshot: { Args: { p_activity_id: string }; Returns: Json }
      can_read: { Args: { _module: string }; Returns: boolean }
      can_write: { Args: { _module: string }; Returns: boolean }
      create_contract_from_deal: {
        Args: { p_deal_id: string }
        Returns: string
      }
      create_inspection: {
        Args: {
          p_edition_id: string
          p_inspector: string
          p_kind: Database["public"]["Enums"]["inspection_kind"]
          p_scheduled: string
          p_space_id: string
          p_template_id: string
        }
        Returns: string
      }
      deal_snapshot: { Args: { p_deal_id: string }; Returns: Json }
      ensure_profile: { Args: never; Returns: Json }
      generate_installments: {
        Args: {
          p_contract_id: string
          p_count: number
          p_first_due: string
          p_interval_months: number
        }
        Returns: undefined
      }
      has_any_role: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      provision_initial_admin: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      reconcile_contract_cancellation: {
        Args: { p_contract_id: string }
        Returns: undefined
      }
      refresh_contract_from_deal: {
        Args: { p_contract_id: string; p_expected_version: number }
        Returns: undefined
      }
      register_payment: {
        Args: {
          p_amount_cents: number
          p_idempotency_key: string
          p_installment_id: string
          p_method: string
          p_note: string
          p_paid_on: string
        }
        Returns: string
      }
      save_activity: {
        Args: {
          p_activity_id: string
          p_all_day: boolean
          p_assignee_ids: string[]
          p_category_id: string
          p_commission_ids: string[]
          p_description: string
          p_edition_id: string
          p_end_local: string
          p_expected_version: number
          p_idempotency_key: string
          p_kind: string
          p_location: string
          p_primary_assignee: string
          p_related_id: string
          p_related_type: string
          p_start_local: string
          p_title: string
        }
        Returns: string
      }
      save_activity_category: {
        Args: {
          p_edition_id: string
          p_id: string
          p_is_active: boolean
          p_name: string
        }
        Returns: string
      }
      save_commission: {
        Args: {
          p_edition_id: string
          p_id: string
          p_is_active: boolean
          p_is_coordinating: boolean
          p_name: string
        }
        Returns: string
      }
      save_contract_body: {
        Args: {
          p_body: string
          p_contract_id: string
          p_expected_version: number
        }
        Returns: number
      }
      save_deal: {
        Args: {
          p_company_id: string
          p_conditions: string
          p_deal_id: string
          p_edition_id: string
          p_idempotency_key: string
          p_notes: string
          p_owner_id: string
          p_prices: number[]
          p_space_ids: string[]
        }
        Returns: string
      }
      set_activity_status: {
        Args: {
          p_activity_id: string
          p_expected_version: number
          p_status: Database["public"]["Enums"]["activity_status"]
        }
        Returns: number
      }
      set_contract_status: {
        Args: {
          p_contract_id: string
          p_note: string
          p_to: Database["public"]["Enums"]["contract_status"]
        }
        Returns: undefined
      }
      transition_deal: {
        Args: {
          p_deal_id: string
          p_note: string
          p_to: Database["public"]["Enums"]["deal_status"]
        }
        Returns: undefined
      }
      validate_activity_reference: {
        Args: {
          p_edition_id: string
          p_related_id: string
          p_related_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      activity_status: "aberta" | "concluida" | "cancelada"
      app_role: "admin" | "comercial" | "financeiro" | "operacao" | "consulta"
      contract_status: "elaboracao" | "emitido" | "assinado" | "cancelado"
      deal_status:
        | "proposta"
        | "negociacao"
        | "reservada"
        | "contratada"
        | "perdida"
        | "cancelada"
      inspection_kind: "entrega" | "devolucao"
      inspection_status: "agendada" | "em_andamento" | "concluida"
      installment_status: "aberta" | "paga" | "cancelada"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      activity_status: ["aberta", "concluida", "cancelada"],
      app_role: ["admin", "comercial", "financeiro", "operacao", "consulta"],
      contract_status: ["elaboracao", "emitido", "assinado", "cancelado"],
      deal_status: [
        "proposta",
        "negociacao",
        "reservada",
        "contratada",
        "perdida",
        "cancelada",
      ],
      inspection_kind: ["entrega", "devolucao"],
      inspection_status: ["agendada", "em_andamento", "concluida"],
      installment_status: ["aberta", "paga", "cancelada"],
    },
  },
} as const
