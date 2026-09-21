path = 'scripts/ai-content-writer.mjs'
with open(path) as f:
    s = f.read()

old_imports = """import { execFileSync } from 'node:child_process';"""
new_imports = """import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const JEV_ROUTER_PKG = join(ROOT, '..', 'jev-router', 'package.json');
async function loadAiSdk() {
  const require = createRequire(JEV_ROUTER_PKG);
  const [ai, gateway] = await Promise.all([
    import(pathToFileURL(require.resolve('ai')).href),
    import(pathToFileURL(require.resolve('@ai-sdk/gateway')).href)
  ]);
  return { generateText: ai.generateText, createGateway: gateway.createGateway };
}"""
assert old_imports in s
s = s.replace(old_imports, new_imports, 1)

start = s.index('async function generateTake(')
end = s.index('async function publish(')
new_fn = '''async function generateTake(gateway, model, pageInstruction, inputs) {
  const system = 'Ești analyst-ul de piață al aplicației Money Scanner. Scrii în română, concis, factual, fără recomandări de cumpărare/vânzare și fără probabilități inventate. Răspunzi NUMAI cu JSON valid: {"headline": string (max 200 chars), "paragraphs": string[1-4] (fiecare max 600 chars), "bullets": string[0-5] (fiecare max 200 chars)}.';
  const result = await callGateway(gateway, model, system, `${pageInstruction}\\n\\nDate de piață curente:\\n${inputs}`);
  const match = result.match(/\\{[\\s\\S]*\\}/);
  if (!match) throw new Error(`modelul nu a returnat JSON [${model}]: ${result.slice(0, 200)}`);
  return { ...JSON.parse(match[0]), model, generatedAt: Date.now() };
}

async function callGateway(gateway, model, system, prompt) {
  const { generateText } = await loadAiSdk();
  const result = await generateText({
    model: gateway.languageModel(model),
    system, prompt, maxOutputTokens: 2000, temperature: 0.3,
    abortSignal: AbortSignal.timeout(180_000)
  });
  return result.text || '';
}

'''
s = s[:start] + new_fn + s[end:]

old_main = """  const paid = await hasPaidAccess();
  const model = paid ? MODEL_PAID : MODEL_FREE;

  const briefTake = await generateTake(model,"""
new_main = """  const paid = await hasPaidAccess();
  const model = paid ? MODEL_PAID : MODEL_FREE;
  const { createGateway } = await loadAiSdk();
  const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });

  const briefTake = await generateTake(gateway, model,"""
assert old_main in s
s = s.replace(old_main, new_main, 1)

old_second = """  const intelTake = await generateTake(model,"""
new_second = """  const intelTake = await generateTake(gateway, model,"""
assert old_second in s
s = s.replace(old_second, new_second, 1)

with open(path, 'w') as f:
    f.write(s)
print('patched')
