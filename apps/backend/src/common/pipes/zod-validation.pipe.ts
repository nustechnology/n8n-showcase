import { BadRequestException, PipeTransform } from '@nestjs/common';

import { ZodType } from 'zod';

// Usage: @Body(new ZodValidationPipe(UpdateTenantSchema)) body: UpdateTenantInput
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((issue) => issue.message));
    }
    return result.data;
  }
}
