import { Module } from '@nestjs/common';
import { AuditLogWriterModule } from '../audit-logs/audit-log-writer.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MembersController } from './members.controller.js';
import { MembersRepository } from './members.repository.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [AuthModule, AuditLogWriterModule],
  controllers: [MembersController],
  providers: [MembersRepository, MembersService],
})
export class MembersModule {}
