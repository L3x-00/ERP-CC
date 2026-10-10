import { redirect } from 'next/navigation';
import { IndicadorSesion } from '@/modulos/autenticacion/componentes/indicador-sesion';
import { BannerVistaOperador } from '@/modulos/autenticacion/componentes/banner-vista-operador';
import { ControlPisoPanel } from '@/modulos/ordenes/componentes/control-piso-panel';
import { SincronizadorPisoRealtime } from '@/modulos/ordenes/componentes/sincronizador-piso-realtime';
import { obtenerOrdenesConPartidasDePisoServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerContextoSesionOperadorActiva,
  obtenerSesionOperadorFirmada,
} from '@/nucleo/autenticacion/obtener-operador-sesion';
import { sesionOperadorEsDelegada } from '@/nucleo/autenticacion/sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

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
  const ordenes = await obtenerOrdenesConPartidasDePisoServicio(admin, contexto?.operador.id ?? null);
  const idsMateriales = [
    ...new Set(
      ordenes.flatMap(({ partidas }) =>
        partidas.flatMap((partida) => (partida.materialId ? [partida.materialId] : [])),
      ),
    ),
  ];
  const resultadoMateriales = idsMateriales.length
    ? await admin
        .from('catalogo_materiales')
        .select('id, codigo, nombre, unidad_base')
        .in('id', idsMateriales)
        .eq('activo', true)
        .order('nombre', { ascending: true })
    : { data: [], error: null };

  if (resultadoMateriales.error) {
    throw new Error('No se pudieron cargar los materiales para el control de piso');
  }

  // OBS-09/PRD-11 y A06: catálogo mínimo de taller (nombre para las etiquetas;
  // padre y área macro para filtrar por familia, no por código exacto).
  const resultadoAreas = await admin
    .from('areas_trabajo_config')
    .select('codigo, nombre, padre_codigo, area_planeacion')
    .order('orden')
    .order('nombre');
  if (resultadoAreas.error) {
    throw new Error('No se pudieron cargar las áreas de taller para el control de piso');
  }

  const materiales = (resultadoMateriales.data ?? []).map((material) => ({
    id: material.id,
    codigo: material.codigo,
    nombre: material.nombre,
    unidadBase: material.unidad_base,
  }));

  const areas = (resultadoAreas.data ?? []).map((area) => ({
    codigo: area.codigo,
    nombre: area.nombre,
    padreCodigo: area.padre_codigo,
    areaPlaneacion: area.area_planeacion,
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <SincronizadorPisoRealtime rutaAlExpirar={esVistaAdmin ? '/produccion' : '/operador'} />
      {esVistaAdmin ? (
        <div
          role="status"
          data-testid="banner-vista-admin"
          className="rounded-lg border border-acento/40 bg-acento-suave px-4 py-3"
        >
          <p className="text-sm font-semibold text-acento">Vista de administrador — solo lectura</p>
          <p className="text-xs text-texto-secundario">
            Ves el piso completo sin PIN. Los registros de producción siguen siendo de los
            operadores.
          </p>
        </div>
      ) : esDelegada && administrador ? (
        <BannerVistaOperador
          nombreOperador={operador.nombreCompleto}
          nombreAdministrador={administrador.nombreCompleto}
          expiraEn={sesion!.expiraEn ?? sesion!.iniciadaEn}
        />
      ) : (
        <IndicadorSesion nombreUsuario={operador.nombreCompleto} esOperador />
      )}
      <ControlPisoPanel
        operadorId={operador.id}
        nombreOperador={operador.nombreCompleto}
        ordenes={ordenes}
        materiales={materiales}
        areas={areas}
        soloLectura={soloLectura}
      />
    </div>
  );
}
