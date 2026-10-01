import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service.js';

/** Global: uma única janela de contagem por processo, compartilhada por todos os módulos. */
@Global()
@Module({
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class RateLimitModule {}
