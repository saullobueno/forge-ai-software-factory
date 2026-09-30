import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AiProviderRegistry } from './ai-provider.registry.js';
import { AiProvidersController } from './ai-providers.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AiProvidersController],
  providers: [AiProviderRegistry],
  exports: [AiProviderRegistry],
})
export class AiProvidersModule {}
