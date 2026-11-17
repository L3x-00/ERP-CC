# Resultado costeo y propuesta A

```json
{
  "resultados": [
    {
      "etapa": "00_sesion",
      "paso": "login",
      "resultado": "ok",
      "detalle": null
    },
    {
      "etapa": "02_oportunidad",
      "paso": "verificar-pipeline-redirige",
      "resultado": "ok",
      "detalle": {
        "url": "https://erp-cc-flame.vercel.app/rfq",
        "nota": "/pipeline redirige a /rfq; no hay pantalla de oportunidad ni avance de etapas"
      }
    },
    {
      "etapa": "04_propuesta_versiones",
      "paso": "crear-propuesta",
      "resultado": "ok",
      "detalle": {
        "encabezado": "Propuestas",
        "folio": "Propuestas",
        "url": "https://erp-cc-flame.vercel.app/propuestas?propuesta=2456f6e1-2298-4e16-b6d1-7a535d39532b"
      }
    },
    {
      "etapa": "04_propuesta_versiones",
      "paso": "precios-items",
      "resultado": "ok",
      "detalle": {
        "precios": {
          "IT01": "1850",
          "IT02": "980"
        },
        "tabla": "← Cola de propuestas\nCNC-1126_08\nBorrador\n\nManufactura Fronteriza QA1711 S.A. de C.V.\n\nA · Borrador\nRevisión A\nBorrador\nValidar\nRechazar\nCerrar\n\nTodavía no puedes validar: falta lo siguiente\n\nNo se perdió nada de tu trabajo. Completa estos puntos y «Validar» se habilitará solo.\n\nítem IT01: costear el ruteo\nítem IT02: costear el ruteo\nIr a Ruteo/Costeo\nConfigurar tarifas\nResumen\nÍtems\nRuteo/Costeo\nArchivos\nPDFs\nSeguimiento\nActividad\nSubtotal de venta\n$112,100.00\nIVA (16%)\n$17,936.00\nTotal cliente\n$130,036.00\nCosto estimado total\n$0.00\nITxx\tDescripción\tMaterial\tEspesor\tCantidad\tPrecio unitario\tImporte\tOrigen\tEstado\t\nIT01\t\tAcero al carbón calibre 14\tcal 14\t\t\t$92,500.00\tHeredado del RFQ\t\nDescuento\nActivo\n\tGuardar\nIT02\t\tMDF 12 mm\t12 mm\t\t\t$19,600.00\tHeredado del RFQ\t\nDescuento\nActivo\n\t…\nNuevo ítem\n\nEstado de la revisión: \nBorrador"
      }
    },
    {
      "etapa": "03_costeo",
      "paso": "ruteo-y-costeo",
      "resultado": "ok",
      "detalle": {
        "datos": {
          "IT01": {
            "grupo": "084f55af-3726-4fbf-89a1-934a2a8e7db0",
            "origen": "Tarifa / Origen\n$512.50/h\nTarifa del grupo «Laser Fibra»"
          },
          "IT02": {
            "grupo": "34a1fe0f-63cc-403d-a475-28c146b339ee",
            "origen": "Tarifa / Origen\n$850.00/h\nTarifa del grupo «CNC Router»"
          }
        },
        "habilitado": false,
        "fabricacion": "Costo total estimado de fabricación\n\nEste desglose muestra los procesos de cada partida; no agrega ítems comerciales. El PDF de la propuesta solo incluye las partidas activas, una vez cada una.\n\nRegla V1: tarifa propia de la máquina → tarifa estándar del grupo de equipo (definida en Tarifas / TC) → tarifa de respaldo, siempre señalada. Cada operación muestra el origen de la tarifa que realmente usó.\n\nSin ruteo costeado todavía. Pulsa «Costear ruteo» para ver el tiempo por uso y el costo de cada proceso.\n\nÍtem\tProceso\tMáquina / grupo\tOrigen de la tarifa\tPreparación (h)\tOperación (h)\tTotal (h)\tTarifa (h)\tCosto\nEl desglose se llena al costear el ruteo.\nCosto de ruteo (tiempo por uso)\t$0.00\nOtros costos manuales\t$1,570.00\nTotal estimado de fabricación\t$1,570.00",
        "importes": "Subtotal de venta\n$0.00\nIVA (16%)\n$0.00\nTotal cliente\n$0.00\nCosto estimado total\n$1,570.00"
      }
    },
    {
      "etapa": "04_propuesta_versiones",
      "paso": "archivos-y-validar",
      "resultado": "error",
      "detalle": "locator.click: Timeout 12000ms exceeded.\nCall log:\n\u001b[2m  - waiting for getByTestId('ficha-propuesta').getByRole('button', { name: 'Validar', exact: true }).first()\u001b[22m\n\u001b[2m    - locator resolved to <button disabled type=\"button\" title=\"Completa lo marcado en rojo antes de validar\" class=\"inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[background-color,color,box-shadow,transform] duration-200 ease-suave active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie bg-acento-hover text-white …>Validar</button>\u001b[22m\n\u001b[2m  - attempting click action\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is not enabled\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m    - waiting 20ms\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is not enabled\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m      - waiting 100ms\u001b[22m\n\u001b[2m    23 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m       - element is not enabled\u001b[22m\n\u001b[2m     - retrying click action\u001b[22m\n\u001b[2m       - waiting 500ms\u001b[22m\n"
    }
  ],
  "hallazgos": [
    {
      "severidad": "media",
      "etapa": "04_propuesta_versiones",
      "paso": "archivos-y-validar",
      "mensaje": "locator.click: Timeout 12000ms exceeded.\nCall log:\n\u001b[2m  - waiting for getByTestId('ficha-propuesta').getByRole('button', { name: 'Validar', exact: true }).first()\u001b[22m\n\u001b[2m    - locator resolved to <button disabled type=\"button\" title=\"Completa lo marcado en rojo antes de validar\" class=\"inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[background-color,color,box-shadow,transform] duration-200 ease-suave active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie bg-acento-hover text-white …>Validar</button>\u001b[22m\n\u001b[2m  - attempting click action\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is not enabled\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m    - waiting 20ms\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is not enabled\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m      - waiting 100ms\u001b[22m\n\u001b[2m    23 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m       - element is not enabled\u001b[22m\n\u001b[2m     - retrying click action\u001b[22m\n\u001b[2m       - waiting 500ms\u001b[22m\n"
    }
  ],
  "ESTADO": {
    "sufijo": "QA1711",
    "razon": "Manufactura Fronteriza QA1711 S.A. de C.V.",
    "rfqId": "cc86f00f-fb5e-413c-a7f5-e8b788c86f7a",
    "rfqFolio": "RFQ-1126_08",
    "rfqUrl": "https://erp-cc-flame.vercel.app/rfq?rfq=cc86f00f-fb5e-413c-a7f5-e8b788c86f7a&continuar=1",
    "rfqEstado": "READY_FOR_PROPOSAL",
    "folioCnc": "Propuestas",
    "propuestaUrl": "https://erp-cc-flame.vercel.app/propuestas?propuesta=2456f6e1-2298-4e16-b6d1-7a535d39532b",
    "propuestaId": "2456f6e1-2298-4e16-b6d1-7a535d39532b"
  }
}
```
