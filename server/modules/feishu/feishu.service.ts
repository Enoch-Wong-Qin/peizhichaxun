import { Injectable, Logger } from '@nestjs/common';
import * as lark from '@larksuiteoapi/node-sdk';

const FEISHU_APP_ID = 'cli_a9341535cd615bd9';
const FEISHU_APP_SECRET = '2yaCRFC1hDmte77s1X6WFgR6oVDZumzx';

@Injectable()
export class FeishuService {
  private readonly logger = new Logger(FeishuService.name);
  private readonly client: lark.Client;

  constructor() {
    this.client = new lark.Client({
      appId: FEISHU_APP_ID,
      appSecret: FEISHU_APP_SECRET,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
  }

  getClient(): lark.Client {
    return this.client;
  }

  async resolveWikiToken(nodeToken: string): Promise<{
    objToken: string;
    objType: string;
  }> {
    this.logger.log(`Resolving wiki node token: ${nodeToken}`);
    const res = await this.client.wiki.space.getNode({
      params: { token: nodeToken },
    });

    if (res.code !== 0) {
      this.logger.error(
        `Wiki getNode failed: code=${res.code}, msg=${res.msg}`,
      );
      throw new Error(`Wiki API 错误 [${res.code}]: ${res.msg}`);
    }

    const node = res.data?.node;
    if (!node) {
      throw new Error('Wiki API 返回数据为空');
    }

    this.logger.log(
      `Wiki node resolved: obj_type=${node.obj_type}, obj_token=${node.obj_token}`,
    );

    return {
      objToken: node.obj_token,
      objType: node.obj_type,
    };
  }
}
