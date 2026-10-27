import { redirect } from 'next/navigation';
import { BannerVistaOperador } from '@/modulos/autenticacion/componentes/banner-vista-operador';
import { BotonVolverAdmin } from '@/modulos/autenticacion/componentes/botones-vista-produccion';
import { SincronizadorPisoRealtime } from '@/modulos/ordenes/componentes/sincronizador-piso-realtime';
import { EspacioOperador } from '@/modulos/produccion/componentes/espacio-operador';
import { obtenerEspacioOperadorServicio } from '@/modulos/produccion/servicios/espacio-operador-servicio';
import { obtenerConsumosPartidasServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerContextoSesionOperadorActiva,
  obtenerSesionOperadorFirmada,
} from '@/nucleo/autenticacion/obtener-operador-sesion';
import { sesionOperadorEsDelegada } from '@/nucleo/autenticacion/sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { EncabezadoTerminalOperador } from '@/modulos/produccion/componentes/encabezado-terminal-operador';
import { consumoMaterialVisibleDesdeRegistro } from '@/modulos/produccion/utilidades/consumo-material-operador';
/**
 * Página de producción en piso. Revalida la cookie HMAC y la cuenta de operador
 * antes de cargar solo OP en proceso mediante un cliente privado de servidor.
 * Un administrador con sesión del sistema ve el piso completo en solo lectura
 * sin PIN; la terminal de operador (sin sesión) sigue entrando con su PIN.
 */
export default async function PaginaProduccionPiso() {
  const [contexto, sesionFirmada, usuario] = await Promise.all([
    obtenerContextoSesionOperadorActiva(),
    obtenerSesionOperadorFirmada(),
    obtenerUsuarioServidor(),
  ]);
  const esVistaAdmin = !contexto && usuario?.rol === 'admin' && usuario.activo;
  if (!contexto && !esVistaAdmin) {
    redirect(
      sesionFirmada && sesionOperadorEsDelegada(sesionFirmada) ? '/produccion' : '/operador',
    );
  }
  const sesion = contexto?.sesion ?? null;
  const operador = contexto?.operador ?? usuario!;
  const administrador = contexto?.administrador ?? null;
  const esDelegada = sesion !== null && sesionOperadorEsDelegada(sesion);
  const soloLectura = esVistaAdmin || esDelegada;

  const admin = crearClienteSupabaseAdmin();
  const operadorId = contexto?.operador.id ?? null;
  const espacio = await obtenerEspacioOperadorServicio(admin, operadorId);
  const [resultadoMateriales, consumos] = await Promise.all([
    admin
      .from('catalogo_materiales')
      .select('id, codigo, nombre, unidad_base')
      .eq('activo', true)
      .order('codigo'),
    obtenerConsumosPartidasServicio(
      admin,
      espacio.procesos.map((proceso) => proceso.partidaId),
    ),
  ]);

  if (resultadoMateriales.error) {
    throw new Error(`No se pudo cargar el catálogo de materiales: ${resultadoMateriales.error.message}`);
  }

  const materiales = (resultadoMateriales.data ?? []).map((material) => ({
    id: material.id,
    codigo: material.codigo,
    nombre: material.nombre,
    unidadBase: material.unidad_base,
  }));
  return (
    <div className="flex flex-col gap-6 p-6">
      <SincronizadorPisoRealtime rutaAlExpirar={esVistaAdmin ? '/produccion' : '/operador'} />
      {esVistaAdmin ? (
        <div
          role="status"
          data-testid="banner-vista-admin"
          className="flex flex-col gap-3 rounded-lg border border-acento/40 bg-acento-suave px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-acento">Vista de administrador — solo lectura</p>
            <p className="text-xs text-texto-secundario">
              Ves el piso completo sin PIN. Los registros de producción siguen siendo de los
              operadores.
            </p>
          </div>
          <BotonVolverAdmin />
        </div>
      ) : esDelegada && administrador ? (
        <BannerVistaOperador
          nombreOperador={operador.nombreCompleto}
          nombreAdministrador={administrador.nombreCompleto}
          expiraEn={sesion!.expiraEn ?? sesion!.iniciadaEn}
        />
      ) : (
        <EncabezadoTerminalOperador
          nombreOperador={operador.nombreCompleto}
          operativo={!soloLectura}
        />
      )}
      <EspacioOperador
        procesos={espacio.procesos}
        areas={espacio.areas}
        resumen={espacio.resumen}
        motivosPausa={espacio.motivosPausa}
        hoy={espacio.hoy}
        dias={espacio.dias}
        operadorId={operadorId}
        soloLectura={soloLectura}
        nombreOperador={operador.nombreCompleto}
        materiales={materiales}
        consumos={consumos.map(consumoMaterialVisibleDesdeRegistro)}
      />
    </div>
  );
}
