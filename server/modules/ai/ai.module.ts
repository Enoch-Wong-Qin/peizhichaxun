import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { OpenApiAiController } from './ai.openapi.controller';
import { AiService } from './ai.service';

@Module({
  controllers: [AiController, OpenApiAiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
