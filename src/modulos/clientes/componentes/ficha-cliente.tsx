'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { usarCliente } from '@/modulos/clientes/hooks/usar-cliente';
import { subirDocumentoCliente } from '@/modulos/clientes/subir-documento-cliente-navegador';
import { asignarTierManualAccion } from '@/modulos/clientes/acciones/asignar-tier-manual';
import { cambiarEstadoClienteAccion } from '@/modulos/clientes/acciones/cambiar-estado-cliente';
import { BadgeTier } from '@/modulos/clientes/componentes/badge-tier';
import { AlertaCredito } from '@/modulos/clientes/componentes/alerta-credito';
import { PanelTier } from '@/modulos/clientes/componentes/panel-tier';
import { PanelComercial } from '@/modulos/clientes/componentes/comercial-cliente';
import { HistorialCliente } from '@/modulos/clientes/componentes/historial-cliente';
import { PanelContactos } from '@/modulos/clientes/componentes/contactos-cliente';
import { HiloComentarios } from '@/modulos/comentarios/componentes/indice';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import { Button } from '@/compartido/componentes/ui/button';
import { Select } from '@/compartido/componentes/ui/input';
import type {
  Cliente,
  Direccion,
  DocumentoCliente,
  EstadoCliente,
  TierCliente,
  TipoDocumentoCliente,
} from '@/modulos/clientes/tipos/indice';
import {
  ETIQUETA_TIPO_DOCUMENTO,
  ETIQUETA_TIER,
} from '@/modulos/clientes/utilidades/indice';

const BUCKET = 'documentos-cliente';
type Pestana = 'resumen' | 'contactos' | 'comercial' | 'documentos' | 'historial' | 'comentarios';

const ETIQUETA_PESTANA: Record<Pestana, string> = {
  resumen: 'Resumen',
  contactos: 'Contactos',
  comercial: 'Comercial',
  documentos: 'Documentos',
  historial: 'Historial',
  comentarios: 'Comentarios',
};

/**
 * Ficha 360° del cliente en un drawer lateral (SII-B2.7). Cabecera con folio
 * CLI-#### + chip de estado, acciones de negocio arriba (Editar,
 * Activar/Inactivar, Nuevo RFQ) y pestañas Resumen, Contactos, Comercial,
 * Documentos (versiones), Historial y Comentarios.
 */
