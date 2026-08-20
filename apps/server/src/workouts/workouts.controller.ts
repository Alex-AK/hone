import type {
  WorkoutDetail,
  WorkoutFile,
  WorkoutRun,
  WorkoutSummary,
  WorkoutWorkspaceFile,
} from '@hone/shared';
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { RunWorkoutDto, SaveWorkoutFileDto, WorkoutFilePathDto } from './dto';
import { WorkoutsService } from './workouts.service';

@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Get()
  list(): WorkoutSummary[] {
    return this.workouts.list();
  }

  @Get(':slug')
  detail(@Param('slug') slug: string): Promise<WorkoutDetail> {
    return this.workouts.detail(slug);
  }

  /** 409 when the workout needs something this machine does not have. */
  @Post(':slug/start')
  @HttpCode(200)
  start(@Param('slug') slug: string): Promise<WorkoutDetail> {
    return this.workouts.start(slug);
  }

  @Post(':slug/files')
  @HttpCode(200)
  save(
    @Param('slug') slug: string,
    @Body() body: SaveWorkoutFileDto
  ): { files: WorkoutWorkspaceFile[] } {
    return { files: this.workouts.saveFile(slug, body.path, body.contents) };
  }

  @Post(':slug/files/reset')
  @HttpCode(200)
  reset(
    @Param('slug') slug: string,
    @Body() body: WorkoutFilePathDto
  ): { files: WorkoutWorkspaceFile[] } {
    return { files: this.workouts.resetFile(slug, body.path) };
  }

  @Post(':slug/run')
  @HttpCode(200)
  run(@Param('slug') slug: string, @Body() body: RunWorkoutDto): Promise<WorkoutRun> {
    return this.workouts.run(slug, body.checkpoint);
  }

  @Post(':slug/finish')
  @HttpCode(200)
  finish(@Param('slug') slug: string): Promise<WorkoutDetail> {
    return this.workouts.finish(slug);
  }

  @Post(':slug/reveal-solution')
  @HttpCode(200)
  revealSolution(@Param('slug') slug: string): { files: WorkoutFile[] } {
    return { files: this.workouts.revealSolution(slug) };
  }
}
