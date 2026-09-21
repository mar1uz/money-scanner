path = 'scripts/ai-content-writer.mjs'
with open(path) as f:
    s = f.read()
old = """  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;"""
new = """  const data = await res.json();
  if (!data.choices?.[0]?.message?.content) {
    console.error(`gateway raw [${model}]: ${JSON.stringify(data).slice(0, 600)}`);
  }
  const raw = data.choices?.[0]?.message?.content;"""
if old not in s:
    print('ANCHOR MISSING')
    raise SystemExit(1)
s = s.replace(old, new, 1)
with open(path, 'w') as f:
    f.write(s)
print('patched')
