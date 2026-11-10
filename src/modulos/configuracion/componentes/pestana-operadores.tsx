'use client';

import { useState, type FormEvent } from 'react';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { guardarOperadorAccion } from '@/modulos/configuracion/acciones/indice';
import type { OperadorGestionConfig } from '@/modulos/configuracion/servicios/operadores-servicio';

type ModoDialogo = 'nuevo' | 'editar' | 'reactivar';

/**
 * UI-04: alta y edición de operadores en un diálogo compacto. Se conservan las
 * validaciones del PIN, el estado y la sincronización con el piso.
 */
export function PestanaOperadores({
  operadores,
  onCambio,
  onIrAAreas,
}: {
  operadores: readonly OperadorGestionConfig[];
  onCambio: () => Promise<void>;
  onIrAAreas?: () => void;
}) {
  const [dialogo, setDialogo] = useState<{ modo: ModoDialogo; operador: OperadorGestionConfig | null } | null>(null);
  const [retiro, setRetiro] = useState<OperadorGestionConfig | null>(null);
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorRetiro, setErrorRetiro] = useState<string | null>(null);

  function abrirNuevo(): void {
    setDialogo({ modo: 'nuevo', operador: null });
    setNombre('');
    setPin('');
    setMensaje(null);
    setError(null);
  }

  function abrirEdicion(operador: OperadorGestionConfig, modo: ModoDialogo = 'editar'): void {
    setDialogo({ modo, operador });
    setNombre(operador.nombre);
    setPin('');
    setMensaje(null);
    setError(null);
  }

  function cerrarDialogo(): void {
    if (ocupado) return;
    setDialogo(null);
    setError(null);
    setPin('');
  }

  async function ejecutar(): Promise<void> {
    if (!dialogo) return;
    const activo = dialogo.modo === 'reactivar' ? true : dialogo.modo === 'nuevo' ? true : dialogo.operador?.activo ?? true;
    setOcupado(true);
    setMensaje(null);
    setError(null);
    try {
      const respuesta = await guardarOperadorAccion({
        ...(dialogo.operador ? { id: dialogo.operador.id } : {}),
        nombre,
        pin: pin || null,
        activo,
      });
      if (!respuesta.exito) {
        setError(respuesta.error);
        return;
      }
      const confirmacion = dialogo.modo === 'editar'
        ? 'Operador actualizado'
        : dialogo.modo === 'reactivar'
          ? 'Operador reactivado'
          : 'Operador creado';
      setDialogo(null);
      setNombre('');
      setPin('');
      setMensaje(confirmacion);
      await onCambio();
    } catch {
      setError('No se pudo actualizar el operador. Intenta de nuevo.');
    } finally {
      setPin('');
      setOcupado(false);
    }
  }

  function guardar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void ejecutar();
  }

  async function confirmarRetiro(): Promise<void> {
    if (!retiro) return;
    setOcupado(true);
    setErrorRetiro(null);
    try {
      const respuesta = await guardarOperadorAccion({
        id: retiro.id,
        nombre: retiro.nombre,
        pin: null,
        activo: false,
      });
      if (!respuesta.exito) {
        setErrorRetiro(respuesta.error);
        return;
      }
      setRetiro(null);
      setMensaje('Operador retirado');
      await onCambio();
    } catch {
      setErrorRetiro('No se pudo retirar el operador. Intenta de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  const pinObligatorio = dialogo?.modo !== 'editar';

  return (
    <div className="grid gap-4" data-testid="configuracion-operadores">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-texto-primario">Operadores de piso</h2>
          <p className="text-sm text-texto-secundario">
            Administra el acceso por PIN sin borrar el historial de trabajo. Las áreas autorizadas
            se asignan en Áreas de trabajo.
          </p>
        </div>
        <Button type="button" tamano="lg" variante="contorno" onClick={abrirNuevo} data-testid="nuevo-operador-config">
          Nuevo operador
        </Button>
      </div>

      {operadores.length === 0 ? (
        <EstadoVacio
          titulo="Sin operadores"
          descripcion="Crea un operador para iniciar trabajo en el piso."
        />
      ) : (
        <ul className="grid gap-2">
          {operadores.map((operador) => (
            <li
              key={operador.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borde bg-superficie p-3"
              data-testid={`operador-config-${operador.id}`}
            >
              <div className="grid gap-1">
                <span className="font-medium text-texto-primario">{operador.nombre}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
                  <BadgeEstado estado={operador.activo ? 'activo' : 'inactivo'} />
                  {operador.pinConfigurado ? 'PIN configurado' : 'Sin PIN'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {onIrAAreas ? (
                  <Button
                    tamano="lg"
                    variante="fantasma"
                    disabled={ocupado}
                    onClick={onIrAAreas}
                    data-testid={`asignar-areas-operador-${operador.id}`}
                  >
                    Áreas autorizadas
                  </Button>
                ) : null}
                {operador.activo ? (
                  <>
                    <Button tamano="lg" variante="contorno" disabled={ocupado} onClick={() => abrirEdicion(operador)}>
                      Editar
                    </Button>
                    <Button
                      tamano="lg"
                      variante="destructivo"
                      disabled={ocupado}
                      onClick={() => {
                        setMensaje(null);
                        setErrorRetiro(null);
                        setRetiro(operador);
                      }}
                    >
                      Retirar
                    </Button>
                  </>
                ) : (
                  <Button
                    tamano="lg"
                    variante="secundario"
                    disabled={ocupado}
                    onClick={() => abrirEdicion(operador, 'reactivar')}
                  >
                    Reactivar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {mensaje ? (
        <p role="status" data-testid="operador-config-mensaje" className="text-sm text-exito-texto">
          {mensaje}
        </p>
      ) : null}

      {dialogo ? (
        <Dialog open onOpenChange={(abierto) => (!abierto ? cerrarDialogo() : undefined)}>
          <DialogContent data-testid="dialogo-operador-config">
            <DialogHeader>
              <DialogTitle>
                {dialogo.modo === 'nuevo'
                  ? 'Nuevo operador'
                  : dialogo.modo === 'reactivar'
                    ? `Reactivar ${dialogo.operador?.nombre ?? ''}`
                    : `Editar ${dialogo.operador?.nombre ?? ''}`}
              </DialogTitle>
              <DialogDescription>
                El PIN permite iniciar sesión en el piso. Al cambiarlo, las sesiones anteriores dejan de funcionar.
              </DialogDescription>
            </DialogHeader>

            <form className="grid gap-3" onSubmit={guardar} aria-label="Editor de operador">
              <div className="grid gap-1.5">
                <Label htmlFor="operador-config-nombre" obligatorio>Nombre completo</Label>
                <Input
                  id="operador-config-nombre"
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value)}
                  minLength={3}
                  maxLength={120}
                  required
                  data-testid="operador-config-nombre"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="operador-config-pin" obligatorio={pinObligatorio}>
                  {pinObligatorio ? 'PIN nuevo' : 'PIN nuevo (opcional)'}
                </Label>
                <Input
                  id="operador-config-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{4,6}"
                  minLength={4}
                  maxLength={6}
                  required={pinObligatorio}
                  value={pin}
                  onChange={(evento) => setPin(evento.target.value.replace(/\D/g, '').slice(0, 6))}
                  aria-label={pinObligatorio ? 'PIN nuevo' : 'PIN nuevo (opcional)'}
                  data-testid="operador-config-pin"
                />
                <p className="text-xs text-texto-secundario">Usa de 4 a 6 dígitos.</p>
              </div>

              {error ? (
                <p role="alert" data-testid="operador-config-error" className="text-sm text-peligro-texto">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button type="button" variante="contorno" onClick={cerrarDialogo} disabled={ocupado} data-testid="cancelar-operador-config">
                  Cancelar
                </Button>
                <Button type="submit" tamano="lg" disabled={ocupado} data-testid="guardar-operador-config">
                  {ocupado
                    ? 'Guardando…'
                    : dialogo.modo === 'nuevo'
                      ? 'Crear operador'
                      : dialogo.modo === 'reactivar'
                        ? 'Reactivar operador'
                        : 'Guardar operador'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {retiro ? (
        <Dialog open onOpenChange={(abierto) => (!abierto && !ocupado ? setRetiro(null) : undefined)}>
          <DialogContent data-testid="dialogo-retiro-operador">
            <DialogHeader>
              <DialogTitle>Retirar a {retiro.nombre}</DialogTitle>
              <DialogDescription>
                Perderá acceso inmediatamente; su historial de trabajo se conservará. Podrás
                reactivarlo después con un PIN nuevo.
              </DialogDescription>
            </DialogHeader>
            {errorRetiro ? (
              <p role="alert" className="text-sm text-peligro-texto" data-testid="retiro-operador-error">
                {errorRetiro}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variante="contorno" onClick={() => setRetiro(null)} disabled={ocupado}>
                Cancelar
              </Button>
              <Button
                type="button"
                variante="destructivo"
                onClick={() => void confirmarRetiro()}
                disabled={ocupado}
                data-testid="confirmar-retiro-operador"
              >
                {ocupado ? 'Retirando…' : 'Retirar operador'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
