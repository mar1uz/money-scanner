import pathlib
p = pathlib.Path('apps/web/src/i18n.tsx')
s = p.read_text()
old = """  ['Actualizează datele', 'Refresh data']
] as Array<[string, string]>).sort((a, b) => b[0].length - a[0].length);"""
new = """  ['Actualizează datele', 'Refresh data'],
  // Sidebar + market-filter chrome (static Romanian source strings)
  ['Caută un activ, simbol sau companie…', 'Search any asset, symbol or company…'],
  ['Market Scanner — pagina principală', 'Market Scanner — home page'],
  ['Retrage meniul lateral', 'Collapse sidebar'],
  ['Navigare principală', 'Main navigation'],
  ['Toate piețele', 'All markets'],
  ['Metale', 'Metals'],
  ['Alerte', 'Alerts'],
  ['EXPLORARE', 'EXPLORE'],
  ['CERCETARE', 'RESEARCH'],
  ['Mai multă claritate. Mai puțin zgomot.', 'More clarity. Less noise.']
] as Array<[string, string]>).sort((a, b) => b[0].length - a[0].length);"""
assert old in s
p.write_text(s.replace(old, new, 1))
print('map extended')
