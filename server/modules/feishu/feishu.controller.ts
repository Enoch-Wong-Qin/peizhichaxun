import { Controller, Get, Query } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { FeishuService } from './feishu.service';

@Controller('api/feishu')
@NeedLogin()
export class FeishuController {
  constructor(private readonly feishuService: FeishuService) {}

  @Get('resolve-wiki')
  async resolveWikiToken(
    @Query('token') token: string,
  ): Promise<{ objToken: string; objType: string }> {
    return this.feishuService.resolveWikiToken(token);
  }
}
