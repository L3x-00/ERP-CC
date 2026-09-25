// @vitest-environment jsdom
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CuentaCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';
const { bancos } = vi.hoisted(() => ({ bancos: vi.fn() }));
vi.mock('@/modulos/cobranza/acciones/consultar-historial', () => ({ obtenerCuentasBancariasAccion: bancos }));
import { ModalRegistrarPago } from '@/modulos/cobranza/componentes/modal-registrar-pago';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const cuenta: CuentaCartera = { id:id(1),referenciaInterna:'INVCNC-0000001',clienteId:id(2),ordenId:id(3),folioOrden:'OP-QA',clienteNombre:'Cliente QA',saldoAFavorMxn:500,montoTotal:100,saldoPendiente:100,moneda:'MXN',tipoCambioOrigen:1,estado:'pendiente',estadoProduccion:'completada',folioFacturaRemision:null,fechaEmision:'2026-09-01T12:00:00Z',fechaVencimiento:'2026-09-30T12:00:00Z',cobrableDesde:'2026-09-30T12:00:00Z',creadoEn:'2026-09-01T12:00:00Z',actualizadoEn:'2026-09-01T12:00:00Z' };
function montar(pago=vi.fn().mockResolvedValue({exito:true}), saldo=vi.fn().mockResolvedValue({exito:true})) {
 const cerrar=vi.fn(); const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const props={cuenta,abierto:true,procesando:false,onAbiertoChange:cerrar,onRegistrarPago:pago,onAplicarSaldo:saldo};
 render(createElement(QueryClientProvider,{client},createElement(ModalRegistrarPago,props)));
 return {pago,saldo,cerrar};
}
beforeEach(()=>{vi.clearAllMocks();bancos.mockImplementation(async ({moneda})=>({exito:true,datos:[{id:id(4),banco:'Banco QA',numeroCuentaEnmascarado:'••••1234',moneda,titular:'Empresa'}]}));});
afterEach(cleanup);
describe('registro de pagos seguro',()=>{
 it('normaliza MXN a1 tras cambiar desde USD y envía banco elegido',async()=>{
  const {pago}=montar();await screen.findByText(/Banco QA/);
  fireEvent.change(screen.getByLabelText('Moneda de pago'),{target:{value:'USD'}});
  fireEvent.change(screen.getByLabelText(/Tipo de cambio/),{target:{value:'20'}});
  fireEvent.change(screen.getByLabelText('Moneda de pago'),{target:{value:'MXN'}});
  expect((screen.getByLabelText(/Tipo de cambio/) as HTMLInputElement).value).toBe('1');
  expect((screen.getByLabelText(/Tipo de cambio/) as HTMLInputElement).disabled).toBe(true);
  await screen.findByText(/Banco QA/);
  fireEvent.change(screen.getByLabelText(/Cuenta bancaria/),{target:{value:id(4)}});
  fireEvent.change(screen.getByLabelText(/^Monto/),{target:{value:'25'}});
  fireEvent.click(screen.getByRole('button',{name:'Registrar pago'}));
  await waitFor(()=>expect(pago).toHaveBeenCalledOnce());
  expect(pago.mock.calls[0][0]).toMatchObject({arId:id(1),monedaPago:'MXN',tipoCambioPago:1,cuentaBancariaId:id(4),montoPagado:25});
 });
 it('conserva intención y bloquea cambios/cierre tras respuesta ambigua',async()=>{
  const pago=vi.fn().mockResolvedValueOnce({exito:false,error:'Sin respuesta'}).mockResolvedValueOnce({exito:true});
  const {cerrar}=montar(pago);await screen.findByText(/Banco QA/);
  fireEvent.change(screen.getByLabelText(/^Monto/),{target:{value:'25'}});
  fireEvent.click(screen.getByRole('button',{name:'Registrar pago'}));
  await screen.findByText('Sin respuesta');
  expect(screen.getByLabelText(/^Monto/).closest('fieldset')?.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Cerrar'}));expect(cerrar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Reintentar pago'}));
  await waitFor(()=>expect(pago).toHaveBeenCalledTimes(2));expect(pago.mock.calls[1][0]).toEqual(pago.mock.calls[0][0]);
  await waitFor(()=>expect(cerrar).toHaveBeenCalledWith(false));
 });
 it('rechazo confirmado permite corregir con intención nueva',async()=>{
  const pago=vi.fn().mockResolvedValueOnce({exito:false,error:'Banco inactivo',rechazoConfirmado:true}).mockResolvedValueOnce({exito:true});montar(pago);
  await screen.findByText(/Banco QA/);fireEvent.change(screen.getByLabelText(/^Monto/),{target:{value:'25'}});fireEvent.click(screen.getByRole('button',{name:'Registrar pago'}));await screen.findByText('Banco inactivo');
  fireEvent.change(screen.getByLabelText(/^Monto/),{target:{value:'30'}});fireEvent.click(screen.getByRole('button',{name:'Registrar pago'}));await waitFor(()=>expect(pago).toHaveBeenCalledTimes(2));
  expect(pago.mock.calls[1][0].solicitudId).not.toBe(pago.mock.calls[0][0].solicitudId);expect(pago.mock.calls[1][0].montoPagado).toBe(30);
 });
 it('impide doble envío aunque padre aún no cambie procesando',async()=>{
  let resolver!: (valor:{exito:boolean})=>void;const pago=vi.fn(()=>new Promise<{exito:boolean}>(resolve=>{resolver=resolve;}));montar(pago);await screen.findByText(/Banco QA/);
  fireEvent.change(screen.getByLabelText(/^Monto/),{target:{value:'25'}});const form=screen.getByRole('button',{name:'Registrar pago'}).closest('form')!;fireEvent.submit(form);fireEvent.submit(form);expect(pago).toHaveBeenCalledOnce();resolver({exito:true});await waitFor(()=>expect(screen.queryByText('Registrando…')).toBeNull());
 });
 it('saldo a favor usa importe MXN y no se puede cambiar a pago tras fallo ambiguo',async()=>{
  const saldo=vi.fn().mockRejectedValue(new Error('Red'));const {pago}=montar(undefined,saldo);await screen.findByText(/Banco QA/);fireEvent.change(screen.getByLabelText(/^Monto/),{target:{value:'25'}});fireEvent.click(screen.getByRole('button',{name:'Aplicar saldo a favor (MXN)'}));await screen.findByText(/No se recibió confirmación/);
  expect(saldo.mock.calls[0][0]).toMatchObject({clienteId:id(2),arId:id(1),montoAAplicar:25});expect((screen.getByRole('button',{name:'Registrar pago'}) as HTMLButtonElement).disabled).toBe(true);expect(pago).not.toHaveBeenCalled();
 });
 it('validación evita enviar montos inválidos',async()=>{const {pago}=montar();await screen.findByText(/Banco QA/);fireEvent.change(screen.getByLabelText(/^Monto/),{target:{value:'-1'}});fireEvent.submit(screen.getByRole('button',{name:'Registrar pago'}).closest('form')!);expect(pago).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('mayor a 0');});
});
