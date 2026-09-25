'use client';

import { useState, type FormEvent } from 'react';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { guardarOperadorAccion } from '@/modulos/configuracion/acciones/indice';
import type { OperadorGestionConfig } from '@/modulos/configuracion/servicios/operadores-servicio';

export function PestanaOperadores({
  operadores,
  onCambio,
}: {
  operadores: readonly OperadorGestionConfig[];
  onCambio: () => Promise<void>;
}) {
  const [seleccionado, setSeleccionado] = useState<OperadorGestionConfig | null>(null);
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [reactivar, setReactivar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function editar(operador: OperadorGestionConfig, activar = false): void {
    setSeleccionado(operador);
    setNombre(operador.nombre);
    setPin('');
    setReactivar(activar);
    setMensaje(null);
    setError(null);
  }

  function nuevo(): void {
    setSeleccionado(null);
    setNombre('');
    setPin('');
    setReactivar(false);
    setMensaje(null);
    setError(null);
  }

  async function ejecutar(entrada: { id?: string; nombre: string; pin: string | null; activo: boolean }, confirmacion: string): Promise<void> {
    setOcupado(true);
    setMensaje(null);
    setError(null);
    try {
      const respuesta = await guardarOperadorAccion(entrada);
      if (!respuesta.exito) {
        setError(respuesta.error);
        return;
      }
      nuevo();
      setMensaje(confirmacion);
      await onCambio();
    } catch {
      setError('No se pudo actualizar el operador. Intenta de nuevo.');
    } finally {
      // No mantener el PIN en memoria del formulario después de cada intento.
      setPin('');
      setOcupado(false);
    }
  }

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const activo = seleccionado?.activo === false ? reactivar : true;
    await ejecutar({
      ...(seleccionado ? { id: seleccionado.id } : {}),
      nombre,
      pin: pin || null,
      activo,
    }, seleccionado ? (reactivar ? 'Operador reactivado' : 'Operador actualizado') : 'Operador creado');
  }

  async function retirar(operador: OperadorGestionConfig): Promise<void> {
    if (!window.confirm(`¿Retirar a ${operador.nombre}? Perderá acceso inmediatamente; su historial se conservará.`)) return;
    await ejecutar({ id: operador.id, nombre: operador.nombre, pin: null, activo: false }, 'Operador retirado');
  }

  const pinObligatorio = !seleccionado || reactivar;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]" data-testid="configuracion-operadores">
      <section className="grid content-start gap-3" aria-labelledby="titulo-operadores-config">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="titulo-operadores-config" className="text-lg font-semibold text-texto-primario">Operadores de piso</h2>
            <p className="text-sm text-texto-secundario">Administra el acceso por PIN sin borrar el historial de trabajo.</p>
          </div>
          <Button tamano="lg" variante="contorno" onClick={nuevo}>Nuevo operador</Button>
        </div>
        {operadores.length === 0 ? (
          <EstadoVacio titulo="Sin operadores" descripcion="Crea un operador para iniciar trabajo en el piso." />
        ) : (
          <ul className="grid gap-2">
            {operadores.map((operador) => (
              <li key={operador.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borde bg-superficie p-3" data-testid={`operador-config-${operador.id}`}>
                <div className="grid gap-1">
                  <span className="font-medium text-texto-primario">{operador.nombre}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
                    <BadgeEstado estado={operador.activo ? 'activo' : 'inactivo'} />
                    {operador.pinConfigurado ? 'PIN configurado' : 'Sin PIN'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {operador.activo ? (
                    <>
                      <Button tamano="lg" variante="contorno" disabled={ocupado} onClick={() => editar(operador)}>Editar</Button>
                      <Button tamano="lg" variante="destructivo" disabled={ocupado} onClick={() => void retirar(operador)}>Retirar</Button>
                    </>
                  ) : (
                    <Button tamano="lg" variante="secundario" disabled={ocupado} onClick={() => editar(operador, true)}>Reactivar</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <form className="grid content-start gap-3 rounded-lg border border-borde bg-superficie p-4" onSubmit={(evento) => void guardar(evento)} aria-label="Editor de operador">
        <h2 className="text-lg font-semibold text-texto-primario">{seleccionado ? `${reactivar ? 'Reactivar' : 'Editar'} ${seleccionado.nombre}` : 'Nuevo operador'}</h2>
        <label className="grid gap-1 text-sm font-medium" htmlFor="operador-config-nombre">
          Nombre completo
          <Input id="operador-config-nombre" value={nombre} onChange={(evento) => setNombre(evento.target.value)} minLength={3} maxLength={120} required />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="operador-config-pin">
          {pinObligatorio ? 'PIN nuevo' : 'PIN nuevo (opcional)'}
          <Input id="operador-config-pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required={pinObligatorio} value={pin} onChange={(evento) => setPin(evento.target.value.replace(/\D/g, '').slice(0, 6))} />
        </label>
        <p className="text-xs text-texto-secundario">Usa de 4 a 6 dígitos. Al cambiarlo, las sesiones anteriores dejarán de funcionar.</p>
        <Button type="submit" tamano="lg" disabled={ocupado} data-testid="guardar-operador-config">
          {ocupado ? 'Guardando…' : !seleccionado ? 'Crear operador' : reactivar ? 'Reactivar operador' : 'Guardar operador'}
        </Button>
        {error ? <p role="alert" data-testid="operador-config-error" className="text-sm text-peligro-texto">{error}</p> : null}
        {mensaje ? <p role="status" data-testid="operador-config-mensaje" className="text-sm text-exito-texto">{mensaje}</p> : null}
      </form>
    </div>
  );
}
