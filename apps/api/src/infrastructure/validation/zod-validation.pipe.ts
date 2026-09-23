import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida o corpo/params/query de uma requisição contra um schema zod de
 * `@forge/types`, reaproveitando a mesma fonte de verdade que o resto do
 * monorepo usa para validação (spec §17). Em falha, responde 400 com os
 * `issues` do zod — isso nunca vaza dados sensíveis (é só forma da
 * requisição, não existência de contas/recursos).
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Requisição inválida.',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
