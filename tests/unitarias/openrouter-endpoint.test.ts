import { describe, expect, it } from 'vitest';
import {
  MODELO_VISION_POR_DEFECTO,
  resolverUrlChatCompletions,
} from '@/nucleo/ia/cliente-openrouter';

const OFICIAL = 'https://openrouter.ai/api/v1/chat/completions';

describe('endpoint de OpenRouter (GAS-08)', () => {
  it('usa el endpoint oficial sin configuración', () => {
    expect(resolverUrlChatCompletions({})).toBe(OFICIAL);
    expect(resolverUrlChatCompletions({ OPENROUTER_BASE_URL: '' })).toBe(OFICIAL);
  });

  it('solo acepta un override explícito hacia loopback', () => {
    const loopback = 'http://127.0.0.1:4599/api/v1/chat/completions';
    expect(
      resolverUrlChatCompletions({
        OPENROUTER_BASE_URL: loopback,
        OPENROUTER_PERMITIR_ENDPOINT_LOCAL: 'si',
      }),
    ).toBe(loopback);

    // Sin el flag de permiso, el override se ignora.
    expect(resolverUrlChatCompletions({ OPENROUTER_BASE_URL: loopback })).toBe(OFICIAL);
    // Un host remoto no puede secuestrar el proveedor aunque el flag exista.
    expect(
      resolverUrlChatCompletions({
        OPENROUTER_BASE_URL: 'https://proveedor-malicioso.example/api',
        OPENROUTER_PERMITIR_ENDPOINT_LOCAL: 'si',
      }),
    ).toBe(OFICIAL);
    // Una URL inválida cae al endpoint oficial.
    expect(
      resolverUrlChatCompletions({
        OPENROUTER_BASE_URL: 'no-es-una-url',
        OPENROUTER_PERMITIR_ENDPOINT_LOCAL: 'si',
      }),
    ).toBe(OFICIAL);
  });

  it('mantiene el modelo gratuito por defecto configurable', () => {
    expect(MODELO_VISION_POR_DEFECTO).toContain(':free');
  });
});
