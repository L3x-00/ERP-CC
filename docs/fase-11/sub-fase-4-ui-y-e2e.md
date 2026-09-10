# Sub-fase 11.4 — UI funcional y gate E2E

## Implementación

`/configuracion` es una ruta RSC dinámica protegida por `configuracion`. La
interfaz se divide en pestañas de Empresa, Tarifas/TC, Áreas de trabajo,
Cuentas bancarias y Plantillas T1. Los formularios usan componentes UI
reutilizables, etiquetas accesibles, validación server-side y actualización
optimista solo del snapshot de pantalla tras una respuesta autorizada.

El sincronizador Realtime invalida `['configuracion']` y vuelve a leer la
proyección; no renderiza payloads de Supabase ni obliga a recargar el navegador.

## E2E

`tests/e2e/configuracion-flujo.spec.ts` es opt-in. Con credenciales ficticias
admin verifica guardar TC, persistencia tras nueva lectura y restauración del
valor original; con vendedor comprueba redirección/bloqueo. Sin
`E2E_HABILITAR_PRUEBAS_REMOTAS=si`, los casos se omiten de forma explícita.
