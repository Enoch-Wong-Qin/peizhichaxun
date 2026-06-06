import { Controller, Post, Body, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import type { AiQueryRequest, AiQueryResponse } from '@shared/ai';

@Controller('openapi/ai')
export class OpenApiAiController {
  private readonly logger = new Logger(OpenApiAiController.name);

  constructor(private readonly aiService: AiService) {}

  @Post('query')
  async query(@Body() body: AiQueryRequest): Promise<AiQueryResponse> {
    const { prompt, page, pageSize } = body;
    this.logger.log(`OpenAPI AI 查询请求: prompt="${prompt}"`);
    return this.aiService.queryByPrompt(
      prompt,
      page ? parseInt(String(page), 10) : undefined,
      pageSize ? parseInt(String(pageSize), 10) : undefined,
    );
  }
}
