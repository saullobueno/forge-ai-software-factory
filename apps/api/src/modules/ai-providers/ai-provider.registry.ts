import { Injectable } from '@nestjs/common';
import {
  createAiProviderByName,
  listAvailableAiProviders,
  type AiProvider,
  type AvailableAiProvider,
} from '@forge/ai';
import type { AiProviderName } from '@forge/types';

/**
 * Provedores de IA que este servidor sabe instanciar (chave + modelo nas
 * variáveis de ambiente). Cada projeto pode escolher um; `null` = o padrão
 * do servidor. Instâncias são criadas sob demanda e reaproveitadas.
 */
@Injectable()
export class AiProviderRegistry {
  private readonly cache = new Map<AiProviderName, AiProvider>();

  available(): AvailableAiProvider[] {
    return listAvailableAiProviders();
  }

  isAvailable(name: AiProviderName): boolean {
    return this.available().some((provider) => provider.name === name);
  }

  /** Provedor do projeto, ou `undefined` (usa o padrão) se não definido/indisponível agora. */
  resolve(name: string | null | undefined): AiProvider | undefined {
    if (!name || !this.isAvailable(name as AiProviderName)) return undefined;
    const key = name as AiProviderName;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const created = createAiProviderByName(key);
    this.cache.set(key, created);
    return created;
  }
}
