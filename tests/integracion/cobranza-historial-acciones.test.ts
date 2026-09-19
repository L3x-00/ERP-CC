import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({usuario:vi.fn(),permiso:vi.fn(),cliente:vi.fn(),historial:vi.fn(),orden:vi.fn(),recibo:vi.fn()}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor',()=>({obtenerUsuarioServidor:mocks.usuario}));
vi.mock('@/nucleo/autenticacion/verificar-permiso',()=>({can:mocks.permiso}));
vi.mock('@/nucleo/supabase/servidor',()=>({crearClienteSupabaseServidor:mocks.cliente}));
vi.mock('@/modulos/cobranza/servicios/historial-cobranza-servicio',()=>({obtenerHistorialCuentaServicio:mocks.historial,obtenerDetalleOrdenCobranzaServicio:mocks.orden,obtenerReciboPagoServicio:mocks.recibo}));
import { obtenerHistorialCuentaAccion, obtenerDetalleOrdenCobranzaAccion, obtenerReciboPagoAccion } from '@/modulos/cobranza/acciones/consultar-historial';
const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.resetAllMocks();mocks.usuario.mockResolvedValue({id,activo:true});mocks.permiso.mockResolvedValue(true);mocks.cliente.mockResolvedValue({sesion:'usuario'});});
describe('consultas de cobranza autorizadas',()=>{
 it('rechaza entradas inválidas antes de abrir cliente',async()=>{expect((await obtenerHistorialCuentaAccion({arId:'inválido'})).exito).toBe(false);expect(mocks.cliente).not.toHaveBeenCalled();});
 it.each([null,{id,activo:true}])('impide acceso sin sesión o permiso: %j',async usuario=>{mocks.usuario.mockResolvedValue(usuario);mocks.permiso.mockResolvedValue(false);expect((await obtenerReciboPagoAccion({pagoId:id})).exito).toBe(false);expect(mocks.recibo).not.toHaveBeenCalled();});
 it('transmite cliente esperado y paginación a lectura bajo sesión',async()=>{mocks.historial.mockResolvedValue({pagos:[]});expect(await obtenerHistorialCuentaAccion({arId:id,clienteId:id,paginaPagos:2})).toEqual({exito:true,datos:{pagos:[]}});expect(mocks.historial).toHaveBeenCalledWith({sesion:'usuario'},{arId:id,clienteId:id,paginaPagos:2});expect(mocks.permiso).toHaveBeenCalledWith({id,activo:true},'ver_finanzas');});
 it('recupera recibo y orden sin ninguna mutación',async()=>{mocks.recibo.mockResolvedValue({folioRecibo:'QA-001'});mocks.orden.mockResolvedValue({folio:'OP-QA'});expect((await obtenerReciboPagoAccion({pagoId:id})).exito).toBe(true);expect((await obtenerDetalleOrdenCobranzaAccion({ordenId:id})).exito).toBe(true);});
 it('no expone detalles internos de errores ni cuenta ajena',async()=>{mocks.historial.mockRejectedValue(new Error('cuenta_cliente_no_corresponde SQL interno'));const resultado=await obtenerHistorialCuentaAccion({arId:id,clienteId:id});expect(resultado).toEqual({exito:false,error:'No se pudo recuperar la información de cobranza'});});
});
