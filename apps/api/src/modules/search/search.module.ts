import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SearchController } from './search.controller.js';
import { SearchRepository } from './search.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchRepository],
})
export class SearchModule {}