export function FichaCliente({
  clienteId,
  esAdmin,
  usuarioActualId,
  onCerrar,
  onEditar,
  puedeEditar = false,
  puedeComercial = false,
  puedeFinanzas = false,
}: {
  clienteId: string;
  esAdmin: boolean;
  usuarioActualId?: string;
  onCerrar: () => void;
  onEditar?: (cliente: Cliente) => void;
  puedeEditar?: boolean;
  puedeComercial?: boolean;
  puedeFinanzas?: boolean;
}) {
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const router = useRouter();
  const { data, isLoading } = usarCliente(clienteId);
  const edicionPermitida = puedeEditar || esAdmin;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onCerrar}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ficha del cliente"
        className="deslizar-derecha flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-borde bg-superficie shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-borde p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-texto-primario">
                {data?.cliente.razonSocial ?? 'Cliente'}
              </h2>
              {data?.cliente.folio && (
                <span
                  data-testid="folio-cliente"
                  className="rounded bg-superficie-2 px-1.5 py-0.5 font-mono text-xs text-texto-secundario"
                >
                  {data.cliente.folio}
                </span>
              )}
            </div>
            {data && (
              <div className="flex items-center gap-2">
                <BadgeTier cliente={data.cliente} consumo={data.consumoUltimos3Meses} />
                <BadgeEstado estado={data.cliente.estado} />
              </div>
            )}
          </div>
          <Button
            variante="fantasma"
            tamano="sm"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-xl leading-none"
          >
            ×
          </Button>
        </header>

        {isLoading && <p className="p-4 text-sm text-texto-secundario">Cargando…</p>}
        {!isLoading && !data && <p className="p-4 text-sm text-texto-secundario">Cliente no encontrado.</p>}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-3">
              {edicionPermitida && onEditar && (
                <Button
                  variante="contorno"
                  tamano="sm"
                  onClick={() => onEditar(data.cliente)}
                >
                  Editar
                </Button>
              )}
              <AccionEstado cliente={data.cliente} puedeEditar={edicionPermitida} />
              <Button
                variante="fantasma"
                tamano="sm"
                onClick={() => router.push('/pipeline')}
              >
                Nuevo RFQ
              </Button>
            </div>

            <nav className="flex flex-wrap gap-1 border-b border-borde px-4">
              {(Object.keys(ETIQUETA_PESTANA) as Pestana[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPestana(p)}
                  aria-current={pestana === p ? 'page' : undefined}
                  className={`border-b-2 px-3 py-2 text-sm transition-colors ${
                    pestana === p
                      ? 'border-acento font-semibold text-acento'
                      : 'border-transparent text-texto-secundario hover:text-texto-primario'
                  }`}
                >
                  {ETIQUETA_PESTANA[p]}
                </button>
              ))}
            </nav>

            <div className="flex-1 p-4">
              {pestana === 'resumen' && <PanelResumen cliente={data.cliente} />}
              {pestana === 'contactos' && <PanelContactos clienteId={clienteId} />}
              {pestana === 'comercial' && (
                <>
                  <div className="flex flex-col gap-3">
                    <PanelComercial
                      cliente={data.cliente}
                      creditoUsado={data.creditoUsado}
                      puedeComercial={puedeComercial || esAdmin}
                      puedeFinanzas={puedeFinanzas || esAdmin}
                    />
                    <AlertaCredito cliente={data.cliente} usado={data.creditoUsado} />
                    <PanelTier cliente={data.cliente} consumo={data.consumoUltimos3Meses} />
                    {esAdmin && <ControlTierManual clienteId={clienteId} />}
                  </div>
                </>
              )}
              {pestana === 'documentos' && (
                <PanelDocumentos
                  clienteId={clienteId}
                  documentos={data.documentos}
                  versiones={data.versionesDocumentos}
                />
              )}
              {pestana === 'historial' && <HistorialCliente clienteId={clienteId} />}
              {pestana === 'comentarios' && (
                <HiloComentarios
                  entidadTipo="cliente"
                  entidadId={clienteId}
                  usuarioActualId={usuarioActualId}
                  puedeEliminarTodos={esAdmin}
                  titulo="Comentarios del cliente"
                />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/** Acciones Activar/Inactivar con motivo obligatorio y CAS (SII-B2.5). */
function AccionEstado({ cliente, puedeEditar }: { cliente: Cliente; puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!puedeEditar) return null;

  async function ejecutar(nuevoEstado: EstadoCliente): Promise<void> {
    setEnviando(true);
    setMensaje(null);
    const respuesta = await cambiarEstadoClienteAccion({
      clienteId: cliente.id,
      nuevoEstado,
      ...(nuevoEstado === 'inactivo' ? { motivo } : {}),
      actualizadoEn: cliente.actualizadoEn,
    });
    setEnviando(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setConfirmando(false);
    setMotivo('');
    await queryClient.invalidateQueries({ queryKey: ['cliente', cliente.id] });
    await queryClient.invalidateQueries({ queryKey: ['clientes'] });
  }

  if (cliente.estado === 'inactivo') {
    return (
      <div className="flex items-center gap-2">
        <Button tamano="sm" onClick={() => void ejecutar('activo')} disabled={enviando}>
          {enviando ? '…' : 'Activar'}
        </Button>
        {mensaje && (
          <span role="alert" className="text-xs text-peligro-texto">
            {mensaje}
          </span>
        )}
      </div>
    );
  }

  if (!confirmando) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {cliente.estado === 'prospecto' && (
          <Button tamano="sm" onClick={() => void ejecutar('activo')} disabled={enviando}>
            Activar
          </Button>
        )}
        <Button variante="contorno" tamano="sm" onClick={() => setConfirmando(true)}>
          Inactivar
        </Button>
        {mensaje && (
          <span role="alert" className="text-xs text-peligro-texto">
            {mensaje}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-base border border-borde p-2">
      <label htmlFor="motivo-inactivar" className="text-xs font-medium">
        Motivo de la inactivación
      </label>
      <textarea
        id="motivo-inactivar"
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
        maxLength={300}
        rows={2}
        className="rounded-base border border-borde-fuerte bg-superficie px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2">
        <Button
          variante="destructivo"
          tamano="sm"
          onClick={() => void ejecutar('inactivo')}
          disabled={enviando || motivo.trim().length < 3}
        >
          {enviando ? '…' : 'Confirmar inactivación'}
        </Button>
        <Button variante="fantasma" tamano="sm" onClick={() => setConfirmando(false)} disabled={enviando}>
          Cancelar
        </Button>
        {mensaje && (
          <span role="alert" className="text-xs text-peligro-texto">
            {mensaje}
          </span>
        )}
      </div>
    </div>
  );
}

function PanelResumen({ cliente }: { cliente: Cliente }) {
  return (
    <div className="flex flex-col gap-4">
      <Tarjeta>
        <dl className="grid grid-cols-2 gap-3 px-6 py-4 text-sm">
          <Dato etiqueta="Folio" valor={cliente.folio ?? '—'} />
          <Dato etiqueta="Nombre comercial" valor={cliente.nombreComercial} />
          <Dato etiqueta="RFC" valor={cliente.rfc ?? '—'} />
          <Dato etiqueta="Contacto" valor={cliente.contacto ?? '—'} />
          <Dato etiqueta="Correo" valor={cliente.correo ?? '—'} />
          <Dato etiqueta="Teléfono" valor={cliente.telefono ?? '—'} />
          <Dato etiqueta="Moneda" valor={cliente.moneda} />
          <Dato etiqueta="Alta" valor={formatearFecha(cliente.creadoEn)} />
        </dl>
      </Tarjeta>
      <div className="grid gap-4 sm:grid-cols-2">
        <BloqueDireccion titulo="Dirección fiscal" direccion={cliente.direccionFiscal} />
        <BloqueDireccion
          titulo="Dirección de envío"
          direccion={cliente.direccionEnvio}
          notaSiVacia="Misma que la fiscal"
        />
      </div>
    </div>
  );
}

function BloqueDireccion({
  titulo,
  direccion,
  notaSiVacia = 'Sin registrar',
}: {
  titulo: string;
  direccion: Direccion | null;
  notaSiVacia?: string;
}) {
  return (
    <Tarjeta className="p-3 text-sm">
      <h3 className="mb-1 font-semibold">{titulo}</h3>
      {direccion ? (
        <address className="not-italic text-texto-primario">
          {direccion.calle} {direccion.numeroExterior}
          {direccion.numeroInterior ? ` int. ${direccion.numeroInterior}` : ''}
          <br />
          {direccion.colonia}, {direccion.municipio}
          <br />
          {direccion.estado}, C.P. {direccion.codigoPostal}
          <br />
          {direccion.pais}
        </address>
      ) : (
        <p className="text-texto-tenue">{notaSiVacia}</p>
      )}
    </Tarjeta>
  );
}

/** Clave de versionado de un documento: tema + nombre ERP. */
function claveVersionDocumento(doc: DocumentoCliente): string {
  return `${doc.tipo}|${doc.nombreErp ?? doc.nombreArchivo}`;
}

function PanelDocumentos({
  clienteId,
  documentos,
  versiones,
}: {
  clienteId: string;
  documentos: DocumentoCliente[];
  versiones: DocumentoCliente[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormularioDocumento clienteId={clienteId} />
      {documentos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin documentos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde" data-testid="lista-documentos-cliente">
          {documentos.map((doc) => (
            <FilaDocumento
              key={doc.id}
              clienteId={clienteId}
              documento={doc}
              versiones={versiones.filter(
                (version) => claveVersionDocumento(version) === claveVersionDocumento(doc),
              )}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Fila de un documento vigente con reemplazo versionado e historial (SII-B2.6). */
function FilaDocumento({
  clienteId,
  documento,
  versiones,
}: {
  clienteId: string;
  documento: DocumentoCliente;
  versiones: DocumentoCliente[];
}) {
  const queryClient = useQueryClient();
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [reemplazando, setReemplazando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function esperarRefresco(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
  }

  async function reemplazar(archivo: File): Promise<void> {
    setSubiendo(true);
    setMensaje(null);
    try {
      // Mismo nombre ERP ⇒ el trigger de versionado crea una versión nueva.
      // El binario sube directo a Storage (H-B1-29).
      await subirDocumentoCliente(
        { clienteId, tipo: documento.tipo, nombreErp: documento.nombreErp ?? documento.nombreArchivo },
        archivo,
      );
      setMensaje('Documento reemplazado (nueva versión).');
      await esperarRefresco();
    } catch (causa) {
      setMensaje(causa instanceof Error ? causa.message : 'No se pudo reemplazar el documento');
    } finally {
      setSubiendo(false);
      setReemplazando(false);
    }
  }

  const historial = [...versiones].sort((a, b) => b.version - a.version);

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{ETIQUETA_TIPO_DOCUMENTO[documento.tipo]}</span>
          <span className="text-xs text-texto-secundario">
            {documento.nombreArchivo} · v{documento.version} · {formatearFecha(documento.creadoEn)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BotonVer ruta={documento.rutaStorage} />
          {reemplazando ? (
            <input
              type="file"
              aria-label={`Archivo de reemplazo de ${documento.nombreArchivo}`}
              accept="application/pdf,image/jpeg,image/png"
              disabled={subiendo}
              autoFocus
              className="max-w-40 text-xs"
              onChange={(evento) => {
                const archivo = evento.target.files?.[0];
                if (archivo) void reemplazar(archivo);
              }}
            />
          ) : (
            <button
              type="button"
              className="rounded-base border border-borde-fuerte px-2 py-1 text-xs hover:bg-superficie-2"
              onClick={() => setReemplazando(true)}
            >
              Reemplazar
            </button>
          )}
          <Button
            variante="fantasma"
            tamano="sm"
            onClick={() => setMostrarHistorial((valor) => !valor)}
          >
            {mostrarHistorial ? 'Ocultar historial' : 'Historial'}
          </Button>
        </div>
      </div>

      {mensaje && (
        <p role="status" className="text-xs text-texto-secundario">
          {mensaje}
        </p>
      )}

      {mostrarHistorial && (
        <ul className="ml-2 flex flex-col gap-1 border-l border-borde pl-3" data-testid="historial-versiones">
          {historial.map((version) => (
            <li key={version.id} className="flex items-center justify-between gap-2 text-xs">
              <span>
                v{version.version} · {formatearFecha(version.creadoEn)}{' '}
                {version.vigente ? (
                  <span className="font-medium text-acento">vigente</span>
                ) : (
                  <span className="text-texto-tenue">reemplazada</span>
                )}
              </span>
              <BotonVer ruta={version.rutaStorage} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Abre el documento con una URL firmada temporal (bucket privado). */
function BotonVer({ ruta }: { ruta: string }) {
  const [cargando, setCargando] = useState(false);
  async function ver(): Promise<void> {
    setCargando(true);
    const { data } = await crearClienteSupabase().storage.from(BUCKET).createSignedUrl(ruta, 60);
    setCargando(false);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener');
    }
  }
  return (
    <Button variante="fantasma" tamano="sm" onClick={ver} disabled={cargando}>
      {cargando ? '…' : 'Ver'}
    </Button>
  );
}

function FormularioDocumento({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TipoDocumentoCliente>('csf');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function manejarEnvio(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!archivo) {
      setError('Selecciona un archivo');
      return;
    }
    setSubiendo(true);
    try {
      // El binario sube directo a Storage (H-B1-29).
      await subirDocumentoCliente({ clienteId, tipo }, archivo);
      setArchivo(null);
      await queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo subir el documento');
    }
    setSubiendo(false);
  }

  return (
    <Tarjeta>
      <form onSubmit={manejarEnvio} className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Tipo</span>
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDocumentoCliente)}
              aria-label="Tipo de documento"
              className="w-auto"
            >
              {(Object.keys(ETIQUETA_TIPO_DOCUMENTO) as TipoDocumentoCliente[]).map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_DOCUMENTO[t]}
                </option>
              ))}
            </Select>
          </label>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button type="submit" tamano="sm" disabled={subiendo}>
            {subiendo ? 'Subiendo…' : 'Subir'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-peligro-texto">
            {error}
          </p>
        )}
      </form>
    </Tarjeta>
  );
}

/** Control admin para asignar tier manual (caduca a los 90 días). */
function ControlTierManual({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const [tier, setTier] = useState<TierCliente>('oro');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function asignar(): Promise<void> {
    setEnviando(true);
    setMensaje(null);
    const respuesta = await asignarTierManualAccion({ clienteId, tier });
    setEnviando(false);
    if (respuesta.exito) {
      setMensaje('Tier manual asignado (vence en 90 días).');
      await queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
    } else {
      setMensaje(respuesta.error);
    }
  }

  return (
    <Tarjeta className="flex flex-wrap items-center gap-2 p-3 text-sm">
      <span className="font-medium">Tier manual (admin):</span>
      <Select
        value={tier}
        onChange={(e) => setTier(e.target.value as TierCliente)}
        aria-label="Tier manual"
        className="w-auto"
      >
        {(Object.keys(ETIQUETA_TIER) as TierCliente[]).map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_TIER[t]}
          </option>
        ))}
      </Select>
      <Button onClick={asignar} disabled={enviando} tamano="sm">
        {enviando ? '…' : 'Asignar'}
      </Button>
      {mensaje && <span className="text-texto-secundario">{mensaje}</span>}
    </Tarjeta>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-texto-secundario">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
