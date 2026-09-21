path = 'scripts/ai-content-writer.mjs'
with open(path) as f:
    s = f.read()
old = """  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const match = text.match(/\\{[\\s\\S]*\\}/);
  if (!match) throw new Error('modelul nu a returnat JSON');"""
new = """  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  const text = Array.isArray(raw) ? raw.map(part => part?.text || '').join('') : String(raw || '');
  const match = text.match(/\\{[\\s\\S]*\\}/);
  if (!match) throw new Error(`modelul nu a returnat JSON [${model}]: ${text.slice(0, 200)}`);"""
if old not in s:
    print('ANCHOR MISSING')
    raise SystemExit(1)
s = s.replace(old, new, 1)
with open(path, 'w') as f:
    f.write(s)
print('patched')
