import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { AiQueryRequest, AiQueryResponse, ConversationMessage } from '@shared/ai';

const BASE = '/api/ai';

export async function queryByPrompt(
  payload: AiQueryRequest & { history?: ConversationMessage[] },
): Promise<AiQueryResponse> {
  try {
    const response = await axiosForBackend({
      url: `${BASE}/query`,
      method: 'POST',
      data: payload,
      timeout: 120000,
    });
    return response.data;
  } catch (error: unknown) {
    const axiosErr = error as { response?: { data?: { message?: string } } };
    const message =
      axiosErr?.response?.data?.message || 'AI 查询失败，请稍后重试';
    logger.error('AI 查询请求失败', { error: message });
    throw new Error(message);
  }
}
