'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  listarAreasTrabajoConfig,
  listarCuentasBancarias,
  listarOperadoresAreasServicio,
  obtenerConfiguracionGeneral,
  type OperadorAreaConfig,
} from '@/modulos/configuracion/servicios/indice';
import type {
  AreaTrabajoConfig,
  ConfiguracionSistema,
  CuentaBancaria,
} from '@/modulos/configuracion/tipos/indice';
import { esquemaConsultaConfiguracion } from '@/modulos/configuracion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

export interface DatosConfiguracion {
  configuracion: ConfiguracionSistema;
  cuentasBancarias: CuentaBancaria[];
  areasTrabajo: AreaTrabajoConfig[];
  /** OBS-09/PRD-11: operadores activos y sus áreas habilitadas. */
  operadoresAreas: OperadorAreaConfig[];
}

export async function obtenerConfiguracionAccion(
  entrada: unknown = {},
): Promise<RespuestaAccion<DatosConfiguracion>> {
  const analisis = esquemaConsultaConfiguracion.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) return { exito: false, error: 'Sin permiso para ver la configuración' };

  try {
    const cliente = await crearClienteSupabaseServidor();
    const [configuracion, cuentasBancarias, areasTrabajo, operadoresAreas] = await Promise.all([
      obtenerConfiguracionGeneral(cliente),
      listarCuentasBancarias(cliente, analisis.data.soloCuentasActivas),
      listarAreasTrabajoConfig(cliente),
      // La RLS de `usuarios` solo deja al propio usuario o admin; el permiso
      // `configuracion` ya se comprobó arriba y aquí solo se exponen operadores
      // activos con sus códigos de área.
      listarOperadoresAreasServicio(crearClienteSupabaseAdmin()),
    ]);
    return { exito: true, datos: { configuracion, cuentasBancarias, areasTrabajo, operadoresAreas } };
  } catch (error) {
    console.error('[CONFIGURACION] Error al consultar configuración:', error);
    return { exito: false, error: 'No se pudo consultar la configuración' };
  }
}
