import { Controller, Post, Body, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import type { AiQueryRequest, AiQueryResponse } from '@shared/ai';

@Controller('api/ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  @Post('query')
  async query(@Body() body: AiQueryRequest): Promise<AiQueryResponse> {
    const { prompt, page, pageSize, history } = body;
    this.logger.log(`AI 查询请求: prompt="${prompt}", history=${history?.length ?? 0}`);
    return this.aiService.queryByPrompt(
      prompt,
      page ? parseInt(String(page), 10) : undefined,
      pageSize ? parseInt(String(pageSize), 10) : undefined,
      history,
    );
  }
}
