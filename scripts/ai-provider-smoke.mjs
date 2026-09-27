const enabled = process.env.RUN_LIVE_AI_SMOKE === 'true'
if (!enabled) {
  console.error('Refusing live request. Set RUN_LIVE_AI_SMOKE=true explicitly.')
  process.exit(2)
}

const provider = process.env.AI_SMOKE_PROVIDER
const config = provider === 'openai'
  ? { key: process.env.OPENAI_API_KEY, model: 'gpt-5.6-luna', url: 'https://api.openai.com/v1/models/gpt-5.6-luna', header: 'Authorization', value: key => `Bearer ${key}` }
  : provider === 'gemini'
    ? { key: process.env.GEMINI_API_KEY, model: 'gemini-3.6-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash', header: 'x-goog-api-key', value: key => key }
    : null

if (!config?.key) {
  console.error('Set AI_SMOKE_PROVIDER=openai|gemini and the matching API key environment variable.')
  process.exit(2)
}

const response = await fetch(config.url, { headers: { [config.header]: config.value(config.key) }, signal: AbortSignal.timeout(15_000) })
if (!response.ok) {
  console.error(`Provider smoke failed with HTTP ${response.status}.`)
  process.exit(1)
}
console.log(`Provider credential/model lookup succeeded: ${provider}/${config.model}`)
