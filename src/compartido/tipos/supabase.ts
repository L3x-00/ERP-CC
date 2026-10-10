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
      archivos_orden: {
        Row: {
          creado_en: string
          creado_por: string | null
          id: string
          mime: string
          nombre: string
          orden_id: string
          ruta: string
          tamano: number
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          mime: string
          nombre: string
          orden_id: string
          ruta: string
          tamano: number
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          mime?: string
          nombre?: string
          orden_id?: string
          ruta?: string
          tamano?: number
        }
        Relationships: [
          {
            foreignKeyName: "archivos_orden_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivos_orden_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      archivos_sesion_produccion: {
        Row: {
          clase: string
          creado_en: string
          creado_por: string
          id: string
          mime: string
          nombre: string
          ruta: string
          sesion_id: string
          tamano: number
        }
        Insert: {
          clase?: string
          creado_en?: string
          creado_por: string
          id?: string
          mime: string
          nombre: string
          ruta: string
          sesion_id: string
          tamano: number
        }
        Update: {
          clase?: string
          creado_en?: string
          creado_por?: string
          id?: string
          mime?: string
          nombre?: string
          ruta?: string
          sesion_id?: string
          tamano?: number
        }
        Relationships: [
          {
            foreignKeyName: "archivos_sesion_produccion_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivos_sesion_produccion_sesion_id_fkey"
            columns: ["sesion_id"]
            isOneToOne: false
            referencedRelation: "sesiones_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_pago: {
        Row: {
          creado_en: string
          cuenta_id: string
          id: string
          monto: number
          pago_id: string
        }
        Insert: {
          creado_en?: string
          cuenta_id: string
          id?: string
          monto: number
          pago_id: string
        }
        Update: {
          creado_en?: string
          cuenta_id?: string
          id?: string
          monto?: number
          pago_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_pago_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_pago_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos_ar"
            referencedColumns: ["id"]
          },
        ]
      }
      promesas_pago: {
        Row: {
          actualizado_en: string
          creado_en: string
          creado_por: string
          cuenta_id: string
          estado: string
          fecha_prometida: string
          id: string
          monto: number
          motivo_cancelacion: string | null
          recordatorio_previo_en: string | null
          recordatorio_vencida_en: string | null
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por: string
          cuenta_id: string
          estado?: string
          fecha_prometida: string
          id?: string
          monto: number
          motivo_cancelacion?: string | null
          recordatorio_previo_en?: string | null
          recordatorio_vencida_en?: string | null
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string
          cuenta_id?: string
          estado?: string
          fecha_prometida?: string
          id?: string
          monto?: number
          motivo_cancelacion?: string | null
          recordatorio_previo_en?: string | null
          recordatorio_vencida_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promesas_pago_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["id"]
          },
        ]
      }
      archivos: {
        Row: {
          bucket: string
          clase: string
          creado_en: string
          entidad: string
          entidad_id: string
          hash_sha256: string | null
          id: string
          mime: string
          nombre_erp: string | null
          nombre_original: string
          reemplaza_a: string | null
          ruta_storage: string
          subido_por: string | null
          tamano_bytes: number
          tema_codigo: string | null
          version: number
          vigente: boolean
        }
        Insert: {
          bucket: string
          clase: string
          creado_en?: string
          entidad: string
          entidad_id: string
          hash_sha256?: string | null
          id?: string
          mime: string
          nombre_erp?: string | null
          nombre_original: string
          reemplaza_a?: string | null
          ruta_storage: string
          subido_por?: string | null
          tamano_bytes: number
          tema_codigo?: string | null
          version?: number
          vigente?: boolean
        }
        Update: {
          bucket?: string
          clase?: string
          creado_en?: string
          entidad?: string
          entidad_id?: string
          hash_sha256?: string | null
          id?: string
          mime?: string
          nombre_erp?: string | null
          nombre_original?: string
          reemplaza_a?: string | null
          ruta_storage?: string
          subido_por?: string | null
          tamano_bytes?: number
          tema_codigo?: string | null
          version?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "archivos_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      areas_trabajo_config: {
        Row: {
          activo: boolean
          actualizado_en: string
          area_planeacion: string | null
          codigo: string
          color_hex: string
          costo_hora_interno: number
          creado_en: string
          es_externo: boolean
          id: string
          nombre: string
          orden: number
          padre_codigo: string | null
          tarifa_hora_venta: number
          tipo: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          area_planeacion?: string | null
          codigo: string
          color_hex?: string
          costo_hora_interno?: number
          creado_en?: string
          es_externo?: boolean
          id?: string
          nombre: string
          orden?: number
          padre_codigo?: string | null
          tarifa_hora_venta?: number
          tipo?: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          area_planeacion?: string | null
          codigo?: string
          color_hex?: string
          costo_hora_interno?: number
          creado_en?: string
          es_externo?: boolean
          id?: string
          nombre?: string
          orden?: number
          padre_codigo?: string | null
          tarifa_hora_venta?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_trabajo_config_padre_fk"
            columns: ["padre_codigo"]
            isOneToOne: false
            referencedRelation: "areas_trabajo_config"
            referencedColumns: ["codigo"]
          },
        ]
      }
      capacidades_recurso_turno: {
        Row: {
          actualizado_en: string
          creado_en: string
          horas_capacidad: number
          recurso_id: string
          turno: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          horas_capacidad: number
          recurso_id: string
          turno: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          horas_capacidad?: number
          recurso_id?: string
          turno?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacidades_recurso_turno_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "recursos_planeacion"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          actualizado_en: string
          condiciones_pago: string | null
          contacto: string | null
          correo: string | null
          creado_en: string
          credito_habilitado: boolean
          dias_credito: number | null
          direccion_envio: Json | null
          direccion_fiscal: Json | null
          estado: string
          folio: string | null
          id: string
          limite_credito: number
          moneda: string
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
          credito_habilitado?: boolean
          dias_credito?: number | null
          direccion_envio?: Json | null
          direccion_fiscal?: Json | null
          estado?: string
          folio?: string | null
          id?: string
          limite_credito?: number
          moneda?: string
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
          credito_habilitado?: boolean
          dias_credito?: number | null
          direccion_envio?: Json | null
          direccion_fiscal?: Json | null
          estado?: string
          folio?: string | null
          id?: string
          limite_credito?: number
          moneda?: string
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
      comentarios_registro: {
        Row: {
          actualizado_en: string
          archivos_adjuntos: Json
          autor_id: string
          contenido: string
          creado_en: string
          editado: boolean
          eliminado: boolean
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["tipo_entidad_comentario"]
          id: string
          menciones_json: Json
        }
        Insert: {
          actualizado_en?: string
          archivos_adjuntos?: Json
          autor_id: string
          contenido: string
          creado_en?: string
          editado?: boolean
          eliminado?: boolean
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["tipo_entidad_comentario"]
          id?: string
          menciones_json?: Json
        }
        Update: {
          actualizado_en?: string
          archivos_adjuntos?: Json
          autor_id?: string
          contenido?: string
          creado_en?: string
          editado?: boolean
          eliminado?: boolean
          entidad_id?: string
          entidad_tipo?: Database["public"]["Enums"]["tipo_entidad_comentario"]
          id?: string
          menciones_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "comentarios_registro_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_sistema: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          categorias_gasto_json: Json
          empresa_json: Json
          id: string
          iva_porcentaje_default: number
          plantillas_doc_json: Json
          tarifas_json: Json
          tiers_json: Json
          tipo_cambio_usd: number
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          categorias_gasto_json?: Json
          empresa_json?: Json
          id?: string
          iva_porcentaje_default?: number
          plantillas_doc_json?: Json
          tarifas_json?: Json
          tiers_json?: Json
          tipo_cambio_usd?: number
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          categorias_gasto_json?: Json
          empresa_json?: Json
          id?: string
          iva_porcentaje_default?: number
          plantillas_doc_json?: Json
          tarifas_json?: Json
          tiers_json?: Json
          tipo_cambio_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_sistema_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
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
          area_trabajo_codigo: string | null
          calculo_tecnico: Json | null
          cantidad: number
          creado_en: string
          descripcion: string
          es_descuento: boolean
          es_externo: boolean
          espesor: string | null
          estacion_codigo: string | null
          id: string
          material: string | null
          orden: number
          pipeline_id: string
          precio_unitario: number
          procesos: string[]
          proveedor_externo: string | null
        }
        Insert: {
          area?: number | null
          area_trabajo_codigo?: string | null
          calculo_tecnico?: Json | null
          cantidad: number
          creado_en?: string
          descripcion: string
          es_descuento?: boolean
          es_externo?: boolean
          espesor?: string | null
          estacion_codigo?: string | null
          id?: string
          material?: string | null
          orden?: number
          pipeline_id: string
          precio_unitario: number
          procesos?: string[]
          proveedor_externo?: string | null
        }
        Update: {
          area?: number | null
          area_trabajo_codigo?: string | null
          calculo_tecnico?: Json | null
          cantidad?: number
          creado_en?: string
          descripcion?: string
          es_descuento?: boolean
          es_externo?: boolean
          espesor?: string | null
          estacion_codigo?: string | null
          id?: string
          material?: string | null
          orden?: number
          pipeline_id?: string
          precio_unitario?: number
          procesos?: string[]
          proveedor_externo?: string | null
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
      contactos_cliente: {
        Row: {
          activo: boolean
          actualizado_en: string
          cliente_id: string
          correo: string | null
          creado_en: string
          creado_por: string | null
          desactivado_en: string | null
          desactivado_por: string | null
          es_principal: boolean
          id: string
          nombre: string
          notas: string | null
          puesto: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          cliente_id: string
          correo?: string | null
          creado_en?: string
          creado_por?: string | null
          desactivado_en?: string | null
          desactivado_por?: string | null
          es_principal?: boolean
          id?: string
          nombre: string
          notas?: string | null
          puesto?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          cliente_id?: string
          correo?: string | null
          creado_en?: string
          creado_por?: string | null
          desactivado_en?: string | null
          desactivado_por?: string | null
          es_principal?: boolean
          id?: string
          nombre?: string
          notas?: string | null
          puesto?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contactos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_cliente_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_cliente_desactivado_por_fkey"
            columns: ["desactivado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contadores_folio_periodico: {
        Row: {
          actualizado_en: string
          periodo: string
          tipo: string
          ultimo: number
        }
        Insert: {
          actualizado_en?: string
          periodo: string
          tipo: string
          ultimo?: number
        }
        Update: {
          actualizado_en?: string
          periodo?: string
          tipo?: string
          ultimo?: number
        }
        Relationships: []
      }
      compras: {
        Row: {
          actualizado_en: string
          cancelada_en: string | null
          creado_en: string
          creado_por: string
          estado: string
          fecha_compra: string
          fecha_vencimiento: string | null
          folio_sii: string
          id: string
          moneda: string
          monto_iva: number
          monto_subtotal: number
          monto_total: number
          motivo_cancelacion: string | null
          notas: string | null
          orden_id: string | null
          proveedor_id: string
          saldo_pendiente: number
          tipo_cambio: number
        }
        Insert: {
          actualizado_en?: string
          cancelada_en?: string | null
          creado_en?: string
          creado_por: string
          estado?: string
          fecha_compra?: string
          fecha_vencimiento?: string | null
          folio_sii: string
          id?: string
          moneda?: string
          monto_iva?: number
          monto_subtotal: number
          monto_total: number
          motivo_cancelacion?: string | null
          notas?: string | null
          orden_id?: string | null
          proveedor_id: string
          saldo_pendiente: number
          tipo_cambio?: number
        }
        Update: {
          actualizado_en?: string
          cancelada_en?: string | null
          creado_en?: string
          creado_por?: string
          estado?: string
          fecha_compra?: string
          fecha_vencimiento?: string | null
          folio_sii?: string
          id?: string
          moneda?: string
          monto_iva?: number
          monto_subtotal?: number
          monto_total?: number
          motivo_cancelacion?: string | null
          notas?: string | null
          orden_id?: string | null
          proveedor_id?: string
          saldo_pendiente?: number
          tipo_cambio?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_compra: {
        Row: {
          compra_id: string
          creado_en: string
          creado_por: string
          cuenta_bancaria_id: string | null
          fecha_pago: string
          id: string
          metodo_pago: string
          monto: number
          notas: string | null
          referencia: string | null
        }
        Insert: {
          compra_id: string
          creado_en?: string
          creado_por: string
          cuenta_bancaria_id?: string | null
          fecha_pago?: string
          id?: string
          metodo_pago: string
          monto: number
          notas?: string | null
          referencia?: string | null
        }
        Update: {
          compra_id?: string
          creado_en?: string
          creado_por?: string
          cuenta_bancaria_id?: string | null
          fecha_pago?: string
          id?: string
          metodo_pago?: string
          monto?: number
          notas?: string | null
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_compra_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliaciones_tesoreria: {
        Row: {
          conciliado_en: string
          conciliado_por: string
          cuenta_id: string
          entidad: string
          entidad_id: string
          id: string
        }
        Insert: {
          conciliado_en?: string
          conciliado_por: string
          cuenta_id: string
          entidad: string
          entidad_id: string
          id?: string
        }
        Update: {
          conciliado_en?: string
          conciliado_por?: string
          cuenta_id?: string
          entidad?: string
          entidad_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_tesoreria_conciliado_por_fkey"
            columns: ["conciliado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_tesoreria_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_tesoreria: {
        Row: {
          creado_en: string
          creado_por: string
          cuenta_id: string
          id: string
          moneda: string
          monto: number
          par_movimiento_id: string | null
          referencia: string | null
          tipo: string
        }
        Insert: {
          creado_en?: string
          creado_por: string
          cuenta_id: string
          id?: string
          moneda: string
          monto: number
          par_movimiento_id?: string | null
          referencia?: string | null
          tipo: string
        }
        Update: {
          creado_en?: string
          creado_por?: string
          cuenta_id?: string
          id?: string
          moneda?: string
          monto?: number
          par_movimiento_id?: string | null
          referencia?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_tesoreria_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_tesoreria_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_tesoreria_par_movimiento_id_fkey"
            columns: ["par_movimiento_id"]
            isOneToOne: true
            referencedRelation: "movimientos_tesoreria"
            referencedColumns: ["id"]
          },
        ]
      }
      saldos_iniciales_tesoreria: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          creado_en: string
          creado_por: string | null
          cuenta_id: string
          fecha: string
          moneda: string
          monto: number
          tipo_cambio: number
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          cuenta_id: string
          fecha?: string
          moneda: string
          monto: number
          tipo_cambio?: number
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          cuenta_id?: string
          fecha?: string
          moneda?: string
          monto?: number
          tipo_cambio?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldos_iniciales_tesoreria_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: true
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldos_iniciales_tesoreria_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_bancarias: {
        Row: {
          activa: boolean
          actualizado_en: string
          banco: string
          clabe: string | null
          creado_en: string
          id: string
          moneda: string
          numero_cuenta: string
          tipo: string
          titular: string
        }
        Insert: {
          activa?: boolean
          actualizado_en?: string
          banco: string
          clabe?: string | null
          creado_en?: string
          id?: string
          moneda?: string
          numero_cuenta: string
          tipo?: string
          titular: string
        }
        Update: {
          activa?: boolean
          actualizado_en?: string
          banco?: string
          clabe?: string | null
          creado_en?: string
          id?: string
          moneda?: string
          numero_cuenta?: string
          tipo?: string
          titular?: string
        }
        Relationships: []
      }
      cuentas_por_cobrar: {
        Row: {
          actualizado_en: string
          abono_heredado: number
          abono_heredado_en: string | null
          abono_heredado_notas: string | null
          anulada_en: string | null
          anulada_por: string | null
          cliente_id: string
          cobrable_desde: string | null
          creado_en: string
          estado: string
          fecha_emision: string
          fecha_vencimiento: string | null
          factura_id: string | null
          folio_factura_remision: string | null
          motivo_anulacion: string | null
          referencia_interna: string
          id: string
          moneda: string
          monto_iva: number | null
          monto_subtotal: number | null
          monto_total: number
          orden_id: string
          saldo_pendiente: number
          tipo_cambio_origen: number
        }
        Insert: {
          actualizado_en?: string
          abono_heredado?: number
          abono_heredado_en?: string | null
          abono_heredado_notas?: string | null
          anulada_en?: string | null
          anulada_por?: string | null
          cliente_id: string
          cobrable_desde?: string | null
          creado_en?: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          factura_id?: string | null
          folio_factura_remision?: string | null
          motivo_anulacion?: string | null
          referencia_interna?: string
          id?: string
          moneda?: string
          monto_iva?: number | null
          monto_subtotal?: number | null
          monto_total: number
          orden_id: string
          saldo_pendiente: number
          tipo_cambio_origen?: number
        }
        Update: {
          actualizado_en?: string
          abono_heredado?: number
          abono_heredado_en?: string | null
          abono_heredado_notas?: string | null
          anulada_en?: string | null
          anulada_por?: string | null
          cliente_id?: string
          cobrable_desde?: string | null
          creado_en?: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          factura_id?: string | null
          folio_factura_remision?: string | null
          motivo_anulacion?: string | null
          referencia_interna?: string
          id?: string
          moneda?: string
          monto_iva?: number | null
          monto_subtotal?: number | null
          monto_total?: number
          orden_id?: string
          saldo_pendiente?: number
          tipo_cambio_origen?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_por_cobrar_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_por_cobrar_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: true
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_por_cobrar_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
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
      excepciones_capacidad_recurso: {
        Row: {
          actualizado_en: string
          creado_en: string
          fecha: string
          horas_capacidad: number
          id: string
          motivo: string
          recurso_id: string
          turno: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          fecha: string
          horas_capacidad: number
          id?: string
          motivo: string
          recurso_id: string
          turno: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          fecha?: string
          horas_capacidad?: number
          id?: string
          motivo?: string
          recurso_id?: string
          turno?: string
        }
        Relationships: [
          {
            foreignKeyName: "excepciones_capacidad_recurso_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "recursos_planeacion"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes_gasto_historial: {
        Row: {
          id: number
          gasto_id: string
          ruta: string
          reemplazado_en: string
          reemplazado_por: string
        }
        Insert: {
          id?: never
          gasto_id: string
          ruta: string
          reemplazado_en?: string
          reemplazado_por: string
        }
        Update: {
          id?: never
          gasto_id?: string
          ruta?: string
          reemplazado_en?: string
          reemplazado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_gasto_historial_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_gasto_historial_reemplazado_por_fkey"
            columns: ["reemplazado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          actualizado_en: string
          cancelada_en: string | null
          cliente_id: string
          creado_en: string
          creado_por: string | null
          emitida_en: string | null
          entrega_id: string
          estado: string
          folio_fiscal: string | null
          id: string
          iva: number | null
          motivo_cancelacion: string | null
          orden_id: string
          rfc_receptor: string | null
          subtotal: number | null
          total: number | null
          uuid_fiscal: string | null
        }
        Insert: {
          actualizado_en?: string
          cancelada_en?: string | null
          cliente_id: string
          creado_en?: string
          creado_por?: string | null
          emitida_en?: string | null
          entrega_id: string
          estado?: string
          folio_fiscal?: string | null
          id?: string
          iva?: number | null
          motivo_cancelacion?: string | null
          orden_id: string
          rfc_receptor?: string | null
          subtotal?: number | null
          total?: number | null
          uuid_fiscal?: string | null
        }
        Update: {
          actualizado_en?: string
          cancelada_en?: string | null
          cliente_id?: string
          creado_en?: string
          creado_por?: string | null
          emitida_en?: string | null
          entrega_id?: string
          estado?: string
          folio_fiscal?: string | null
          id?: string
          iva?: number | null
          motivo_cancelacion?: string | null
          orden_id?: string
          rfc_receptor?: string | null
          subtotal?: number | null
          total?: number | null
          uuid_fiscal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "notas_entrega"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          actualizado_en: string
          categoria: string
          comprobante_ruta: string | null
          comprobante_url: string | null
          creado_en: string
          creado_por: string
          cuenta_bancaria_id: string | null
          datos_ocr_json: Json | null
          descripcion: string
          estado_pago: string
          fecha_gasto: string
          fecha_vencimiento: string | null
          folio: string
          folio_comprobante: string | null
          folio_sii: string | null
          id: string
          metodo_pago: string | null
          moneda: string
          monto_iva: number
          monto_subtotal: number
          monto_total: number
          notas: string | null
          orden_id: string | null
          proveedor_id: string | null
          tipo_gasto: string | null
          tipo_cambio: number
        }
        Insert: {
          actualizado_en?: string
          categoria: string
          comprobante_ruta?: string | null
          comprobante_url?: string | null
          creado_en?: string
          creado_por: string
          cuenta_bancaria_id?: string | null
          datos_ocr_json?: Json | null
          descripcion: string
          estado_pago?: string
          fecha_gasto?: string
          fecha_vencimiento?: string | null
          folio: string
          folio_comprobante?: string | null
          folio_sii?: string | null
          id?: string
          metodo_pago?: string | null
          moneda?: string
          monto_iva?: number
          monto_subtotal: number
          monto_total: number
          notas?: string | null
          orden_id?: string | null
          proveedor_id?: string | null
          tipo_gasto?: string | null
          tipo_cambio?: number
        }
        Update: {
          actualizado_en?: string
          categoria?: string
          comprobante_ruta?: string | null
          comprobante_url?: string | null
          creado_en?: string
          creado_por?: string
          cuenta_bancaria_id?: string | null
          datos_ocr_json?: Json | null
          descripcion?: string
          estado_pago?: string
          fecha_gasto?: string
          fecha_vencimiento?: string | null
          folio?: string
          folio_comprobante?: string | null
          folio_sii?: string | null
          id?: string
          metodo_pago?: string | null
          moneda?: string
          monto_iva?: number
          monto_subtotal?: number
          monto_total?: number
          notas?: string | null
          orden_id?: string | null
          proveedor_id?: string | null
          tipo_gasto?: string | null
          tipo_cambio?: number
        }
        Relationships: [
          {
            foreignKeyName: "gastos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
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
          correlation_id: string | null
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
          correlation_id?: string | null
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
          correlation_id?: string | null
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
      metas_vendedor: {
        Row: {
          actualizado_en: string
          creado_en: string
          id: string
          mes: string
          meta_mensual_mxn: number
          porcentaje_comision: number
          vendedor_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          mes: string
          meta_mensual_mxn?: number
          porcentaje_comision?: number
          vendedor_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          mes?: string
          meta_mensual_mxn?: number
          porcentaje_comision?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_vendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_proceso_partida: {
        Row: {
          actualizado_en: string
          creado_en: string
          id: string
          meta_piezas: number
          nombre: string
          partida_id: string
          secuencia: number
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          meta_piezas: number
          nombre: string
          partida_id: string
          secuencia: number
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          meta_piezas?: number
          nombre?: string
          partida_id?: string
          secuencia?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_proceso_partida_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
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
          {
            foreignKeyName: "movimientos_inventario_orden_fk"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_saldo_favor: {
        Row: {
          ar_id_origen: string | null
          cliente_id: string
          creado_en: string
          creado_por: string
          descripcion: string
          id: string
          moneda: string
          monto: number
          pago_ar_id: string | null
          tipo: string
        }
        Insert: {
          ar_id_origen?: string | null
          cliente_id: string
          creado_en?: string
          creado_por: string
          descripcion: string
          id?: string
          moneda?: string
          monto: number
          pago_ar_id?: string | null
          tipo: string
        }
        Update: {
          ar_id_origen?: string | null
          cliente_id?: string
          creado_en?: string
          creado_por?: string
          descripcion?: string
          id?: string
          moneda?: string
          monto?: number
          pago_ar_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_saldo_favor_ar_id_origen_fkey"
            columns: ["ar_id_origen"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_saldo_favor_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_saldo_favor_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_saldo_favor_pago_ar_id_fkey"
            columns: ["pago_ar_id"]
            isOneToOne: true
            referencedRelation: "pagos_ar"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_entrega: {
        Row: {
          actualizado_en: string
          creado_en: string
          creado_por: string
          entregado_por_id: string | null
          es_parcial: boolean
          fecha_entrega: string
          firma_cliente_url: string | null
          folio: string
          folio_sii: string | null
          id: string
          orden_id: string
          recibido_por: string
          recibido_por_id: string | null
          solicitud_id: string | null
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por: string
          entregado_por_id?: string | null
          es_parcial?: boolean
          fecha_entrega?: string
          firma_cliente_url?: string | null
          folio: string
          folio_sii?: string | null
          id?: string
          orden_id: string
          recibido_por: string
          recibido_por_id?: string | null
          solicitud_id?: string | null
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string
          entregado_por_id?: string | null
          es_parcial?: boolean
          fecha_entrega?: string
          firma_cliente_url?: string | null
          folio?: string
          folio_sii?: string | null
          id?: string
          orden_id?: string
          recibido_por?: string
          recibido_por_id?: string | null
          solicitud_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_entrega_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_entrega_entregado_por_id_fkey"
            columns: ["entregado_por_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_entrega_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_entrega_recibido_por_id_fkey"
            columns: ["recibido_por_id"]
            isOneToOne: false
            referencedRelation: "contactos_cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones_usuario: {
        Row: {
          creado_en: string
          emisor_id: string | null
          enlace: string | null
          id: string
          leida: boolean
          mensaje: string
          tipo: string
          titulo: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          emisor_id?: string | null
          enlace?: string | null
          id?: string
          leida?: boolean
          mensaje: string
          tipo: string
          titulo: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          emisor_id?: string | null
          enlace?: string | null
          id?: string
          leida?: boolean
          mensaje?: string
          tipo?: string
          titulo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_usuario_emisor_id_fkey"
            columns: ["emisor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_usuario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      operadores_areas: {
        Row: {
          area_codigo: string
          creado_en: string
          creado_por: string | null
          operador_id: string
        }
        Insert: {
          area_codigo: string
          creado_en?: string
          creado_por?: string | null
          operador_id: string
        }
        Update: {
          area_codigo?: string
          creado_en?: string
          creado_por?: string | null
          operador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operadores_areas_area_codigo_fkey"
            columns: ["area_codigo"]
            isOneToOne: false
            referencedRelation: "areas_trabajo_config"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "operadores_areas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operadores_areas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_eventos_cambio: {
        Row: {
          actor_id: string | null
          correlation_id: string | null
          creado_en: string
          detalle: Json
          id: string
          motivo: string | null
          orden_id: string
          tipo: string
        }
        Insert: {
          actor_id?: string | null
          correlation_id?: string | null
          creado_en?: string
          detalle?: Json
          id?: string
          motivo?: string | null
          orden_id: string
          tipo: string
        }
        Update: {
          actor_id?: string | null
          correlation_id?: string | null
          creado_en?: string
          detalle?: Json
          id?: string
          motivo?: string | null
          orden_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "orden_eventos_cambio_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_eventos_cambio_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_produccion: {
        Row: {
          actualizado_en: string
          archivada_en: string | null
          cerrada_admin_en: string | null
          cerrada_admin_por: string | null
          cliente_id: string
          condicion_pago: string | null
          cotizacion_id: string | null
          creado_en: string
          es_interna: boolean
          estado: string
          estado_sii: string
          fecha_compromiso: string
          fecha_compromiso_comercial: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          fecha_operativa: string
          fecha_trabajo: string | null
          folio: string
          folio_sii: string | null
          horas_estimadas: number | null
          id: string
          id_historico: string | null
          monto_iva: number | null
          monto_sin_iva: number | null
          motivo_cancelacion: string | null
          notas: string | null
          orden_origen_id: string | null
          prioridad: string
          propuesta_id: string | null
          propuesta_revision_id: string | null
          referencia_externa: string | null
          rfq_id: string | null
          snapshot_json: Json
        }
        Insert: {
          actualizado_en?: string
          archivada_en?: string | null
          cerrada_admin_en?: string | null
          cerrada_admin_por?: string | null
          cliente_id: string
          condicion_pago?: string | null
          cotizacion_id?: string | null
          creado_en?: string
          es_interna?: boolean
          estado?: string
          estado_sii?: string
          fecha_compromiso: string
          fecha_compromiso_comercial?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fecha_operativa?: string
          fecha_trabajo?: string | null
          folio: string
          folio_sii?: string | null
          horas_estimadas?: number | null
          id?: string
          id_historico?: string | null
          monto_iva?: number | null
          monto_sin_iva?: number | null
          motivo_cancelacion?: string | null
          notas?: string | null
          orden_origen_id?: string | null
          prioridad?: string
          propuesta_id?: string | null
          propuesta_revision_id?: string | null
          referencia_externa?: string | null
          rfq_id?: string | null
          snapshot_json?: Json
        }
        Update: {
          actualizado_en?: string
          archivada_en?: string | null
          cerrada_admin_en?: string | null
          cerrada_admin_por?: string | null
          cliente_id?: string
          condicion_pago?: string | null
          cotizacion_id?: string | null
          creado_en?: string
          es_interna?: boolean
          estado?: string
          estado_sii?: string
          fecha_compromiso?: string
          fecha_compromiso_comercial?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fecha_operativa?: string
          fecha_trabajo?: string | null
          folio?: string
          folio_sii?: string | null
          horas_estimadas?: number | null
          id?: string
          id_historico?: string | null
          monto_iva?: number | null
          monto_sin_iva?: number | null
          motivo_cancelacion?: string | null
          notas?: string | null
          orden_origen_id?: string | null
          prioridad?: string
          propuesta_id?: string | null
          propuesta_revision_id?: string | null
          referencia_externa?: string | null
          rfq_id?: string | null
          snapshot_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_produccion_cerrada_admin_por_fkey"
            columns: ["cerrada_admin_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "ordenes_produccion_orden_origen_id_fkey"
            columns: ["orden_origen_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "propuestas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_propuesta_revision_id_fkey"
            columns: ["propuesta_revision_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_ar: {
        Row: {
          ar_id: string | null
          creado_en: string
          creado_por: string
          cuenta_bancaria_id: string | null
          folio_recibo: string
          id: string
          metodo_pago: string
          moneda_pago: string
          monto_aplicado_ar: number
          monto_pagado: number
          monto_sobrepago_ar: number
          notas: string | null
          referencia_bancaria: string | null
          solicitud_id: string
          tipo_cambio_pago: number
        }
        Insert: {
          ar_id?: string | null
          creado_en?: string
          creado_por: string
          cuenta_bancaria_id?: string | null
          folio_recibo: string
          id?: string
          metodo_pago: string
          moneda_pago: string
          monto_aplicado_ar: number
          monto_pagado: number
          monto_sobrepago_ar?: number
          notas?: string | null
          referencia_bancaria?: string | null
          solicitud_id: string
          tipo_cambio_pago?: number
        }
        Update: {
          ar_id?: string | null
          creado_en?: string
          creado_por?: string
          cuenta_bancaria_id?: string | null
          folio_recibo?: string
          id?: string
          metodo_pago?: string
          moneda_pago?: string
          monto_aplicado_ar?: number
          monto_pagado?: number
          monto_sobrepago_ar?: number
          notas?: string | null
          referencia_bancaria?: string | null
          solicitud_id?: string
          tipo_cambio_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagos_ar_ar_id_fkey"
            columns: ["ar_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_ar_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_ar_cuenta_bancaria_fk"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      partidas_nota_entrega: {
        Row: {
          cantidad_entregada: number
          cantidad_solicitada: number
          codigo_item: string | null
          id: string
          nota_entrega_id: string
          partida_id: string
        }
        Insert: {
          cantidad_entregada: number
          cantidad_solicitada: number
          codigo_item?: string | null
          id?: string
          nota_entrega_id: string
          partida_id: string
        }
        Update: {
          cantidad_entregada?: number
          cantidad_solicitada?: number
          codigo_item?: string | null
          id?: string
          nota_entrega_id?: string
          partida_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partidas_nota_entrega_nota_entrega_id_fkey"
            columns: ["nota_entrega_id"]
            isOneToOne: false
            referencedRelation: "notas_entrega"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidas_nota_entrega_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      partidas_orden_produccion: {
        Row: {
          actualizado_en: string
          area_trabajo_codigo: string | null
          catalogo_material_id: string | null
          cantidad_producida: number
          cantidad_scrap: number
          cantidad_solicitada: number
          codigo_item: string | null
          codigo_pieza: string
          creado_en: string
          descripcion: string | null
          es_externo: boolean
          id: string
          maquina_asignada: string | null
          material_id: string | null
          operador_asignado_id: string | null
          orden_id: string
          procesos: string[]
          propuesta_item_id: string | null
          proveedor_externo: string | null
          tiempo_estimado_minutos: number
          tiempo_real_minutos: number
          unidad_medida: string
        }
        Insert: {
          actualizado_en?: string
          area_trabajo_codigo?: string | null
          catalogo_material_id?: string | null
          cantidad_producida?: number
          cantidad_scrap?: number
          cantidad_solicitada: number
          codigo_item?: string | null
          codigo_pieza: string
          creado_en?: string
          descripcion?: string | null
          es_externo?: boolean
          id?: string
          maquina_asignada?: string | null
          material_id?: string | null
          operador_asignado_id?: string | null
          orden_id: string
          procesos?: string[]
          propuesta_item_id?: string | null
          proveedor_externo?: string | null
          tiempo_estimado_minutos?: number
          tiempo_real_minutos?: number
          unidad_medida: string
        }
        Update: {
          actualizado_en?: string
          area_trabajo_codigo?: string | null
          catalogo_material_id?: string | null
          cantidad_producida?: number
          cantidad_scrap?: number
          cantidad_solicitada?: number
          codigo_item?: string | null
          codigo_pieza?: string
          creado_en?: string
          descripcion?: string | null
          es_externo?: boolean
          id?: string
          maquina_asignada?: string | null
          material_id?: string | null
          operador_asignado_id?: string | null
          orden_id?: string
          procesos?: string[]
          propuesta_item_id?: string | null
          proveedor_externo?: string | null
          tiempo_estimado_minutos?: number
          tiempo_real_minutos?: number
          unidad_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "partidas_orden_produccion_catalogo_material_id_fkey"
            columns: ["catalogo_material_id"]
            isOneToOne: false
            referencedRelation: "catalogo_materiales"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "partidas_orden_produccion_propuesta_item_id_fkey"
            columns: ["propuesta_item_id"]
            isOneToOne: false
            referencedRelation: "propuesta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      permisos: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          descripcion: string
          modulo: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          descripcion: string
          modulo: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          descripcion?: string
          modulo?: string
        }
        Relationships: []
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
          canal: string | null
          canal_detalle: string | null
          cliente_id: string | null
          condiciones_pago: string | null
          contacto_id: string | null
          correo: string | null
          creado_en: string
          descripcion_general: string | null
          empresa: string
          es_orden_interna: boolean
          estado_rfq: string
          etapa: string
          etiquetas: string[]
          fecha_envio_cotizacion: string | null
          fecha_proxima_accion: string | null
          fecha_requerida: string | null
          fecha_seguimiento: string | null
          fecha_solicitud: string | null
          fecha_ultimo_contacto: string | null
          fecha_vencimiento_cotizacion: string | null
          folio_cnc: string | null
          folio_op: string
          folio_rfq: string | null
          horas_estimadas: number | null
          id: string
          iva_porcentaje: number
          moneda: string
          motivo_perdida: string | null
          nombre_contacto: string
          notas: string | null
          notas_perdida: string | null
          po_cliente: string | null
          prioridad: string
          proxima_accion_codigo: string | null
          proxima_accion_texto: string | null
          proximo_paso: string | null
          responsable_id: string | null
          responsable_proxima_accion_id: string | null
          telefono: string | null
          vendedor_id: string
        }
        Insert: {
          actualizado_en?: string
          canal?: string | null
          canal_detalle?: string | null
          cliente_id?: string | null
          condiciones_pago?: string | null
          contacto_id?: string | null
          correo?: string | null
          creado_en?: string
          descripcion_general?: string | null
          empresa: string
          es_orden_interna?: boolean
          estado_rfq?: string
          etapa?: string
          etiquetas?: string[]
          fecha_envio_cotizacion?: string | null
          fecha_proxima_accion?: string | null
          fecha_requerida?: string | null
          fecha_seguimiento?: string | null
          fecha_solicitud?: string | null
          fecha_ultimo_contacto?: string | null
          fecha_vencimiento_cotizacion?: string | null
          folio_cnc?: string | null
          folio_op: string
          folio_rfq?: string | null
          horas_estimadas?: number | null
          id?: string
          iva_porcentaje?: number
          moneda?: string
          motivo_perdida?: string | null
          nombre_contacto: string
          notas?: string | null
          notas_perdida?: string | null
          po_cliente?: string | null
          prioridad?: string
          proxima_accion_codigo?: string | null
          proxima_accion_texto?: string | null
          proximo_paso?: string | null
          responsable_id?: string | null
          responsable_proxima_accion_id?: string | null
          telefono?: string | null
          vendedor_id: string
        }
        Update: {
          actualizado_en?: string
          canal?: string | null
          canal_detalle?: string | null
          cliente_id?: string | null
          condiciones_pago?: string | null
          contacto_id?: string | null
          correo?: string | null
          creado_en?: string
          descripcion_general?: string | null
          empresa?: string
          es_orden_interna?: boolean
          estado_rfq?: string
          etapa?: string
          etiquetas?: string[]
          fecha_envio_cotizacion?: string | null
          fecha_proxima_accion?: string | null
          fecha_requerida?: string | null
          fecha_seguimiento?: string | null
          fecha_solicitud?: string | null
          fecha_ultimo_contacto?: string | null
          fecha_vencimiento_cotizacion?: string | null
          folio_cnc?: string | null
          folio_op?: string
          folio_rfq?: string | null
          horas_estimadas?: number | null
          id?: string
          iva_porcentaje?: number
          moneda?: string
          motivo_perdida?: string | null
          nombre_contacto?: string
          notas?: string | null
          notas_perdida?: string | null
          po_cliente?: string | null
          prioridad?: string
          proxima_accion_codigo?: string | null
          proxima_accion_texto?: string | null
          proximo_paso?: string | null
          responsable_id?: string | null
          responsable_proxima_accion_id?: string | null
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
            foreignKeyName: "pipeline_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "contactos_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_proxima_accion_codigo_fkey"
            columns: ["proxima_accion_codigo"]
            isOneToOne: false
            referencedRelation: "catalogo_proximas_acciones"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "pipeline_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_responsable_proxima_accion_id_fkey"
            columns: ["responsable_proxima_accion_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
      programacion_areas: {
        Row: {
          actualizado_en: string
          creado_en: string
          estado_planeacion: string
          fecha_programada: string
          horas_estimadas: number
          id: string
          orden_id: string
          orden_prioridad: number
          partida_id: string
          recurso_id: string
          secuencia: number
          turno: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          estado_planeacion?: string
          fecha_programada: string
          horas_estimadas: number
          id?: string
          orden_id: string
          orden_prioridad?: number
          partida_id: string
          recurso_id: string
          secuencia?: number
          turno?: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          estado_planeacion?: string
          fecha_programada?: string
          horas_estimadas?: number
          id?: string
          orden_id?: string
          orden_prioridad?: number
          partida_id?: string
          recurso_id?: string
          secuencia?: number
          turno?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacion_areas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacion_areas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacion_areas_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "recursos_planeacion"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_item_operaciones: {
        Row: {
          id: string
          item_id: string
          orden: number
          proceso_id: string
        }
        Insert: {
          id?: string
          item_id: string
          orden?: number
          proceso_id: string
        }
        Update: {
          id?: string
          item_id?: string
          orden?: number
          proceso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_item_operaciones_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "propuesta_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_item_operaciones_proceso_id_fkey"
            columns: ["proceso_id"]
            isOneToOne: false
            referencedRelation: "catalogo_procesos"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_item_ruteo: {
        Row: {
          costeado_en: string | null
          costo_run: number | null
          costo_setup: number | null
          costo_total: number | null
          recurso_id: string | null
          tarifa_fuente: string | null
          tarifa_hora: number | null
          tarifa_moneda: string | null
          grupo_equipo_id: string | null
          grupo_planeado_id: string | null
          id: string
          item_id: string
          proceso_id: string
          requiere_revision: boolean
          run_horas: number
          secuencia: number
          setup_horas: number
          total_horas: number | null
        }
        Insert: {
          costeado_en?: string | null
          costo_run?: number | null
          costo_setup?: number | null
          costo_total?: number | null
          recurso_id?: string | null
          tarifa_fuente?: string | null
          tarifa_hora?: number | null
          tarifa_moneda?: string | null
          grupo_equipo_id?: string | null
          grupo_planeado_id?: string | null
          id?: string
          item_id: string
          proceso_id: string
          requiere_revision?: boolean
          run_horas?: number
          secuencia: number
          setup_horas?: number
          total_horas?: number | null
        }
        Update: {
          costeado_en?: string | null
          costo_run?: number | null
          costo_setup?: number | null
          costo_total?: number | null
          recurso_id?: string | null
          tarifa_fuente?: string | null
          tarifa_hora?: number | null
          tarifa_moneda?: string | null
          grupo_equipo_id?: string | null
          grupo_planeado_id?: string | null
          id?: string
          item_id?: string
          proceso_id?: string
          requiere_revision?: boolean
          run_horas?: number
          secuencia?: number
          setup_horas?: number
          total_horas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_item_ruteo_grupo_equipo_id_fkey"
            columns: ["grupo_equipo_id"]
            isOneToOne: false
            referencedRelation: "grupos_equipo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_item_ruteo_grupo_planeado_id_fkey"
            columns: ["grupo_planeado_id"]
            isOneToOne: false
            referencedRelation: "grupos_planeados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_item_ruteo_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "propuesta_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_item_ruteo_proceso_id_fkey"
            columns: ["proceso_id"]
            isOneToOne: false
            referencedRelation: "catalogo_procesos"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_items: {
        Row: {
          acabado: string | null
          activo: boolean
          actualizado_en: string
          cantidad: number
          codigo: string
          creado_en: string
          descripcion: string
          es_descuento: boolean
          espesor_id: string | null
          id: string
          material_id: string | null
          notas: string | null
          precio_unitario: number
          revision_id: string
          revision_origen_id: string
          rfq_item_id: string | null
        }
        Insert: {
          acabado?: string | null
          activo?: boolean
          actualizado_en?: string
          cantidad: number
          codigo: string
          creado_en?: string
          descripcion: string
          es_descuento?: boolean
          espesor_id?: string | null
          id?: string
          material_id?: string | null
          notas?: string | null
          precio_unitario?: number
          revision_id: string
          revision_origen_id?: string
          rfq_item_id?: string | null
        }
        Update: {
          acabado?: string | null
          activo?: boolean
          actualizado_en?: string
          cantidad?: number
          codigo?: string
          creado_en?: string
          descripcion?: string
          es_descuento?: boolean
          espesor_id?: string | null
          id?: string
          material_id?: string | null
          notas?: string | null
          precio_unitario?: number
          revision_id?: string
          revision_origen_id?: string
          rfq_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_items_espesor_id_fkey"
            columns: ["espesor_id"]
            isOneToOne: false
            referencedRelation: "catalogo_espesores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "catalogo_materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_items_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_items_revision_origen_fkey"
            columns: ["revision_origen_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_items_rfq_item_id_fkey"
            columns: ["rfq_item_id"]
            isOneToOne: false
            referencedRelation: "rfq_items"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_pdfs: {
        Row: {
          archivo_id: string
          contenido_hash: string
          creado_en: string
          generado_por: string
          id: string
          reemplaza_a: string | null
          revision_id: string
          version: number
          vigente: boolean
        }
        Insert: {
          archivo_id: string
          contenido_hash: string
          creado_en?: string
          generado_por: string
          id?: string
          reemplaza_a?: string | null
          revision_id: string
          version?: number
          vigente?: boolean
        }
        Update: {
          archivo_id?: string
          contenido_hash?: string
          creado_en?: string
          generado_por?: string
          id?: string
          reemplaza_a?: string | null
          revision_id?: string
          version?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_pdfs_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_pdfs_generado_por_fkey"
            columns: ["generado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_pdfs_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: false
            referencedRelation: "propuesta_pdfs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_pdfs_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_revision_acciones: {
        Row: {
          canal: string | null
          codigo: string
          creado_en: string
          creado_por: string
          fecha: string | null
          id: string
          nota: string | null
          responsable_id: string | null
          revision_id: string
          texto_otro: string | null
        }
        Insert: {
          canal?: string | null
          codigo: string
          creado_en?: string
          creado_por: string
          fecha?: string | null
          id?: string
          nota?: string | null
          responsable_id?: string | null
          revision_id: string
          texto_otro?: string | null
        }
        Update: {
          canal?: string | null
          codigo?: string
          creado_en?: string
          creado_por?: string
          fecha?: string | null
          id?: string
          nota?: string | null
          responsable_id?: string | null
          revision_id?: string
          texto_otro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_revision_acciones_codigo_fkey"
            columns: ["codigo"]
            isOneToOne: false
            referencedRelation: "catalogo_proximas_acciones"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "propuesta_revision_acciones_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_revision_acciones_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_revision_acciones_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_revision_costos: {
        Row: {
          categoria: string
          id: string
          monto: number
          nota: string | null
          revision_id: string
        }
        Insert: {
          categoria: string
          id?: string
          monto: number
          nota?: string | null
          revision_id: string
        }
        Update: {
          categoria?: string
          id?: string
          monto?: number
          nota?: string | null
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_revision_costos_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_revision_eventos: {
        Row: {
          accion: string
          actor_id: string | null
          canal: string | null
          correlation_id: string | null
          creado_en: string
          destino: string | null
          estado_anterior: string | null
          estado_nuevo: string | null
          id: string
          motivo: string | null
          revision_id: string
        }
        Insert: {
          accion: string
          actor_id?: string | null
          canal?: string | null
          correlation_id?: string | null
          creado_en?: string
          destino?: string | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          motivo?: string | null
          revision_id: string
        }
        Update: {
          accion?: string
          actor_id?: string | null
          canal?: string | null
          correlation_id?: string | null
          creado_en?: string
          destino?: string | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          motivo?: string | null
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_revision_eventos_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_revision_eventos_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      propuesta_revisiones: {
        Row: {
          actualizado_en: string
          canal_envio: string | null
          creado_en: string
          creado_por: string
          destino_envio: string | null
          enviado_en: string | null
          enviado_por: string | null
          estado: string
          folio_revision: string
          id: string
          letra: string
          motivo_creacion: string | null
          propuesta_id: string
          requiere_revision_costeo: boolean
          requiere_revision_ruteo: boolean
          snapshot_cabecera: Json
          validada_en: string | null
          validada_por: string | null
        }
        Insert: {
          actualizado_en?: string
          canal_envio?: string | null
          creado_en?: string
          creado_por: string
          destino_envio?: string | null
          enviado_en?: string | null
          enviado_por?: string | null
          estado?: string
          folio_revision: string
          id?: string
          letra: string
          motivo_creacion?: string | null
          propuesta_id: string
          requiere_revision_costeo?: boolean
          requiere_revision_ruteo?: boolean
          snapshot_cabecera?: Json
          validada_en?: string | null
          validada_por?: string | null
        }
        Update: {
          actualizado_en?: string
          canal_envio?: string | null
          creado_en?: string
          creado_por?: string
          destino_envio?: string | null
          enviado_en?: string | null
          enviado_por?: string | null
          estado?: string
          folio_revision?: string
          id?: string
          letra?: string
          motivo_creacion?: string | null
          propuesta_id?: string
          requiere_revision_costeo?: boolean
          requiere_revision_ruteo?: boolean
          snapshot_cabecera?: Json
          validada_en?: string | null
          validada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propuesta_revisiones_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_revisiones_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_revisiones_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "propuestas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuesta_revisiones_validada_por_fkey"
            columns: ["validada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      propuestas: {
        Row: {
          accepted_revision_id: string | null
          actualizado_en: string
          cliente_id: string
          creado_en: string
          creado_por: string
          estado: string
          folio_cnc: string
          id: string
          responsable_id: string
          revision_vigente_id: string | null
          rfq_id: string
        }
        Insert: {
          accepted_revision_id?: string | null
          actualizado_en?: string
          cliente_id: string
          creado_en?: string
          creado_por: string
          estado?: string
          folio_cnc: string
          id?: string
          responsable_id: string
          revision_vigente_id?: string | null
          rfq_id: string
        }
        Update: {
          accepted_revision_id?: string | null
          actualizado_en?: string
          cliente_id?: string
          creado_en?: string
          creado_por?: string
          estado?: string
          folio_cnc?: string
          id?: string
          responsable_id?: string
          revision_vigente_id?: string | null
          rfq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_accepted_revision_fk"
            columns: ["accepted_revision_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_revision_vigente_fk"
            columns: ["revision_vigente_id"]
            isOneToOne: false
            referencedRelation: "propuesta_revisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
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
      recursos_planeacion: {
        Row: {
          tarifa_override_activa: boolean
          tarifa_override_hora: number | null
          tarifa_override_moneda: string | null
          activo: boolean
          actualizado_en: string
          area: string
          capacidad_jornada_override_horas: number | null
          cantidad_equipos: number
          codigo: string
          costo_hora_interno: number
          creado_en: string
          grupo_equipo_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          tarifa_override_activa?: boolean
          tarifa_override_hora?: number | null
          tarifa_override_moneda?: string | null
          activo?: boolean
          actualizado_en?: string
          area: string
          capacidad_jornada_override_horas?: number | null
          cantidad_equipos?: number
          codigo: string
          costo_hora_interno?: number
          creado_en?: string
          grupo_equipo_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          tarifa_override_activa?: boolean
          tarifa_override_hora?: number | null
          tarifa_override_moneda?: string | null
          activo?: boolean
          actualizado_en?: string
          area?: string
          capacidad_jornada_override_horas?: number | null
          cantidad_equipos?: number
          codigo?: string
          costo_hora_interno?: number
          creado_en?: string
          grupo_equipo_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "recursos_planeacion_grupo_equipo_id_fkey"
            columns: ["grupo_equipo_id"]
            isOneToOne: false
            referencedRelation: "grupos_equipo"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_avance_partida: {
        Row: {
          cantidad_producida: number
          cantidad_scrap: number
          creado_en: string
          id: string
          meta_proceso_id: string | null
          operador_id: string
          partida_id: string
          sesion_trabajo_id: string | null
        }
        Insert: {
          cantidad_producida?: number
          cantidad_scrap?: number
          creado_en?: string
          id?: string
          meta_proceso_id?: string | null
          operador_id: string
          partida_id: string
          sesion_trabajo_id?: string | null
        }
        Update: {
          cantidad_producida?: number
          cantidad_scrap?: number
          creado_en?: string
          id?: string
          meta_proceso_id?: string | null
          operador_id?: string
          partida_id?: string
          sesion_trabajo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_avance_partida_meta_proceso_id_fkey"
            columns: ["meta_proceso_id"]
            isOneToOne: false
            referencedRelation: "metas_proceso_partida"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "registros_avance_partida_sesion_trabajo_id_fkey"
            columns: ["sesion_trabajo_id"]
            isOneToOne: false
            referencedRelation: "sesiones_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_consumo_material: {
        Row: {
          actor_id: string | null
          cantidad_scrap: number
          cantidad_usada: number
          catalogo_material_id: string | null
          costo_unitario_origen: number | null
          costo_unitario_momento: number
          creado_en: string
          id: string
          material_id: string | null
          moneda_costo: string | null
          origen: string
          partida_id: string
          tipo_cambio: number | null
          unidad_base: string | null
        }
        Insert: {
          actor_id?: string | null
          cantidad_scrap?: number
          cantidad_usada?: number
          catalogo_material_id?: string | null
          costo_unitario_origen?: number | null
          costo_unitario_momento: number
          creado_en?: string
          id?: string
          material_id?: string | null
          moneda_costo?: string | null
          origen?: string
          partida_id: string
          tipo_cambio?: number | null
          unidad_base?: string | null
        }
        Update: {
          actor_id?: string | null
          cantidad_scrap?: number
          cantidad_usada?: number
          catalogo_material_id?: string | null
          costo_unitario_origen?: number | null
          costo_unitario_momento?: number
          creado_en?: string
          id?: string
          material_id?: string | null
          moneda_costo?: string | null
          origen?: string
          partida_id?: string
          tipo_cambio?: number | null
          unidad_base?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_consumo_material_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_consumo_material_catalogo_material_id_fkey"
            columns: ["catalogo_material_id"]
            isOneToOne: false
            referencedRelation: "catalogo_materiales"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "reservas_material_orden_fk"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      reversos_pago_ar: {
        Row: {
          ar_id: string | null
          creado_en: string
          creado_por: string | null
          id: string
          monedero_revertido_mxn: number
          monto_aplicado_reverso: number
          monto_sobrepago_reverso: number
          motivo: string
          pago_id: string
        }
        Insert: {
          ar_id?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          monedero_revertido_mxn?: number
          monto_aplicado_reverso: number
          monto_sobrepago_reverso?: number
          motivo: string
          pago_id: string
        }
        Update: {
          ar_id?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          monedero_revertido_mxn?: number
          monto_aplicado_reverso?: number
          monto_sobrepago_reverso?: number
          motivo?: string
          pago_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reversos_pago_ar_ar_id_fkey"
            columns: ["ar_id"]
            isOneToOne: false
            referencedRelation: "cuentas_por_cobrar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversos_pago_ar_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversos_pago_ar_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: true
            referencedRelation: "pagos_ar"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_eventos: {
        Row: {
          accion: string
          actor_id: string | null
          correlation_id: string | null
          creado_en: string
          estado_anterior: string | null
          estado_nuevo: string | null
          id: string
          motivo: string | null
          rfq_id: string
        }
        Insert: {
          accion: string
          actor_id?: string | null
          correlation_id?: string | null
          creado_en?: string
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          motivo?: string | null
          rfq_id: string
        }
        Update: {
          accion?: string
          actor_id?: string | null
          correlation_id?: string | null
          creado_en?: string
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          motivo?: string | null
          rfq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_eventos_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_eventos_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_item_operaciones: {
        Row: {
          id: string
          orden: number
          proceso_id: string
          rfq_item_id: string
        }
        Insert: {
          id?: string
          orden?: number
          proceso_id: string
          rfq_item_id: string
        }
        Update: {
          id?: string
          orden?: number
          proceso_id?: string
          rfq_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_item_operaciones_proceso_id_fkey"
            columns: ["proceso_id"]
            isOneToOne: false
            referencedRelation: "catalogo_procesos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_item_operaciones_rfq_item_id_fkey"
            columns: ["rfq_item_id"]
            isOneToOne: false
            referencedRelation: "rfq_items"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_items: {
        Row: {
          acabado: string | null
          actualizado_en: string
          cantidad: number
          codigo: string
          creado_en: string
          descripcion: string
          espesor_id: string | null
          estado: string
          id: string
          material_id: string | null
          notas: string | null
          numero: number
          rfq_id: string
        }
        Insert: {
          acabado?: string | null
          actualizado_en?: string
          cantidad: number
          codigo: string
          creado_en?: string
          descripcion: string
          espesor_id?: string | null
          estado?: string
          id?: string
          material_id?: string | null
          notas?: string | null
          numero: number
          rfq_id: string
        }
        Update: {
          acabado?: string | null
          actualizado_en?: string
          cantidad?: number
          codigo?: string
          creado_en?: string
          descripcion?: string
          espesor_id?: string | null
          estado?: string
          id?: string
          material_id?: string | null
          notas?: string | null
          numero?: number
          rfq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_items_espesor_id_fkey"
            columns: ["espesor_id"]
            isOneToOne: false
            referencedRelation: "catalogo_espesores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "catalogo_materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_items_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_versiones: {
        Row: {
          actor_id: string | null
          causa: string
          correlation_id: string | null
          creado_en: string
          id: string
          numero: number
          rfq_id: string
          snapshot_cabecera: Json
          snapshot_items: Json
        }
        Insert: {
          actor_id?: string | null
          causa: string
          correlation_id?: string | null
          creado_en?: string
          id?: string
          numero: number
          rfq_id: string
          snapshot_cabecera: Json
          snapshot_items: Json
        }
        Update: {
          actor_id?: string | null
          causa?: string
          correlation_id?: string | null
          creado_en?: string
          id?: string
          numero?: number
          rfq_id?: string
          snapshot_cabecera?: Json
          snapshot_items?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rfq_versiones_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_versiones_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_orden: {
        Row: {
          actualizado_en: string
          causa_codigo: string | null
          causa_detalle: string | null
          creado_en: string
          creado_por: string | null
          estado: string
          fecha_compromiso_comercial: string
          id: string
          intentos: number
          orden_id: string | null
          propuesta_id: string
          revision_id: string
          ultimo_intento_por: string | null
        }
        Insert: {
          actualizado_en?: string
          causa_codigo?: string | null
          causa_detalle?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          fecha_compromiso_comercial: string
          id?: string
          intentos?: number
          orden_id?: string | null
          propuesta_id: string
          revision_id: string
          ultimo_intento_por?: string | null
        }
        Update: {
          actualizado_en?: string
          causa_codigo?: string | null
          causa_detalle?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          fecha_compromiso_comercial?: string
          id?: string
          intentos?: number
          orden_id?: string | null
          propuesta_id?: string
          revision_id?: string
          ultimo_intento_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_orden_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      sesiones_trabajo: {
        Row: {
          actualizado_en: string
          corrida_id: string | null
          costo_hora_interno: number
          creado_en: string
          estado_sesion: string
          fecha_fin: string | null
          fecha_inicio: string
          horas_brutas: number
          horas_netas: number
          id: string
          motivo_pausa: string | null
          motivo_pausa_codigo: string | null
          motivo_pausa_nota: string | null
          notas: string | null
          operador_id: string
          orden_id: string
          partida_id: string
          piezas_producidas: number
          programacion_id: string
          recurso_liberado: boolean
          verificacion_inicio: Json | null
        }
        Insert: {
          actualizado_en?: string
          corrida_id?: string | null
          costo_hora_interno?: number
          creado_en?: string
          estado_sesion?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          horas_brutas?: number
          horas_netas?: number
          id?: string
          motivo_pausa?: string | null
          motivo_pausa_codigo?: string | null
          motivo_pausa_nota?: string | null
          notas?: string | null
          operador_id: string
          orden_id: string
          partida_id: string
          piezas_producidas?: number
          programacion_id: string
          recurso_liberado?: boolean
          verificacion_inicio?: Json | null
        }
        Update: {
          actualizado_en?: string
          corrida_id?: string | null
          costo_hora_interno?: number
          creado_en?: string
          estado_sesion?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          horas_brutas?: number
          horas_netas?: number
          id?: string
          motivo_pausa?: string | null
          motivo_pausa_codigo?: string | null
          motivo_pausa_nota?: string | null
          notas?: string | null
          operador_id?: string
          orden_id?: string
          partida_id?: string
          piezas_producidas?: number
          programacion_id?: string
          recurso_liberado?: boolean
          verificacion_inicio?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sesiones_trabajo_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: false
            referencedRelation: "corridas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_trabajo_motivo_pausa_codigo_fkey"
            columns: ["motivo_pausa_codigo"]
            isOneToOne: false
            referencedRelation: "catalogo_motivos_pausa"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "sesiones_trabajo_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_trabajo_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_trabajo_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_trabajo_programacion_id_fkey"
            columns: ["programacion_id"]
            isOneToOne: false
            referencedRelation: "programacion_areas"
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
          pin_cambiado_en: string | null
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
          pin_cambiado_en?: string | null
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
          pin_cambiado_en?: string | null
          pin_operador?: string | null
          rol?: string
          ultimo_login_at?: string | null
        }
        Relationships: []
      }
      catalogo_canales: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          es_otro: boolean
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          es_otro?: boolean
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          es_otro?: boolean
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      catalogo_materiales: {
        Row: {
          activo: boolean
          actualizado_en: string
          codigo: string
          costo_confirmado_en: string | null
          costo_confirmado_por: string | null
          costo_vigente: number | null
          creado_en: string
          fecha_vigencia_costo: string | null
          id: string
          material_legacy_id: string | null
          metadata: Json
          moneda_costo: string
          nombre: string
          orden: number
          unidad_base: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          codigo: string
          costo_confirmado_en?: string | null
          costo_confirmado_por?: string | null
          costo_vigente?: number | null
          creado_en?: string
          fecha_vigencia_costo?: string | null
          id?: string
          material_legacy_id?: string | null
          metadata?: Json
          moneda_costo?: string
          nombre: string
          orden?: number
          unidad_base?: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          codigo?: string
          costo_confirmado_en?: string | null
          costo_confirmado_por?: string | null
          costo_vigente?: number | null
          creado_en?: string
          fecha_vigencia_costo?: string | null
          id?: string
          material_legacy_id?: string | null
          metadata?: Json
          moneda_costo?: string
          nombre?: string
          orden?: number
          unidad_base?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_materiales_costo_confirmado_por_fkey"
            columns: ["costo_confirmado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_materiales_material_legacy_id_fkey"
            columns: ["material_legacy_id"]
            isOneToOne: true
            referencedRelation: "materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_costos_material: {
        Row: {
          actor_id: string
          confirmado_en: string
          costo_anterior: number | null
          costo_nuevo: number
          fecha_efectiva: string
          fuente: string
          id: string
          material_id: string
          moneda_anterior: string | null
          moneda_nueva: string
          propuesta_id: string | null
          referencia: string | null
        }
        Insert: {
          actor_id: string
          confirmado_en?: string
          costo_anterior?: number | null
          costo_nuevo: number
          fecha_efectiva: string
          fuente: string
          id?: string
          material_id: string
          moneda_anterior?: string | null
          moneda_nueva: string
          propuesta_id?: string | null
          referencia?: string | null
        }
        Update: {
          actor_id?: string
          confirmado_en?: string
          costo_anterior?: number | null
          costo_nuevo?: number
          fecha_efectiva?: string
          fuente?: string
          id?: string
          material_id?: string
          moneda_anterior?: string | null
          moneda_nueva?: string
          propuesta_id?: string | null
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historial_costos_material_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_costos_material_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "catalogo_materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_costos_material_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "propuestas_costo_material"
            referencedColumns: ["id"]
          },
        ]
      }
      propuestas_costo_material: {
        Row: {
          confirmado_en: string | null
          confirmado_por: string | null
          costo_propuesto: number
          estado: string
          fecha_efectiva: string
          fuente: string
          id: string
          material_id: string
          moneda: string
          propuesto_en: string
          propuesto_por: string
          referencia: string
        }
        Insert: {
          confirmado_en?: string | null
          confirmado_por?: string | null
          costo_propuesto: number
          estado?: string
          fecha_efectiva: string
          fuente: string
          id?: string
          material_id: string
          moneda: string
          propuesto_en?: string
          propuesto_por: string
          referencia: string
        }
        Update: {
          confirmado_en?: string | null
          confirmado_por?: string | null
          costo_propuesto?: number
          estado?: string
          fecha_efectiva?: string
          fuente?: string
          id?: string
          material_id?: string
          moneda?: string
          propuesto_en?: string
          propuesto_por?: string
          referencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_costo_material_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_costo_material_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "catalogo_materiales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_costo_material_propuesto_por_fkey"
            columns: ["propuesto_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_espesores: {
        Row: {
          activo: boolean
          creado_en: string
          espesor_mm: number
          etiqueta: string
          id: string
          material_id: string
          orden: number
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          espesor_mm: number
          etiqueta: string
          id?: string
          material_id: string
          orden?: number
        }
        Update: {
          activo?: boolean
          creado_en?: string
          espesor_mm?: number
          etiqueta?: string
          id?: string
          material_id?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_espesores_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "catalogo_materiales"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_procesos: {
        Row: {
          activo: boolean
          area_trabajo_codigo: string | null
          codigo: string
          creado_en: string
          grupo_planeado_id: string | null
          id: string
          intervalo_inspeccion_lote: number | null
          nombre: string
          orden: number
          prefijo_corrida: string
          requiere_archivo_tecnico: boolean
          requiere_primera_pieza: boolean
        }
        Insert: {
          activo?: boolean
          area_trabajo_codigo?: string | null
          codigo: string
          creado_en?: string
          grupo_planeado_id?: string | null
          id?: string
          intervalo_inspeccion_lote?: number | null
          nombre: string
          orden?: number
          prefijo_corrida: string
          requiere_archivo_tecnico?: boolean
          requiere_primera_pieza?: boolean
        }
        Update: {
          activo?: boolean
          area_trabajo_codigo?: string | null
          codigo?: string
          creado_en?: string
          grupo_planeado_id?: string | null
          id?: string
          intervalo_inspeccion_lote?: number | null
          nombre?: string
          orden?: number
          prefijo_corrida?: string
          requiere_archivo_tecnico?: boolean
          requiere_primera_pieza?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_procesos_area_trabajo_codigo_fkey"
            columns: ["area_trabajo_codigo"]
            isOneToOne: false
            referencedRelation: "areas_trabajo_config"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "catalogo_procesos_grupo_planeado_id_fkey"
            columns: ["grupo_planeado_id"]
            isOneToOne: false
            referencedRelation: "grupos_planeados"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_proximas_acciones: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          es_otro: boolean
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          es_otro?: boolean
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          es_otro?: boolean
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      grupos_equipo: {
        Row: {
          tarifa_hora: number | null
          tarifa_moneda: string
          activo: boolean
          codigo: string
          creado_en: string
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          tarifa_hora?: number | null
          tarifa_moneda?: string
          activo?: boolean
          codigo: string
          creado_en?: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          tarifa_hora?: number | null
          tarifa_moneda?: string
          activo?: boolean
          codigo?: string
          creado_en?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      grupos_planeados: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      versiones_catalogo: {
        Row: {
          actor_id: string | null
          creado_en: string
          datos: Json
          entidad: string
          entidad_id: string
          id: string
          version: number
        }
        Insert: {
          actor_id?: string | null
          creado_en?: string
          datos: Json
          entidad: string
          entidad_id: string
          id?: string
          version: number
        }
        Update: {
          actor_id?: string | null
          creado_en?: string
          datos?: Json
          entidad?: string
          entidad_id?: string
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "versiones_catalogo_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      autorizaciones_hora_extra: {
        Row: {
          autorizado_por: string
          creado_en: string
          estado: string
          horas_autorizadas: number
          id: string
          motivo: string
          orden_id: string
          sesion_id: string | null
        }
        Insert: {
          autorizado_por: string
          creado_en?: string
          estado?: string
          horas_autorizadas: number
          id?: string
          motivo: string
          orden_id: string
          sesion_id?: string | null
        }
        Update: {
          autorizado_por?: string
          creado_en?: string
          estado?: string
          horas_autorizadas?: number
          id?: string
          motivo?: string
          orden_id?: string
          sesion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autorizaciones_hora_extra_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizaciones_hora_extra_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizaciones_hora_extra_sesion_id_fkey"
            columns: ["sesion_id"]
            isOneToOne: false
            referencedRelation: "sesiones_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_motivos_pausa: {
        Row: {
          activo: boolean
          codigo: string
          libera_maquina: boolean
          nombre: string
          orden: number
          requiere_nota: boolean
        }
        Insert: {
          activo?: boolean
          codigo: string
          libera_maquina?: boolean
          nombre: string
          orden?: number
          requiere_nota?: boolean
        }
        Update: {
          activo?: boolean
          codigo?: string
          libera_maquina?: boolean
          nombre?: string
          orden?: number
          requiere_nota?: boolean
        }
        Relationships: []
      }
      corrida_items: {
        Row: {
          cantidad: number
          codigo_item: string
          corrida_id: string
          id: string
          partida_id: string
        }
        Insert: {
          cantidad: number
          codigo_item: string
          corrida_id: string
          id?: string
          partida_id: string
        }
        Update: {
          cantidad?: number
          codigo_item?: string
          corrida_id?: string
          id?: string
          partida_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrida_items_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: false
            referencedRelation: "corridas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrida_items_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      corridas: {
        Row: {
          actualizado_en: string
          cantidad_planificada: number
          codigo: string
          corrida_origen_id: string | null
          creado_en: string
          creado_por: string
          estado: string
          id: string
          orden_id: string
          proceso_id: string
        }
        Insert: {
          actualizado_en?: string
          cantidad_planificada: number
          codigo: string
          corrida_origen_id?: string | null
          creado_en?: string
          creado_por: string
          estado?: string
          id?: string
          orden_id: string
          proceso_id: string
        }
        Update: {
          actualizado_en?: string
          cantidad_planificada?: number
          codigo?: string
          corrida_origen_id?: string | null
          creado_en?: string
          creado_por?: string
          estado?: string
          id?: string
          orden_id?: string
          proceso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corridas_corrida_origen_id_fkey"
            columns: ["corrida_origen_id"]
            isOneToOne: false
            referencedRelation: "corridas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corridas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corridas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corridas_proceso_id_fkey"
            columns: ["proceso_id"]
            isOneToOne: false
            referencedRelation: "catalogo_procesos"
            referencedColumns: ["id"]
          },
        ]
      }
      inspecciones_calidad: {
        Row: {
          cantidad_inspeccionada: number
          cantidad_nok: number
          cantidad_ok: number
          cantidad_retrabajo: number
          codigo_item: string
          corrida_id: string | null
          creado_en: string
          id: string
          liberado_por: string
          material_usado: Json
          observaciones: string | null
          orden_id: string
          partida_id: string | null
          referencia: number | null
          resultado: string
          tipo: string
          tolerancias: Json
        }
        Insert: {
          cantidad_inspeccionada?: number
          cantidad_nok?: number
          cantidad_ok?: number
          cantidad_retrabajo?: number
          codigo_item: string
          corrida_id?: string | null
          creado_en?: string
          id?: string
          liberado_por: string
          material_usado?: Json
          observaciones?: string | null
          orden_id: string
          partida_id?: string | null
          referencia?: number | null
          resultado: string
          tipo: string
          tolerancias?: Json
        }
        Update: {
          cantidad_inspeccionada?: number
          cantidad_nok?: number
          cantidad_ok?: number
          cantidad_retrabajo?: number
          codigo_item?: string
          corrida_id?: string | null
          creado_en?: string
          id?: string
          liberado_por?: string
          material_usado?: Json
          observaciones?: string | null
          orden_id?: string
          partida_id?: string | null
          referencia?: number | null
          resultado?: string
          tipo?: string
          tolerancias?: Json
        }
        Relationships: [
          {
            foreignKeyName: "inspecciones_calidad_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: false
            referencedRelation: "corridas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecciones_calidad_liberado_por_fkey"
            columns: ["liberado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecciones_calidad_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecciones_calidad_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_orden_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      guardar_operador_admin: {
        Args: {
          p_actor_id: string
          p_operador_id: string
          p_nombre: string
          p_pin: string | null
          p_activo: boolean
        }
        Returns: undefined
      }
      abrir_ar_excepcion_entregada: {
        Args: {
          p_orden_id: string
          p_monto_total: number
          p_moneda: string
          p_tipo_cambio_origen: number
          p_fecha_vencimiento: string
          p_folio_factura: string
          p_actor_id: string
        }
        Returns: {
          cuenta_id: string
          cliente_id: string
          referencia_interna: string
        }[]
      }
      abrir_cuenta_por_cobrar: {
        Args: {
          p_fecha_vencimiento: string
          p_folio_factura_remision?: string
          p_moneda: string
          p_monto_total: number
          p_orden_id: string
          p_tipo_cambio_origen: number
        }
        Returns: {
          cliente_id: string
          estado: string
          id: string
          moneda: string
          saldo_pendiente: number
        }[]
      }
      activar_modo_preparacion: {
        Args: { p_actualizado_en_esperado: string; p_programacion_id: string }
        Returns: {
          actualizado_en: string
          estado_planeacion: string
          id: string
        }[]
      }
      actualizar_configuracion_seccion: {
        Args: {
          p_actualizado_por: string
          p_datos: Json
          p_seccion: string
          p_valor: number
        }
        Returns: Json
      }
      aplicar_saldo_favor_ar: {
        Args: {
          p_ar_id: string
          p_cliente_id: string
          p_monto_mxn: number
          p_solicitud_id: string
          p_usuario_id: string
        }
        Returns: {
          ar_id: string
          estado_ar: string
          folio_recibo: string
          idempotente: boolean
          monto_aplicado_ar: number
          pago_id: string
          saldo_a_favor_mxn: number
          saldo_pendiente: number
        }[]
      }
      aprobar_oportunidad_y_crear_orden:
        | {
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
        | {
            Args: {
              p_actor_id: string
              p_autorizar_sobregiro: boolean
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
      configurar_metas_proceso_partida: {
        Args: {
          p_actor_id: string
          p_orden_actualizado_en: string
          p_partida_id: string
          p_procesos: Json
        }
        Returns: {
          orden_actualizado_en: string
          partida_id: string
        }[]
      }
      cambiar_estado_gasto: {
        Args: {
          p_estado_esperado?: string
          p_gasto_id: string
          p_nuevo_estado: string
          p_usuario_id: string
        }
        Returns: {
          actualizado_en: string
          categoria: string
          comprobante_url: string | null
          creado_en: string
          creado_por: string
          datos_ocr_json: Json | null
          descripcion: string
          estado_pago: string
          fecha_gasto: string
          fecha_vencimiento: string | null
          folio: string
          folio_comprobante: string | null
          id: string
          metodo_pago: string | null
          moneda: string
          monto_iva: number
          monto_subtotal: number
          monto_total: number
          notas: string | null
          orden_id: string | null
          proveedor_id: string | null
          tipo_cambio: number
        }[]
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      actualizar_orden_borrador: {
        Args: {
          p_actualizado_en: string
          p_fecha_compromiso: string
          p_orden_id: string
          p_partidas: Json
          p_prioridad: string
        }
        Returns: {
          actualizado_en: string
          estado: string
          fecha_compromiso: string
          folio: string
          id: string
          prioridad: string
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
      cerrar_sesion_trabajo_operador: {
        Args: {
          p_estado_destino: string
          p_meta_proceso_id?: string
          p_motivo_pausa?: string
          p_notas?: string
          p_operador_id: string
          p_piezas_producidas: number
          p_sesion_id: string
        }
        Returns: {
          actualizado_en: string
          cantidad_producida_partida: number
          estado_orden: string
          estado_planeacion: string
          estado_sesion: string
          horas_brutas: number
          horas_netas: number
          id: string
          piezas_producidas: number
        }[]
      }
      consultar_bancos_cobranza: {
        Args: { p_cuenta_id?: string; p_desde?: number; p_moneda?: string }
        Returns: {
          banco: string
          id: string
          moneda: string
          numero_cuenta_enmascarado: string
          titular: string
        }[]
      }
      crear_orden_historica: {
        Args: {
          p_actor_id: string
          p_cliente_id: string
          p_condicion_pago: string
          p_fecha_compromiso: string
          p_fecha_trabajo: string
          p_horas_estimadas: number
          p_id_historico: string
          p_monto_iva: number
          p_monto_sin_iva: number
          p_notas: string
          p_partidas: Json
          p_referencia_externa: string
        }
        Returns: {
          cuenta_id: string
          folio: string
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
      cambiar_estado_cliente: {
        Args: {
          p_actualizado_en: string
          p_actor: string
          p_cliente_id: string
          p_motivo: string
          p_nuevo_estado: string
        }
        Returns: Json
      }
      crear_cliente_con_contacto: {
        Args: { p_actor: string; p_datos: Json }
        Returns: Json
      }
      desactivar_contacto_cliente: {
        Args: {
          p_actualizado_en: string
          p_actor: string
          p_cliente_id: string
          p_contacto_id: string
          p_motivo: string
        }
        Returns: Json
      }
      generar_folio_cliente: { Args: never; Returns: string }
      marcar_contacto_principal: {
        Args: { p_actor: string; p_cliente_id: string; p_contacto_id: string }
        Returns: Json
      }
      reactivar_contacto_cliente: {
        Args: { p_actor: string; p_cliente_id: string; p_contacto_id: string }
        Returns: Json
      }
      enviar_revision: {
        Args: {
          p_actor: string
          p_canal: string
          p_correlation_id?: string
          p_destino: string
          p_revision_id: string
        }
        Returns: Json
      }
      es_admin: { Args: never; Returns: boolean }
      obtener_actividad: {
        Args: {
          p_accion?: string
          p_actor_id: string
          p_actor_texto?: string
          p_cursor_creado?: string
          p_cursor_id?: string
          p_desde?: string
          p_hasta?: string
          p_limite?: number
          p_modulo?: string
          p_recurso_id?: string
          p_usuario_id?: string
        }
        Returns: {
          accion: string
          contexto: Json
          correlation_id: string
          creado_en: string
          entidad: string
          hay_mas: boolean
          id: string
          modulo: string
          nombre_usuario: string
          recurso_etiqueta: string
          recurso_id: string
          rol: string
        }[]
      }
      actualizar_permisos_rol: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_permisos: string[]
          p_permisos_esperados: string[]
          p_rol: string
        }
        Returns: number
      }
      cambiar_estado_usuario: {
        Args: {
          p_activo: boolean
          p_actor_id: string
          p_correlation_id?: string
          p_motivo: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      cambiar_rol_usuario: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_motivo: string
          p_rol: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      ajustar_continuidad_folio_cnc: {
        Args: { p_periodo: string; p_ultimo: number; p_actor_id: string }
        Returns: number
      }
      consultar_continuidad_folio_cnc: {
        Args: { p_periodo: string; p_actor_id: string }
        Returns: {
          ultimo_contador: number
          ultimo_emitido: number
          siguiente: number | null
        }[]
      }
      generar_folio_cnc: { Args: never; Returns: string }
      generar_folio_gasto: { Args: { p_prefijo?: string }; Returns: string }
      generar_folio_inventario: { Args: { p_prefijo: string }; Returns: string }
      generar_folio_nota_entrega: {
        Args: { p_prefijo?: string }
        Returns: string
      }
      generar_folio_op: { Args: never; Returns: string }
      generar_folio_orden: { Args: { p_prefijo: string }; Returns: string }
      generar_folio_recibo: { Args: { p_prefijo?: string }; Returns: string }
      generar_nota_entrega: {
        Args: {
          p_creado_por: string
          p_firma_cliente_url: string
          p_orden_id: string
          p_partidas: Json
          p_recibido_por: string
        }
        Returns: {
          creado_en: string
          es_parcial: boolean
          folio: string
          id: string
        }[]
      }
      guardar_cotizacion_atomica: {
        Args: {
          p_actualizado_en_esperado?: string
          p_lineas: Json
          p_pipeline_id: string
        }
        Returns: {
          actualizado_en: string
          lineas_guardadas: number
          pipeline_id: string
        }[]
      }
      iniciar_sesion_trabajo_operador: {
        Args: {
          p_corrida_id?: string | null
          p_operador_id: string
          p_orden_id: string
          p_partida_id: string
          p_programacion_id: string
          p_verificacion?: Json | null
        }
        Returns: {
          actualizado_en: string
          creado_en: string
          estado_sesion: string
          fecha_inicio: string
          id: string
          operador_id: string
          orden_id: string
          partida_id: string
          programacion_id: string
        }[]
      }
      obtener_carga_capacidad_diaria: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: {
          area: string
          fecha_programada: string
          horas_capacidad: number
          horas_disponibles: number
          horas_programadas: number
          porcentaje_ocupacion: number
          recurso_id: string
          sobrecargado: boolean
          turno: string
        }[]
      }
      obtener_metricas_contador: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: Json
      }
      obtener_costo_ti_periodo: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: Json
      }
      obtener_desglose_rentabilidad_orden: {
        Args: { p_orden_id: string }
        Returns: {
          concepto: string
          horas_estimadas: number
          horas_reales: number
          importe: number
          nota: string
          referencia: string
          rubro: string
          tarifa_hora: number
        }[]
      }
      obtener_metricas_dashboard_ejecutivo: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: Json
      }
      obtener_metricas_pipeline_equipo: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: Json
      }
      obtener_metricas_vendedor: {
        Args: {
          p_fecha_fin: string
          p_fecha_inicio: string
          p_usuario_id: string
        }
        Returns: Json
      }
      obtener_ar_ordenes_canceladas_con_cobranza: {
        Args: Record<PropertyKey, never>
        Returns: {
          aplicaciones_saldo: number
          cliente_id: string
          cobrado_moneda_cuenta: number
          cuenta_id: string
          estado_cuenta: string
          folio: string
          moneda: string
          monto_total: number
          orden_id: string
          pagos: number
          saldo_pendiente: number
        }[]
      }
      obtener_rentabilidad_orden: {
        Args: { p_orden_id: string }
        Returns: {
          costo_gastos_directos_mxn: number
          costo_mano_obra_mxn: number
          costo_materiales_mxn: number
          costo_total_mxn: number
          cuentas_sin_desglose: number
          gastos_considerados: number
          gastos_excluidos: number
          gastos_incluidos_en_rubros: number
          margen_calculable: boolean
          margen_porcentaje: number | null
          materiales_considerados: number
          monto_iva_mxn: number | null
          monto_venta_facturado_mxn: number
          monto_venta_mxn: number | null
          orden_id: string
          sesiones_consideradas: number
          sesiones_sin_tarifa: number
          utilidad_bruta_mxn: number | null
          venta_desglose_conocido: boolean
        }[]
      }
      programar_partida_recurso: {
        Args: {
          p_fecha_programada: string
          p_horas_estimadas: number
          p_orden_id: string
          p_orden_prioridad?: number
          p_partida_id: string
          p_recurso_id: string
          p_secuencia: number
          p_turno: string
        }
        Returns: {
          actualizado_en: string
          estado_planeacion: string
          id: string
        }[]
      }
      programar_partida_recurso_auditada: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_fecha_programada: string
          p_horas_estimadas: number
          p_orden_id: string
          p_orden_prioridad: number
          p_partida_id: string
          p_recurso_id: string
          p_secuencia: number
          p_turno: string
        }
        Returns: {
          actualizado_en: string
          estado_planeacion: string
          id: string
        }[]
      }
      reemplazar_areas_operador: {
        Args: { p_actor_id: string; p_areas: string[]; p_operador_id: string }
        Returns: {
          area_codigo: string
        }[]
      }
      registrar_abono_heredado_ar: {
        Args: {
          p_actor_id: string
          p_ar_id: string
          p_monto: number
          p_notas: string
        }
        Returns: {
          abono_heredado: number
          ar_id: string
          estado: string
          saldo_pendiente: number
        }[]
      }
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
          p_actor_id: string
          p_cantidad_scrap: number
          p_cantidad_usada: number
          p_material_id: string
          p_partida_id: string
        }
        Returns: {
          cantidad_total: number
          costo_unitario_momento: number
          id: string
          movimiento_inventario_id: string | null
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
          movimiento_inventario_id: string | null
        }[]
      }
      editar_gasto_a19: {
        Args: {
          p_gasto_id: string
          p_actualizado_en: string
          p_datos: Json
          p_usuario_id: string
        }
        Returns: Database["public"]["Tables"]["gastos"]["Row"][]
        SetofOptions: { from: "*"; to: "gastos"; isOneToOne: false; isSetofReturn: true }
      }
      reactivar_orden_op: {
        Args: {
          p_actor_id: string
          p_actualizado_en: string
          p_orden_id: string
        }
        Returns: {
          actualizado_en: string
          estado: string
          fecha_fin: string
          fecha_inicio: string
          id: string
        }[]
      }
      reanudar_sesion_trabajo_a20: {
        Args: {
          p_orden_id: string
          p_partida_id: string
          p_programacion_id: string
          p_actualizado_en_esperado: string
          p_operador_id: string
        }
        Returns: {
          id: string
          orden_id: string
          partida_id: string
          programacion_id: string
          operador_id: string
          fecha_inicio: string
          estado_sesion: string
          creado_en: string
          actualizado_en: string
        }[]
      }
      registrar_gasto_a19: {
        Args: { p_datos: Json; p_usuario_id: string }
        Returns: Database["public"]["Tables"]["gastos"]["Row"][]
        SetofOptions: { from: "*"; to: "gastos"; isOneToOne: false; isSetofReturn: true }
      }
      registrar_gasto: {
        Args: {
          p_categoria: string
          p_comprobante_url: string
          p_creado_por: string
          p_datos_ocr_json: Json
          p_descripcion: string
          p_fecha_gasto: string
          p_fecha_vencimiento: string
          p_folio_comprobante: string
          p_metodo_pago: string
          p_moneda: string
          p_monto_iva: number
          p_monto_subtotal: number
          p_monto_total: number
          p_notas: string
          p_orden_id: string
          p_proveedor_id: string
          p_tipo_cambio: number
        }
        Returns: Database["public"]["Tables"]["gastos"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "gastos"
          isOneToOne: false
          isSetofReturn: true
        }
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
      actualizar_factura_borrador: {
        Args: {
          p_actor_id: string
          p_actualizado_en_esperado: string
          p_correlation_id?: string
          p_datos: Json
          p_factura_id: string
        }
        Returns: {
          actualizado_en: string
          estado: string
          id: string
          iva: number | null
          rfc_receptor: string | null
          subtotal: number | null
          total: number | null
        }[]
      }
      cancelar_factura: {
        Args: {
          p_actor_id: string
          p_actualizado_en_esperado: string
          p_correlation_id?: string
          p_factura_id: string
          p_motivo: string
        }
        Returns: {
          actualizado_en: string
          ar_id: string | null
          estado: string
          id: string
        }[]
      }
      crear_factura_borrador: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_datos: Json
          p_entrega_id: string
        }
        Returns: {
          actualizado_en: string
          cliente_id: string
          entrega_id: string
          estado: string
          id: string
          iva: number | null
          orden_id: string
          rfc_receptor: string | null
          subtotal: number | null
          total: number | null
          ya_existia: boolean
        }[]
      }
      emitir_factura: {
        Args: {
          p_actor_id: string
          p_actualizado_en_esperado: string
          p_correlation_id?: string
          p_factura_id: string
          p_folio_fiscal: string
          p_rfc_receptor: string | null
          p_uuid_fiscal: string | null
        }
        Returns: {
          actualizado_en: string
          ar_folio: string | null
          ar_id: string | null
          ar_vencimiento: string | null
          estado: string
          folio_fiscal: string
          id: string
        }[]
      }
      crear_promesa_pago: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_cuenta_id: string
          p_fecha_prometida: string
          p_monto: number
        }
        Returns: {
          actualizado_en: string
          cuenta_id: string
          estado: string
          fecha_prometida: string
          id: string
          monto: number
        }[]
      }
      cancelar_promesa_pago: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_motivo: string
          p_promesa_id: string
        }
        Returns: {
          actualizado_en: string
          estado: string
          id: string
        }[]
      }
      procesar_recordatorios_promesas: {
        Args: {
          p_actor_id?: string | null
        }
        Returns: {
          cumplidas: number
          recordatorios_previos: number
          recordatorios_vencidas: number
          vencidas: number
        }[]
      }
      registrar_cobro_multiple: {
        Args: {
          p_aplicaciones: Json
          p_cliente_id: string
          p_correlation_id?: string
          p_cuenta_bancaria_id: string | null
          p_metodo_pago: string
          p_moneda_pago: string
          p_monto_pagado: number
          p_notas: string | null
          p_referencia: string | null
          p_solicitud_id: string
          p_tipo_cambio_pago: number
          p_usuario_id: string
        }
        Returns: {
          aplicaciones: number
          aplicado_pago: number
          folio_recibo: string
          idempotente: boolean
          pago_id: string
          saldo_a_favor_mxn: number
          sobrepago_pago: number
        }[]
      }
      actualizar_compra_borrador: {
        Args: {
          p_actualizado_en_esperado: string
          p_actor_id: string
          p_compra_id: string
          p_fecha_vencimiento: string | null
          p_moneda: string
          p_monto_iva: number
          p_monto_subtotal: number
          p_notas: string | null
          p_orden_id: string | null
          p_proveedor_id: string
          p_tipo_cambio: number
        }
        Returns: {
          actualizado_en: string
          id: string
          moneda: string
          monto_iva: number
          monto_subtotal: number
          monto_total: number
          orden_id: string | null
          proveedor_id: string
          saldo_pendiente: number
          tipo_cambio: number
        }[]
      }
      cambiar_estado_compra: {
        Args: {
          p_actualizado_en_esperado: string
          p_actor_id: string
          p_compra_id: string
          p_correlation_id?: string
          p_estado_destino: string
          p_motivo: string | null
        }
        Returns: {
          actualizado_en: string
          estado: string
          id: string
        }[]
      }
      crear_compra: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_fecha_vencimiento: string | null
          p_moneda: string
          p_monto_iva: number
          p_monto_subtotal: number
          p_notas: string | null
          p_orden_id: string | null
          p_proveedor_id: string
          p_tipo_cambio: number
        }
        Returns: {
          actualizado_en: string
          estado: string
          folio_sii: string
          id: string
          monto_total: number
          saldo_pendiente: number
        }[]
      }
      pagar_compra: {
        Args: {
          p_actor_id: string
          p_compra_id: string
          p_correlation_id?: string
          p_cuenta_bancaria_id: string | null
          p_metodo_pago: string
          p_monto: number
          p_notas: string | null
          p_referencia: string | null
        }
        Returns: {
          actualizado_en: string
          compra_id: string
          estado: string
          pago_id: string
          saldo_pendiente: number
        }[]
      }
      conciliar_movimiento: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_cuenta_id: string
          p_entidad: string
          p_entidad_id: string
        }
        Returns: {
          conciliacion_id: string
          conciliado_en: string
        }[]
      }
      desconciliar_movimiento: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_entidad: string
          p_entidad_id: string
        }
        Returns: {
          entidad: string
          entidad_id: string
        }[]
      }
      costear_ruteo_revision: {
        Args: { p_actor_id: string; p_correlation_id?: string; p_revision_id: string }
        Returns: Json
      }
      procesar_solicitud_orden: {
        Args: { p_actor_id: string; p_correlation_id?: string; p_revision_id: string }
        Returns: Json
      }
      resolver_tarifa_hora: {
        Args: { p_grupo_equipo_id: string; p_recurso_id?: string }
        Returns: Json
      }
      registrar_version_rfq: {
        Args: {
          p_actor_id: string
          p_causa: string
          p_correlation_id?: string
          p_rfq_id: string
        }
        Returns: number
      }
      registrar_saldo_inicial: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_cuenta_id: string
          p_fecha: string
          p_moneda: string
          p_monto: number
          p_tipo_cambio: number
        }
        Returns: {
          actualizado_en: string
          cuenta_id: string
          fecha: string
          moneda: string
          monto: number
          tipo_cambio: number
        }[]
      }
      registrar_transferencia: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_cuenta_destino_id: string
          p_cuenta_origen_id: string
          p_monto: number
          p_referencia: string | null
        }
        Returns: {
          creado_en: string
          entrada_id: string
          moneda: string
          monto: number
          salida_id: string
        }[]
      }
      obtener_kpis_sii: {
        Args: {
          p_actor_id: string
          p_fin: string
          p_inicio: string
        }
        Returns: Json
      }
      actualizar_fecha_entrega: {
        Args: {
          p_actualizado_en_esperado: string
          p_actor_id: string
          p_correlation_id?: string
          p_fecha_entrega: string
          p_nota_id: string
        }
        Returns: {
          actualizado_en: string
          fecha_entrega: string
          id: string
        }[]
      }
      registrar_entrega: {
        Args: {
          p_actor?: string
          p_contacto_id?: string
          p_correlation_id?: string
          p_entregado_por?: string
          p_orden_id: string
          p_recibido_por: string
          p_renglones: Json
          p_solicitud_id?: string
        }
        Returns: Json
      }
      registrar_factura_ar: {
        Args: {
          p_ar_id: string
          p_actualizado_en_esperado: string
          p_folio_factura: string
          p_fecha_vencimiento: string | null
          p_actor_id: string
        }
        Returns: {
          cuenta_id: string
          version_nueva: string
          folio_factura: string
          fecha_vencimiento: string | null
        }[]
      }
      registrar_pago_ar_atomico: {
        Args: {
          p_ar_id: string
          p_cuenta_bancaria_id?: string
          p_metodo_pago: string
          p_moneda_pago: string
          p_monto_pagado: number
          p_notas?: string
          p_referencia: string
          p_solicitud_id: string
          p_tipo_cambio_pago: number
          p_usuario_id: string
        }
        Returns: {
          ar_id: string
          estado_ar: string
          folio_recibo: string
          idempotente: boolean
          monto_aplicado_ar: number
          monto_sobrepago_ar: number
          pago_id: string
          saldo_a_favor_mxn: number
          saldo_pendiente: number
        }[]
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
      repetir_orden_op: {
        Args: {
          p_actor_id: string
          p_fecha_compromiso: string
          p_orden_origen_id: string
        }
        Returns: {
          cuenta_id: string
          folio: string
          id: string
        }[]
      }
      reprogramar_partida_recurso: {
        Args: {
          p_actualizado_en_esperado: string
          p_fecha_programada: string
          p_horas_estimadas: number
          p_orden_prioridad: number
          p_programacion_id: string
          p_recurso_id: string
          p_turno: string
        }
        Returns: {
          actualizado_en: string
          estado_planeacion: string
          id: string
        }[]
      }
      reprogramar_partida_recurso_auditada: {
        Args: {
          p_actor_id: string
          p_actualizado_en_esperado: string
          p_correlation_id?: string
          p_fecha_programada: string
          p_horas_estimadas: number
          p_motivo: string
          p_orden_prioridad: number
          p_programacion_id: string
          p_recurso_id: string
          p_turno: string
        }
        Returns: {
          actualizado_en: string
          estado_planeacion: string
          id: string
        }[]
      }
      reversar_pago_ar: {
        Args: { p_actor_id: string; p_motivo: string; p_pago_id: string }
        Returns: {
          ar_id: string
          estado_ar: string
          folio_recibo: string
          monedero_revertido_mxn: number
          pago_id: string
          saldo_pendiente: number
        }[]
      }
      anular_cuenta_por_cobrar: {
        Args: { p_actualizado_en: string; p_actor_id: string; p_ar_id: string; p_motivo: string }
        Returns: {
          actualizado_en: string
          estado: string
          id: string
          motivo_anulacion: string
          saldo_pendiente: number
        }[]
      }
      previsualizar_consolidacion_ar_faltantes: {
        Args: never
        Returns: {
          cliente_nombre: string
          elegible: boolean
          estado: string
          folio: string
          monto_total: number
          motivo: string
          orden_id: string
        }[]
      }
      consolidar_ar_faltantes: {
        Args: { p_actor_id: string; p_orden_ids: string[] }
        Returns: {
          creada: boolean
          motivo: string
          orden_id: string
        }[]
      }
      usuario_tiene_permiso: { Args: { p_permiso: string }; Returns: boolean }
      aceptar_revision: {
        Args: {
          p_actor: string
          p_correlation_id?: string
          p_datos: Json
          p_revision_id: string
        }
        Returns: Json
      }
      calcular_totales_revision: {
        Args: { p_revision_id: string }
        Returns: Json
      }
      cerrar_propuesta: {
        Args: {
          p_actor: string
          p_actualizado_en: string
          p_correlation_id?: string
          p_motivo: string
          p_revision_id: string
        }
        Returns: Json
      }
      confirmar_costo_material: {
        Args: {
          p_actor_id: string
          p_actualizado_en: string
          p_costo: number
          p_fecha_efectiva: string
          p_fuente: string
          p_material_id: string
          p_moneda: string
          p_propuesta_id?: string
          p_referencia: string
        }
        Returns: {
          actualizado_en: string
          costo_vigente: number
          material_id: string
          moneda_costo: string
        }[]
      }
      proponer_costo_material: {
        Args: {
          p_actor_id: string
          p_costo: number
          p_fecha_efectiva: string
          p_fuente: string
          p_material_id: string
          p_moneda: string
          p_referencia: string
        }
        Returns: string
      }
      confirmar_venta: {
        Args: {
          p_actor: string
          p_actualizado_en: string
          p_correlation_id?: string
          p_revision_id: string
        }
        Returns: Json
      }
      agregar_item_propuesta: {
        Args: {
          p_actor: string
          p_correlation_id?: string
          p_datos: Json
          p_revision_id: string
        }
        Returns: Json
      }
      crear_nueva_revision: {
        Args: {
          p_actor: string
          p_correlation_id?: string
          p_motivo: string
          p_revision_origen: string
        }
        Returns: Json
      }
      crear_propuesta: {
        Args: { p_actor: string; p_correlation_id?: string; p_rfq_id: string }
        Returns: Json
      }
      editar_costos_revision: {
        Args: {
          p_actor: string
          p_correlation_id?: string
          p_datos: Json
          p_revision_id: string
        }
        Returns: Json
      }
      editar_item_propuesta: {
        Args: {
          p_actor: string
          p_correlation_id?: string
          p_datos: Json
          p_item_id: string
        }
        Returns: Json
      }
      editar_ruteo_item: {
        Args: {
          p_actor: string
          p_correlation_id?: string
          p_datos: Json
          p_item_id: string
        }
        Returns: Json
      }
      rechazar_propuesta: {
        Args: {
          p_actor: string
          p_actualizado_en: string
          p_correlation_id?: string
          p_motivo: string
          p_revision_id: string
        }
        Returns: Json
      }
      registrar_pdf_revision: {
        Args: {
          p_actor: string
          p_archivo_id: string
          p_contenido_hash: string
          p_correlation_id?: string
          p_revision_id: string
        }
        Returns: Json
      }
      registrar_seguimiento_propuesta: {
        Args: {
          p_actor: string
          p_correlation_id?: string
          p_datos: Json
          p_revision_id: string
        }
        Returns: Json
      }
      validar_revision: {
        Args: {
          p_actor: string
          p_correlation_id?: string
          p_datos: Json
          p_revision_id: string
        }
        Returns: Json
      }
      generar_folio_periodico: {
        Args: { p_tipo: string }
        Returns: string
      }
      backfill_rfq_legacy: { Args: never; Returns: Json }
      validar_rfq_listo: {
        Args: { p_rfq_id: string }
        Returns: Json
      }
      cambiar_estado_rfq: {
        Args: {
          p_accion: string
          p_actor_id: string
          p_args: Json
          p_correlation_id?: string
          p_rfq_id: string
        }
        Returns: string
      }
      crear_item_rfq: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_datos: Json
          p_rfq_id: string
        }
        Returns: Json
      }
      actualizar_item_rfq: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_datos: Json
          p_item_id: string
        }
        Returns: Json
      }
      cancelar_item_rfq: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_item_id: string
          p_motivo: string
        }
        Returns: Json
      }
      reemplazar_operaciones_item: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_item_id: string
          p_proceso_ids: string[]
        }
        Returns: Json
      }
      ajustar_continuidad_folio_periodico: {
        Args: {
          p_actor_id: string
          p_periodo: string
          p_tipo: string
          p_ultimo: number
        }
        Returns: number
      }
      consultar_continuidad_folio_periodico: {
        Args: { p_actor_id: string; p_tipo: string }
        Returns: {
          periodo: string
          ultimo_contador: number | null
          ultimo_emitido: number | null
          siguiente: number | null
        }[]
      }
      crear_orden_desde_revision: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_revision_id: string
        }
        Returns: {
          folio: string
          folio_sii: string
          id: string
          ya_existia: boolean
        }[]
      }
      crear_orden_interna: {
        Args: {
          p_actor_id: string
          p_autorizacion: Json
          p_correlation_id?: string
          p_datos: Json
        }
        Returns: {
          folio: string
          folio_sii: string
          id: string
          ya_existia: boolean
        }[]
      }
      liberar_orden: {
        Args: {
          p_actualizado_en: string
          p_actor_id: string
          p_correlation_id?: string
          p_orden_id: string
        }
        Returns: {
          actualizado_en: string
          estado_sii: string
          id: string
        }[]
      }
      cerrar_orden_administrativa: {
        Args: {
          p_actualizado_en: string
          p_actor_id: string
          p_correlation_id?: string
          p_orden_id: string
        }
        Returns: {
          cerrada_admin_en: string | null
          estado_sii: string
          id: string
        }[]
      }
      ajustar_orden_post_aceptacion: {
        Args: {
          p_actualizado_en: string
          p_actor_id: string
          p_cambios: Json
          p_correlation_id?: string
          p_motivo: string
          p_orden_id: string
        }
        Returns: {
          actualizado_en: string
          estado_sii: string
          id: string
        }[]
      }
      crear_corrida: {
        Args: {
          p_actor_id: string
          p_corrida_origen_id?: string | null
          p_items: Json
          p_orden_id: string
          p_proceso_id: string
        }
        Returns: Json
      }
      iniciar_corrida: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_corrida_id: string
          p_verificacion: Json
        }
        Returns: Json
      }
      completar_corrida: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_corrida_id: string
        }
        Returns: Json
      }
      cancelar_corrida: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_corrida_id: string
          p_motivo: string
        }
        Returns: Json
      }
      reclamar_recurso_liberado: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_recurso_id: string
        }
        Returns: Json
      }
      cerrar_jornada: {
        Args: {
          p_actor_id: string
          p_correlation_id?: string
          p_fecha: string
        }
        Returns: Json
      }
      autorizar_horas_extra: {
        Args: {
          p_actor_id?: string | null
          p_correlation_id?: string
          p_horas?: number | null
          p_motivo?: string | null
          p_orden_id: string
          p_sesion_id?: string | null
        }
        Returns: Json
      }
      registrar_inspeccion: {
        Args: {
          p_actor_id: string
          p_cantidad_inspeccionada: number
          p_cantidad_nok: number
          p_cantidad_ok: number
          p_cantidad_retrabajo: number
          p_codigo_item: string
          p_correlation_id?: string
          p_corrida_id: string | null
          p_material_usado: Json
          p_observaciones: string | null
          p_orden_id: string
          p_partida_id: string | null
          p_referencia: number | null
          p_resultado: string
          p_tipo: string
          p_tolerancias: Json
        }
        Returns: Json
      }
    }
    Enums: {
      tipo_entidad_comentario: "orden" | "cotizacion" | "cliente"
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
      tipo_entidad_comentario: ["orden", "cotizacion", "cliente"],
    },
  },
} as const
