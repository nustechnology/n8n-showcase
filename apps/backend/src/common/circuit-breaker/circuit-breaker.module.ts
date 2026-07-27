import { Global, Module } from '@nestjs/common';

import { CircuitBreakerService } from './circuit-breaker.service';

// Global, same precedent as PrismaModule — breaker state must be a single
// shared instance per provider across the whole app, not re-created per
// importing module.
@Global()
@Module({
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
