import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import { HealthService } from '@Health/services';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  getHello(): string {
    return this.healthService.getHello();
  }
}
