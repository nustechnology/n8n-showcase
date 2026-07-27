import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [TenantsController, MembersController],
  providers: [TenantsService, MembersService],
})
export class TenantsModule {}
