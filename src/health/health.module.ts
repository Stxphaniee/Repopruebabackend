import { Module } from '@nestjs/common';
import { HealthController } from '@Health/controllers';
import { HealthService } from '@Health/services';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
