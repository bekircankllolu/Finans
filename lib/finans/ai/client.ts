import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Ekstre okuma ve kategorizasyon: hızlı ve ucuz. Rapor ve sohbet: en yetenekli model.
export const PARSE_MODEL = 'claude-sonnet-5-5'
export const ADVISOR_MODEL = 'claude-opus-5-5'

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

export function assertNotRefused(message: Anthropic.Message) {
  if (message.stop_reason === 'refusal') {
    throw new Error('Model bu isteği yanıtlamayı reddetti. Belgeyi kontrol edip tekrar deneyin.')
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Yanıt uzunluk sınırına takıldı. Ekstreyi daha küçük parçalara bölmeyi deneyin.')
  }
}
