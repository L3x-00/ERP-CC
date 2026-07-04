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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          actualizado_en: string
          contacto: string | null
          correo: string | null
          creado_en: string
          id: string
          nombre_comercial: string
          rfc: string | null
          telefono: string | null
        }
        Insert: {
          actualizado_en?: string
          contacto?: string | null
          correo?: string | null
          creado_en?: string
          id?: string
          nombre_comercial: string
          rfc?: string | null
          telefono?: string | null
        }
        Update: {
          actualizado_en?: string
          contacto?: string | null
          correo?: string | null
          creado_en?: string
          id?: string
          nombre_comercial?: string
          rfc?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      contador_folios: {
        Row: {
          periodo: string
          ultimo: number
        }
        Insert: {
          periodo: string
          ultimo?: number
        }
        Update: {
          periodo?: string
          ultimo?: number
        }
        Relationships: []
      }
      cotizacion_lineas: {
        Row: {
          area: number | null
          cantidad: number
          creado_en: string
          descripcion: string
          espesor: string | null
          id: string
          material: string | null
          orden: number
          pipeline_id: string
          precio_unitario: number
          procesos: string[]
        }
        Insert: {
          area?: number | null
          cantidad: number
          creado_en?: string
          descripcion: string
          espesor?: string | null
          id?: string
          material?: string | null
          orden?: number
          pipeline_id: string
          precio_unitario: number
          procesos?: string[]
        }
        Update: {
          area?: number | null
          cantidad?: number
          creado_en?: string
          descripcion?: string
          espesor?: string | null
          id?: string
          material?: string | null
          orden?: number
          pipeline_id?: string
          precio_unitario?: number
          procesos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_lineas_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      intentos_login: {
        Row: {
          actualizado_en: string
          bloqueado_hasta: string | null
          contexto: string
          identificador: string
          intentos: number
        }
        Insert: {
          actualizado_en?: string
          bloqueado_hasta?: string | null
          contexto: string
          identificador: string
          intentos?: number
        }
        Update: {
          actualizado_en?: string
          bloqueado_hasta?: string | null
          contexto?: string
          identificador?: string
          intentos?: number
        }
        Relationships: []
      }
      logs: {
        Row: {
          accion: string
          creado_en: string
          detalles: Json | null
          id: string
          modulo: string
          nombre_usuario: string
          recurso_id: string
          rol: string
          usuario_id: string | null
        }
        Insert: {
          accion: string
          creado_en?: string
          detalles?: Json | null
          id?: string
          modulo: string
          nombre_usuario: string
          recurso_id: string
          rol: string
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          creado_en?: string
          detalles?: Json | null
          id?: string
          modulo?: string
          nombre_usuario?: string
          recurso_id?: string
          rol?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      permisos_rol: {
        Row: {
          creado_en: string
          id: string
          permiso: string
          rol: string
        }
        Insert: {
          creado_en?: string
          id?: string
          permiso: string
          rol: string
        }
        Update: {
          creado_en?: string
          id?: string
          permiso?: string
          rol?: string
        }
        Relationships: []
      }
      pipeline: {
        Row: {
          actualizado_en: string
          cliente_id: string | null
          condiciones_pago: string | null
          correo: string | null
          creado_en: string
          empresa: string
          etapa: string
          etiquetas: string[]
          fecha_envio_cotizacion: string | null
          fecha_ultimo_contacto: string | null
          folio_cnc: string | null
          folio_op: string
          id: string
          iva_porcentaje: number
          moneda: string
          motivo_perdida: string | null
          nombre_contacto: string
          notas_perdida: string | null
          prioridad: string
          telefono: string | null
          vendedor_id: string
        }
        Insert: {
          actualizado_en?: string
          cliente_id?: string | null
          condiciones_pago?: string | null
          correo?: string | null
          creado_en?: string
          empresa: string
          etapa?: string
          etiquetas?: string[]
          fecha_envio_cotizacion?: string | null
          fecha_ultimo_contacto?: string | null
          folio_cnc?: string | null
          folio_op: string
          id?: string
          iva_porcentaje?: number
          moneda?: string
          motivo_perdida?: string | null
          nombre_contacto: string
          notas_perdida?: string | null
          prioridad?: string
          telefono?: string | null
          vendedor_id: string
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string | null
          condiciones_pago?: string | null
          correo?: string | null
          creado_en?: string
          empresa?: string
          etapa?: string
          etiquetas?: string[]
          fecha_envio_cotizacion?: string | null
          fecha_ultimo_contacto?: string | null
          folio_cnc?: string | null
          folio_op?: string
          id?: string
          iva_porcentaje?: number
          moneda?: string
          motivo_perdida?: string | null
          nombre_contacto?: string
          notas_perdida?: string | null
          prioridad?: string
          telefono?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          actualizado_en: string
          creado_en: string
          email: string
          id: string
          nombre_completo: string
          pin_operador: string | null
          rol: string
          ultimo_login_at: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          email: string
          id: string
          nombre_completo: string
          pin_operador?: string | null
          rol: string
          ultimo_login_at?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          email?: string
          id?: string
          nombre_completo?: string
          pin_operador?: string | null
          rol?: string
          ultimo_login_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      es_admin: { Args: never; Returns: boolean }
      generar_folio_cnc: { Args: never; Returns: string }
      generar_folio_op: { Args: never; Returns: string }
      registrar_intento_fallido: {
        Args: {
          p_bloqueo_segundos: number
          p_contexto: string
          p_identificador: string
          p_max_intentos: number
        }
        Returns: undefined
      }
      usuario_tiene_permiso: { Args: { p_permiso: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
