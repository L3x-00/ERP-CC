// @vitest-environment jsdom
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({historial:vi.fn(),recibo:vi.fn(),orden:vi.fn()}));
vi.mock('@/modulos/cobranza/acciones/consultar-historial',()=>({obtenerHistorialCuentaAccion:mocks.historial,obtenerReciboPagoAccion:mocks.recibo,obtenerDetalleOrdenCobranzaAccion:mocks.orden}));
import { HistorialCuenta, DetalleOrdenCobranza } from '@/modulos/cobranza/componentes/historial-cuenta';
import { imprimirRecibo } from '@/modulos/cobranza/componentes/recibo-persistido';
const historial={cuenta:{clienteNombre:'Cliente QA',folioOrden:'OP-1',saldoPendiente:20,moneda:'MXN'},pagos:{registros:[{id:'pago1',folioRecibo:'REC-000001',montoPagado:5,monedaPago:'USD',creadoEn:'2026-09-14T12:00:00Z',metodoPago:'transferencia'}],total:21,pagina:1,porPagina:20},movimientos:{registros:[],total:0,pagina:1,porPagina:20}};
const recibo={pagoId:'pago1',folioRecibo:'REC-000001',referenciaInterna:'INVCNC-0000001',fecha:'2026-09-14T12:00:00Z',folioOrden:'OP-1',folioFacturaRemision:null,clienteNombre:'Cliente QA',metodoPago:'transferencia',referenciaBancaria:null,notas:null,cuentaBancaria:null,montoPagado:5,monedaPago:'USD',tipoCambioPago:20,montoAplicadoAr:80,montoSobrepagoAr:20,monedaCuenta:'MXN',totalDocumento:100,saldoActualCuenta:0,estadoActualCuenta:'pagado',creditoMonederoMxn:20};
function montar(nodo:ReturnType<typeof createElement>){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(createElement(QueryClientProvider,{client},nodo));}
beforeEach(()=>{vi.clearAllMocks();mocks.historial.mockResolvedValue({exito:true,datos:historial});mocks.recibo.mockResolvedValue({exito:true,datos:recibo});});
afterEach(()=>{cleanup();vi.restoreAllMocks();document.querySelectorAll('iframe').forEach(x=>x.remove());});
it('recupera un pago persistido sin haberlo registrado en esta sesión',async()=>{
 montar(createElement(HistorialCuenta,{arId:'ar1',clienteId:'cliente1'}));
 fireEvent.click(await screen.findByRole('button',{name:'Ver recibo REC-000001'}));
 await screen.findByTestId('recibo-persistido');expect(mocks.recibo).toHaveBeenCalledWith({pagoId:'pago1'});
 expect(screen.getByText('Saldo actual de la cuenta')).toBeTruthy();expect(screen.getByText('Tipo de cambio del pago (MXN)')).toBeTruthy();expect(screen.getByText('Sobrepago')).toBeTruthy();
});
it('pagina los pagos sin alterar la página del monedero',async()=>{
 montar(createElement(HistorialCuenta,{arId:'ar1',clienteId:'cliente1'}));await screen.findByText('Pagos de la cuenta');
 fireEvent.click(within(screen.getByRole('navigation',{name:'Páginas de pagos'})).getByRole('button',{name:'Siguiente'}));
 await waitFor(()=>expect(mocks.historial).toHaveBeenCalledWith({arId:'ar1',clienteId:'cliente1',paginaPagos:2,paginaMovimientos:1}));
});
it('distingue error de vacío y permite reintentar',async()=>{
 mocks.historial.mockResolvedValueOnce({exito:false,error:'Red'});montar(createElement(HistorialCuenta,{arId:'ar1',clienteId:'cliente1'}));await screen.findByRole('alert');expect(screen.queryByText('Sin pagos registrados')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));await screen.findByText('Pagos de la cuenta');
});
it('muestra detalle de la orden seleccionada y sus partidas',async()=>{
 mocks.orden.mockResolvedValue({exito:true,datos:{folio:'OP-20',clienteNombre:'Cliente QA',estado:'completada',partidas:{registros:[{id:'p1',codigoPieza:'P-20',descripcion:'Placa',cantidadSolicitada:10,cantidadProducida:10,cantidadScrap:1,unidadMedida:'pza',maquinaAsignada:'Láser'}],total:1,pagina:1,porPagina:25}}});montar(createElement(DetalleOrdenCobranza,{ordenId:'op20'}));await screen.findByText('P-20 · Placa');expect(mocks.orden).toHaveBeenCalledWith({ordenId:'op20',paginaPartidas:1});
});
it('imprime solamente el recibo mediante copia de DOM, sin interpretar texto como HTML',async()=>{
 const imprimir=vi.fn();vi.spyOn(HTMLIFrameElement.prototype,'contentWindow','get').mockReturnValue({focus:vi.fn(),print:imprimir,addEventListener:vi.fn()} as unknown as Window);
 const zona=document.createElement('section');zona.textContent='Recibo <script>dato literal</script>';const secreto=document.createElement('p');secreto.textContent='Otra cuenta del panel';document.body.append(zona,secreto);
 await imprimirRecibo(zona);const marco=document.querySelector('iframe')!;expect(imprimir).toHaveBeenCalledOnce();expect(marco.contentDocument?.body.textContent).toBe(zona.textContent);expect(marco.contentDocument?.querySelector('script')).toBeNull();expect(marco.contentDocument?.body.textContent).not.toContain('Otra cuenta');zona.remove();secreto.remove();
});
