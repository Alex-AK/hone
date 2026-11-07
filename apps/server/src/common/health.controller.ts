import { Controller, Get } from '@nestjs/common';

/** Answers without touching the database, so a probe sees the process and nothing else. */
@Controller('healthz')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
