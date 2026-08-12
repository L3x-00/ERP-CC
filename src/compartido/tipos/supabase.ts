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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          actualizado_en: string
          condiciones_pago: string | null
          contacto: string | null
          correo: string | null
          creado_en: string
          direccion_envio: Json | null
          direccion_fiscal: Json | null
          estado: string
          id: string
          limite_credito: number
          nombre_comercial: string
          razon_social: string
          rfc: string | null
          saldo_a_favor: number
          telefono: string | null
          tier: string
          tier_manual: string | null
          tier_manual_hasta: string | null
        }
        Insert: {
          actualizado_en?: string
          condiciones_pago?: string | null
          contacto?: string | null
          correo?: string | null
          creado_en?: string
          direccion_envio?: Json | null
          direccion_fiscal?: Json | null
          estado?: string
          id?: string
          limite_credito?: number
          nombre_comercial: string
          razon_social: string
          rfc?: string | null
          saldo_a_favor?: number
          telefono?: string | null
          tier?: string
          tier_manual?: string | null
          tier_manual_hasta?: string | null
        }
        Update: {
          actualizado_en?: string
          condiciones_pago?: string | null
          contacto?: string | null
          correo?: string | null
          creado_en?: string
          direccion_envio?: Json | null
          direccion_fiscal?: Json | null
          estado?: string
          id?: string
          limite_credito?: number
          nombre_comercial?: string
          razon_social?: string
          rfc?: string | null
          saldo_a_favor?: number
          telefono?: string | null
          tier?: string
          tier_manual?: string | null
          tier_manual_hasta?: string | null
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
      documentos_cliente: {
        Row: {
          cliente_id: string
          creado_en: string
          id: string
          nombre_archivo: string
          ruta_storage: string
          subido_por: string | null
          tipo: string
        }
        Insert: {
          cliente_id: string
          creado_en?: string
          id?: string
          nombre_archivo: string
          ruta_storage: string
          subido_por?: string | null
          tipo: string
        }
        Update: {
          cliente_id?: string
          creado_en?: string
          id?: string
          nombre_archivo?: string
          ruta_storage?: string
          subido_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_cliente_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
      materiales: {
        Row: {
          actualizado_en: string
          categoria: string
          codigo: string
          costo_unitario_compra: number
          costo_unitario_control: number
          creado_en: string
          descripcion: string | null
          factor_conversion: number
          factor_merma_porcentaje: number
          id: string
          nombre: string
          proveedor_id: string | null
          stock_actual_control: number
          stock_minimo_control: number
          stock_reservado_control: number
          unidad_compra: string
          unidad_control: string
        }
        Insert: {
          actualizado_en?: string
          categoria: string
          codigo: string
          costo_unitario_compra?: number
          costo_unitario_control?: number
          creado_en?: string
          descripcion?: string | null
          factor_conversion?: number
          factor_merma_porcentaje?: number
          id?: string
          nombre: string
          proveedor_id?: string | null
          stock_actual_control?: number
          stock_minimo_control?: number
          stock_reservado_control?: number
          unidad_compra: string
          unidad_control: string
        }
        Update: {
          actualizado_en?: string
          categoria?: string
          codigo?: string
          costo_unitario_compra?: number
          costo_unitario_control?: number
          creado_en?: string
          descripcion?: string | null
          factor_conversion?: number
          factor_merma_porcentaje?: number
          id?: string
          nombre?: string
          proveedor_id?: string | null
          stock_actual_control?: number
          stock_minimo_control?: number
          stock_reservado_control?: number
          unidad_compra?: string
          unidad_control?: string
        }
        Relationships: [
          {
            foreignKeyName: "materiales_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          cantidad_compra: number | null
          cantidad_control: number
          costo_unitario_momento: number
          creado_en: string
          folio: string
          id: string
          material_id: string
          notas: string | null
          operador_id: string | null
          orden_id: string | null
          referencia_externa: string | null
          tipo_movimiento: string
        }
        Insert: {
          cantidad_compra?: number | null
          cantidad_control: number
          costo_unitario_momento: number
          creado_en?: string
          folio: string
          id?: string
          material_id: string
          notas?: string | null
          operador_id?: string | null
          orden_id?: string | null
          referencia_externa?: string | null
          tipo_movimiento: string
        }
        Update: {
          cantidad_compra?: number | null
          cantidad_control?: number
          costo_unitario_momento?: number
          creado_en?: string
          folio?: string
          id?: string
          material_id?: string
          notas?: string | null
          operador_id?: string | null
          orden_id?: string | null
          referencia_externa?: string | null
          tipo_movimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_produccion: {
        Row: {
          actualizado_en: string
          cliente_id: string
          cotizacion_id: string | null
          creado_en: string
          estado: string
          fecha_compromiso: string
          fecha_fin: string | null
          fecha_inicio: string | null
          folio: string
          id: string
          motivo_cancelacion: string | null
          prioridad: string
        }
        Insert: {
          actualizado_en?: string
          cliente_id: string
          cotizacion_id?: string | null
          creado_en?: string
          estado?: string
          fecha_compromiso: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          folio: string
          id?: string
          motivo_cancelacion?: string | null
          prioridad?: string
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string
          cotizacion_id?: string | null
          creado_en?: string
          estado?: string
          fecha_compromiso?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          folio?: string
          id?: string
          motivo_cancelacion?: string | null
          prioridad?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_produccion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      partidas_orden_produccion: {
        Row: {
          actualizado_en: string
          cantidad_producida: number
          cantidad_scrap: number
          cantidad_solicitada: number
          codigo_pieza: string
          creado_en: string
          descripcion: string | null
          id: string
          maquina_asignada: string | null
          material_id: string | null
          operador_asignado_id: string | null
          orden_id: string
          tiempo_estimado_minutos: number
          tiempo_real_minutos: number
          unidad_medida: string
        }
        Insert: {
          actualizado_en?: string
          cantidad_producida?: number
          cantidad_scrap?: number
          cantidad_solicitada: number
          codigo_pieza: string
          creado_en?: string
          descripcion?: string | null
          id?: string
          maquina_asignada?: string | null
          material_id?: string | null
          operador_asignado_id?: string | null
          orden_id: string
          tiempo_estimado_minutos?: number
          tiempo_real_minutos?: number
          unidad_medida: string
        }
        Update: {
          actualizado_en?: string
          cantidad_producida?: number
          cantidad_scrap?: number
          cantidad_solicitada?: number
          codigo_pieza?: string
          creado_en?: string
          descripcion?: string | null
          id?: string
          maquina_asignada?: string | null
          material_id?: string | null
          operador_asignado_id?: string | null
          orden_id?: string
          tiempo_estimado_minutos?: number
          tiempo_real_minutos?: number
          unidad_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "partidas_orden_produccion_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidas_orden_produccion_operador_asignado_id_fkey"
            columns: ["operador_asignado_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidas_orden_produccion_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
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
      proveedores: {
        Row: {
          actualizado_en: string
          contacto_nombre: string
          correo: string
          creado_en: string
          direccion: string | null
          id: string
          nombre_comercial: string
          razon_social: string | null
          rfc: string | null
          telefono: string
        }
        Insert: {
          actualizado_en?: string
          contacto_nombre: string
          correo: string
          creado_en?: string
          direccion?: string | null
          id?: string
          nombre_comercial: string
          razon_social?: string | null
          rfc?: string | null
          telefono: string
        }
        Update: {
          actualizado_en?: string
          contacto_nombre?: string
          correo?: string
          creado_en?: string
          direccion?: string | null
          id?: string
          nombre_comercial?: string
          razon_social?: string | null
          rfc?: string | null
          telefono?: string
        }
        Relationships: []
      }
      registros_avance_partida: {
        Row: {
          cantidad_producida: number
          cantidad_scrap: number
          creado_en: string
          id: string
          operador_id: string
          partida_id: string
        }
        Insert: {
          cantidad_producida?: number
          cantidad_scrap?: number
          creado_en?: string
          id?: string
          operador_id: string
          partida_id: string
        }
        Update: {
          cantidad_producida?: number
          cantidad_scrap?: number
          creado_en?: string
          id?: string
          operador_id?: string
          partida_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_avance_partida_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_avance_partida_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consumo_material: {
        Row: {
          cantidad_scrap: number
          cantidad_usada: number
          costo_unitario_momento: number
          creado_en: string
          id: string
          material_id: string
          partida_id: string
        }
        Insert: {
          cantidad_scrap?: number
          cantidad_usada?: number
          costo_unitario_momento: number
          creado_en?: string
          id?: string
          material_id: string
          partida_id: string
        }
        Update: {
          cantidad_scrap?: number
          cantidad_usada?: number
          costo_unitario_momento?: number
          creado_en?: string
          id?: string
          material_id?: string
          partida_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_consumo_material_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consumo_material_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_tiempo_operador: {
        Row: {
          accion: string
          actualizado_en: string
          creado_en: string
          fecha_registro: string
          id: string
          notas: string | null
          operador_id: string
          partida_id: string
        }
        Insert: {
          accion: string
          actualizado_en?: string
          creado_en?: string
          fecha_registro?: string
          id?: string
          notas?: string | null
          operador_id: string
          partida_id: string
        }
        Update: {
          accion?: string
          actualizado_en?: string
          creado_en?: string
          fecha_registro?: string
          id?: string
          notas?: string | null
          operador_id?: string
          partida_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_tiempo_operador_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_tiempo_operador_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas_material: {
        Row: {
          actualizado_en: string
          cantidad_reservada: number
          creado_en: string
          estado: string
          id: string
          material_id: string
          orden_id: string
        }
        Insert: {
          actualizado_en?: string
          cantidad_reservada: number
          creado_en?: string
          estado?: string
          id?: string
          material_id: string
          orden_id: string
        }
        Update: {
          actualizado_en?: string
          cantidad_reservada?: number
          creado_en?: string
          estado?: string
          id?: string
          material_id?: string
          orden_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_material_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiales"
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
      aprobar_oportunidad_y_crear_orden: {
        Args: {
          p_cliente_id: string
          p_fecha_compromiso: string
          p_pipeline_id: string
        }
        Returns: {
          folio: string
          id: string
          ya_existia: boolean
        }[]
      }
      asignar_operador_a_partida_op: {
        Args: { p_operador_id: string; p_partida_id: string }
        Returns: {
          actualizado_en: string
          operador_asignado_id: string
          partida_id: string
        }[]
      }
      cambiar_estado_orden: {
        Args: {
          p_estado_actual: string
          p_estado_nuevo: string
          p_motivo_cancelacion?: string
          p_orden_id: string
        }
        Returns: {
          estado: string
          fecha_fin: string
          fecha_inicio: string
          id: string
        }[]
      }
      crear_orden_manual: {
        Args: {
          p_cliente_id: string
          p_fecha_compromiso: string
          p_partidas: Json
          p_prioridad: string
        }
        Returns: {
          folio: string
          id: string
        }[]
      }
      crear_orden_produccion: {
        Args: {
          p_cliente_id: string
          p_cotizacion_id: string
          p_fecha_compromiso: string
          p_partidas: Json
          p_prioridad: string
        }
        Returns: {
          folio: string
          id: string
        }[]
      }
      es_admin: { Args: never; Returns: boolean }
      generar_folio_cnc: { Args: never; Returns: string }
      generar_folio_inventario: { Args: { p_prefijo: string }; Returns: string }
      generar_folio_op: { Args: never; Returns: string }
      generar_folio_orden: { Args: { p_prefijo: string }; Returns: string }
      registrar_avance_partida_op: {
        Args: {
          p_cantidad_producida: number
          p_cantidad_scrap: number
          p_operador_id: string
          p_partida_id: string
        }
        Returns: {
          actualizado_en: string
          cantidad_producida: number
          cantidad_scrap: number
          partida_id: string
        }[]
      }
      registrar_consumo_material_op: {
        Args: {
          p_cantidad_scrap: number
          p_cantidad_usada: number
          p_material_id: string
          p_partida_id: string
        }
        Returns: {
          cantidad_total: number
          costo_unitario_momento: number
          id: string
          movimiento_inventario_id: string
        }[]
      }
      registrar_consumo_material_operador_op: {
        Args: {
          p_cantidad_scrap: number
          p_cantidad_usada: number
          p_material_id: string
          p_operador_id: string
          p_partida_id: string
        }
        Returns: {
          cantidad_total: number
          costo_unitario_momento: number
          id: string
          movimiento_inventario_id: string
        }[]
      }
      registrar_intento_fallido: {
        Args: {
          p_bloqueo_segundos: number
          p_contexto: string
          p_identificador: string
          p_max_intentos: number
        }
        Returns: undefined
      }
      registrar_movimiento_inventario: {
        Args: {
          p_cantidad_compra?: number
          p_cantidad_control: number
          p_costo_unitario_momento: number
          p_material_id: string
          p_notas?: string
          p_operador_id?: string
          p_orden_id?: string
          p_prefijo_folio: string
          p_referencia_externa?: string
          p_tipo: string
        }
        Returns: string
      }
      registrar_tiempo_operador_op: {
        Args: {
          p_accion: string
          p_notas?: string
          p_operador_id: string
          p_partida_id: string
        }
        Returns: {
          accion: string
          actualizado_en: string
          creado_en: string
          fecha_registro: string
          id: string
          notas: string
          operador_id: string
          partida_id: string
        }[]
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
