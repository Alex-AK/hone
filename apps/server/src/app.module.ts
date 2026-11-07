import { Module } from '@nestjs/common';

import { HealthController } from './common/health.controller';
import { DbModule } from './db/db.module';
import { DecksModule } from './decks/decks.module';
import { HandbookModule } from './handbook/handbook.module';
import { ModulesModule } from './modules/modules.module';
import { PathsModule } from './paths/paths.module';
import { PracticeModule } from './practice/practice.module';
import { ProblemsModule } from './problems/problems.module';
import { ProgressModule } from './progress/progress.module';
import { SessionsModule } from './sessions/sessions.module';
import { WorkoutsModule } from './workouts/workouts.module';

@Module({
  imports: [
    DbModule,
    ProblemsModule,
    ProgressModule,
    PracticeModule,
    SessionsModule,
    WorkoutsModule,
    HandbookModule,
    PathsModule,
    ModulesModule,
    DecksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
