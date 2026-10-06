import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import type { PermisosPropuesta } from '@/modulos/propuestas/tipos/indice';
import { ColaPropuestas } from '@/modulos/propuestas/componentes/cola-propuestas';
import { FichaPropuesta } from '@/modulos/propuestas/componentes/ficha-propuesta';
import { SincronizadorPropuestasRealtime } from '@/modulos/propuestas/componentes/sincronizador-propuestas-realtime';

type ParametrosPaginaPropuestas = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Cola y ficha de propuestas (plan §4.11). Deep-link `?propuesta=<id>`; el
 * servidor resuelve los permisos para habilitar acciones en la UI (el SQL los
 * revalida siempre).
 */
export default async function PaginaPropuestas({ searchParams }: ParametrosPaginaPropuestas) {
  const parametros = searchParams ? await searchParams : {};
  const propuestaId = typeof parametros.propuesta === 'string' ? parametros.propuesta : undefined;

  const usuario = await obtenerUsuarioServidor();
  const esAdmin = usuario?.rol === 'admin';
  const permisos = new Set(usuario?.permisos ?? []);
  const puede = (permiso: string): boolean => esAdmin || permisos.has(permiso);

  const permisosPropuesta: PermisosPropuesta = {
    editarArticulo: puede('propuesta_editar_articulo'),
    editarPrecio: puede('propuesta_editar_precio'),
    editarRuteo: puede('propuesta_editar_ruteo'),
    editarCosto: puede('propuesta_editar_costo'),
    validar: puede('propuesta_validar'),
    generarPdf: puede('propuesta_generar_pdf'),
    enviar: puede('propuesta_enviar'),
    seguimiento: puede('propuesta_seguimiento'),
    aceptar: puede('propuesta_aceptar'),
    crearRevision: puede('propuesta_crear_revision'),
    cerrar: puede('propuesta_cerrar'),
  };

  if (propuestaId) {
    return (
      <>
        <SincronizadorPropuestasRealtime />
        <FichaPropuesta propuestaId={propuestaId} permisos={permisosPropuesta} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SincronizadorPropuestasRealtime />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Propuestas</h1>
        <p className="text-sm text-texto-secundario">
          Revisiones A/B/C, ruteo y costeo, PDF privado, envío y aceptación de la revisión exacta.
        </p>
      </header>
      <ColaPropuestas />
    </div>
  );
}
