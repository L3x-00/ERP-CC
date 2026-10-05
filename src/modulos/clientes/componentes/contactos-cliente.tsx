'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { crearContactoClienteAccion } from '@/modulos/clientes/acciones/crear-contacto-cliente';
import { marcarContactoPrincipalAccion } from '@/modulos/clientes/acciones/marcar-contacto-principal';
import { desactivarContactoClienteAccion } from '@/modulos/clientes/acciones/desactivar-contacto-cliente';
import { reactivarContactoClienteAccion } from '@/modulos/clientes/acciones/reactivar-contacto-cliente';
import { filaAContactoCliente, type ContactoCliente } from '@/modulos/clientes/tipos/indice';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { CLAVE_CONTACTOS_CLIENTE, claveContactosCliente } from './claves-consulta';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

/**
 * Contactos del cliente (SII-B2.3): lista con alta inline, un solo principal
 * activo y baja lógica (desactivar/reactivar) con motivo. La lectura usa el
 * cliente RLS del navegador (`ver_clientes`); las mutaciones van por Server
 * Actions auditadas. No hay borrado duro de contactos.
 */
export function PanelContactos({ clienteId }: { clienteId: string }) {
  const clienteConsultas = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [puesto, setPuesto] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: claveContactosCliente(clienteId),
    queryFn: async () => {
      const cliente = crearClienteSupabase();
      const { data, error } = await cliente
        .from('contactos_cliente')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('activo', { ascending: false })
        .order('es_principal', { ascending: false })
        .order('creado_en', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(filaAContactoCliente);
    },
    staleTime: 30_000,
  });

  async function refrescar(): Promise<void> {
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CONTACTOS_CLIENTE });
  }

  async function agregar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await crearContactoClienteAccion({
        clienteId,
        nombre,
        puesto,
        correo,
        telefono,
        notas,
        esPrincipal,
      });
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        return;
      }
      setNombre('');
      setPuesto('');
      setCorreo('');
      setTelefono('');
      setNotas('');
      setEsPrincipal(false);
      setMensaje('Contacto agregado.');
      await refrescar();
    } catch {
      setMensaje('No se pudo comunicar el alta; vuelve a intentarlo');
    } finally {
      setGuardando(false);
    }
  }

  async function marcarPrincipal(contacto: ContactoCliente): Promise<void> {
    setMensaje(null);
    const respuesta = await marcarContactoPrincipalAccion({ id: contacto.id, clienteId });
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setMensaje('Contacto principal actualizado.');
    await refrescar();
  }

  async function reactivar(contacto: ContactoCliente): Promise<void> {
    setMensaje(null);
    const respuesta = await reactivarContactoClienteAccion({ id: contacto.id, clienteId });
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setMensaje('Contacto reactivado.');
    await refrescar();
  }

  const contactos = consulta.data ?? [];

  return (
    <section className="flex flex-col gap-4" data-testid="panel-contactos">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-texto-primario">Contactos</h3>
        <p className="text-xs text-texto-secundario">
          Compras, finanzas, mantenimiento… Solo un contacto principal activo; la baja es
          lógica y conserva el historial.
        </p>
      </div>

      {consulta.isLoading && <p className="text-sm text-texto-secundario">Cargando contactos…</p>}
      {consulta.isError && (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar los contactos.
        </p>
      )}

      {!consulta.isLoading && contactos.length === 0 && (
        <p className="text-sm text-texto-secundario">Sin contactos adicionales.</p>
      )}

      {contactos.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="lista-contactos">
          {contactos.map((contacto) => (
            <FilaContacto
              key={contacto.id}
              contacto={contacto}
              clienteId={clienteId}
              onMarcarPrincipal={marcarPrincipal}
              onReactivar={reactivar}
              onMensaje={setMensaje}
              onRefrescar={refrescar}
            />
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-2 rounded-lg border border-borde px-3 py-3" onSubmit={agregar} data-testid="formulario-contacto">
        <span className="text-sm font-medium text-texto-primario">Agregar contacto</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`contacto-nombre-${clienteId}`} obligatorio>Nombre del contacto</Label>
            <Input
              id={`contacto-nombre-${clienteId}`}
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`contacto-puesto-${clienteId}`}>Puesto o área</Label>
            <Input
              id={`contacto-puesto-${clienteId}`}
              value={puesto}
              onChange={(evento) => setPuesto(evento.target.value)}
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`contacto-correo-${clienteId}`}>Correo del contacto</Label>
            <Input
              id={`contacto-correo-${clienteId}`}
              type="email"
              value={correo}
              onChange={(evento) => setCorreo(evento.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`contacto-telefono-${clienteId}`}>Teléfono del contacto</Label>
            <Input
              id={`contacto-telefono-${clienteId}`}
              value={telefono}
              onChange={(evento) => setTelefono(evento.target.value)}
              maxLength={40}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`contacto-notas-${clienteId}`}>Notas del contacto</Label>
          <Input
            id={`contacto-notas-${clienteId}`}
            value={notas}
            onChange={(evento) => setNotas(evento.target.value)}
            maxLength={300}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-texto-secundario">
          <input
            type="checkbox"
            checked={esPrincipal}
            onChange={(evento) => setEsPrincipal(evento.target.checked)}
          />
          Contacto principal del cliente
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" variante="contorno" tamano="sm" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Agregar contacto'}
          </Button>
          {mensaje !== null && (
            <span role="status" className="text-xs text-texto-secundario">
              {mensaje}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

/** Fila de contacto con acciones de principal y baja lógica/reactivación. */
function FilaContacto({
  contacto,
  clienteId,
  onMarcarPrincipal,
  onReactivar,
  onMensaje,
  onRefrescar,
}: {
  contacto: ContactoCliente;
  clienteId: string;
  onMarcarPrincipal: (contacto: ContactoCliente) => Promise<void>;
  onReactivar: (contacto: ContactoCliente) => Promise<void>;
  onMensaje: (mensaje: string | null) => void;
  onRefrescar: () => Promise<void>;
}) {
  const [desactivando, setDesactivando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);

  async function confirmarBaja(): Promise<void> {
    setProcesando(true);
    onMensaje(null);
    const respuesta = await desactivarContactoClienteAccion({
      id: contacto.id,
      clienteId,
      motivo,
      actualizadoEn: contacto.actualizadoEn,
    });
    setProcesando(false);
    if (!respuesta.exito) {
      onMensaje(respuesta.error);
      return;
    }
    setDesactivando(false);
    setMotivo('');
    onMensaje('Contacto desactivado.');
    await onRefrescar();
  }

  return (
    <li
      className="flex flex-col gap-2 border-b border-borde/60 pb-2 text-sm"
      data-testid={`contacto-${contacto.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2 font-medium text-texto-primario">
            {contacto.nombre}
            {contacto.puesto ? <span className="text-texto-secundario">· {contacto.puesto}</span> : null}
            {contacto.esPrincipal && (
              <span className="rounded-full bg-acento/10 px-2 py-0.5 text-xs font-medium text-acento">
                Principal
              </span>
            )}
            {!contacto.activo && (
              <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-xs font-medium text-texto-secundario">
                Inactivo
              </span>
            )}
          </span>
          <span className="text-xs text-texto-secundario">
            {[contacto.correo, contacto.telefono]
              .filter((valor) => valor !== null)
              .join(' · ') || 'Sin datos de contacto'}
          </span>
          {contacto.notas && <span className="text-xs text-texto-tenue">{contacto.notas}</span>}
          {!contacto.activo && contacto.desactivadoEn && (
            <span className="text-xs text-texto-tenue">
              Desactivado el {formatearFecha(contacto.desactivadoEn)}
            </span>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {contacto.activo && !contacto.esPrincipal && (
            <Button
              type="button"
              variante="fantasma"
              tamano="sm"
              aria-label={`Marcar ${contacto.nombre} como principal`}
              onClick={() => void onMarcarPrincipal(contacto)}
            >
              Marcar principal
            </Button>
          )}
          {contacto.activo && !desactivando && (
            <Button
              type="button"
              variante="fantasma"
              tamano="sm"
              aria-label={`Desactivar contacto ${contacto.nombre}`}
              onClick={() => setDesactivando(true)}
            >
              Desactivar
            </Button>
          )}
          {!contacto.activo && (
            <Button
              type="button"
              variante="fantasma"
              tamano="sm"
              aria-label={`Reactivar contacto ${contacto.nombre}`}
              onClick={() => void onReactivar(contacto)}
            >
              Reactivar
            </Button>
          )}
        </div>
      </div>

      {desactivando && (
        <div className="flex flex-col gap-2 rounded-base border border-borde p-2">
          <label htmlFor={`motivo-baja-${contacto.id}`} className="text-xs font-medium">
            Motivo de la baja
          </label>
          <textarea
            id={`motivo-baja-${contacto.id}`}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            maxLength={300}
            rows={2}
            className="rounded-base border border-borde-fuerte bg-superficie px-2 py-1 text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variante="destructivo"
              tamano="sm"
              onClick={() => void confirmarBaja()}
              disabled={procesando || motivo.trim().length < 3}
            >
              {procesando ? '…' : 'Confirmar baja'}
            </Button>
            <Button
              type="button"
              variante="fantasma"
              tamano="sm"
              onClick={() => setDesactivando(false)}
              disabled={procesando}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
