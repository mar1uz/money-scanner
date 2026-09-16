#!/usr/bin/env python3
"""Generate apps/web/src/theme.css — theme tokens for dark + 5 light themes.
Run from the repo root: python3 apps/web/tools/gen-theme.py
"""
import pathlib

def h2rgb(h):
    h = h.lstrip('#')
    return f"{int(h[0:2],16)} {int(h[2:4],16)} {int(h[4:6],16)}"

# ── core hex tokens per theme ──────────────────────────────────────────────
GLOW_DARK = ("radial-gradient(1100px 520px at 82% -8%, rgba(200,241,105,.09), transparent 62%),"
             "radial-gradient(900px 620px at -6% 42%, rgba(111,199,255,.075), transparent 60%),"
             "radial-gradient(1000px 700px at 68% 112%, rgba(167,139,250,.065), transparent 62%)")

THEMES = {
 'dark': {
   'label': 'Dark (seară)',
   'bg': '#0B0D10', 'bg_image': GLOW_DARK,
   'surface': '#12151A', 'surface2': '#171B22', 'surface_raised': '#151A21', 'surface_inset': '#0F1216',
   'line': '#232A35', 'line_strong': '#334054', 'hover': '#1D222B',
   'text': '#E9EDF3', 'text2': '#C9D2DD', 'muted': '#9AA4B2', 'faint': '#8791A1',
   'header_bg': 'rgba(11,13,16,.9)', 'header_solid': 'rgba(11,13,16,.96)',
   'dock_bg': 'rgba(18,21,26,.92)',
   'overlay04': 'rgba(255,255,255,.04)', 'overlay06': 'rgba(255,255,255,.06)',
   'overlay08': 'rgba(255,255,255,.08)', 'overlay15': 'rgba(255,255,255,.15)',
   'sheen': 'rgba(255,255,255,.028)',
   'nav_active_text': '#E9EDF3',
   'shadow_card': '0 8px 24px rgba(0,0,0,.16)', 'shadow_hover': '0 10px 28px rgba(0,0,0,.2)',
   'dock_shadow': 'inset 0 1px 1px rgba(255,255,255,.06), 0 16px 40px rgba(0,0,0,.5), 0 2px 5px rgba(0,0,0,.12)',
   'brief_gradient': 'linear-gradient(145deg, rgba(28,33,44,.35), rgba(15,18,24,.78))',
   'accent_soft': '#4E6B0D', 'scheme': 'dark',
 },
 'l1': {
   'label': 'L1 · Paper', 'swatch': '#F5F7FA', 'sun': True,
   'bg': '#F5F7FA', 'bg_image': ("radial-gradient(1000px 480px at 84% -8%, rgba(200,241,105,.16), transparent 60%),"
     "radial-gradient(840px 560px at -6% 44%, rgba(111,199,255,.12), transparent 60%),"
     "radial-gradient(920px 640px at 66% 110%, rgba(167,139,250,.09), transparent 62%)"),
   'surface': '#FFFFFF', 'surface2': '#FFFFFF', 'surface_raised': '#F7F9FB', 'surface_inset': '#F1F4F8',
   'line': '#E3E8EF', 'line_strong': '#C9D3DF', 'hover': '#F1F4F8',
   'text': '#10151C', 'text2': '#39424E', 'muted': '#5D6874', 'faint': '#6B7684',
   'header_bg': '#FFFFFF', 'header_solid': '#FFFFFF',
   'dock_bg': '#FFFFFF',
   'overlay04': 'rgba(15,20,27,.04)', 'overlay06': 'rgba(15,20,27,.06)',
   'overlay08': 'rgba(15,20,27,.08)', 'overlay15': 'rgba(15,20,27,.15)',
   'sheen': 'rgba(255,255,255,.55)',
   'nav_active_text': '#1A2205',
   'shadow_card': '0 12px 28px -20px rgba(23,32,46,.22)', 'shadow_hover': '0 14px 32px -20px rgba(23,32,46,.28)',
   'dock_shadow': '0 16px 40px -18px rgba(23,32,46,.35), 0 2px 5px rgba(23,32,46,.08)',
   'brief_gradient': 'linear-gradient(145deg, rgba(255,255,255,.9), rgba(241,244,248,.9))',
   'accent_soft': '#4E6B0D', 'accent_soft': '#5C6B0E', 'accent_soft': '#4E6B0D', 'accent_soft': '#4E6B0D', 'accent_soft': '#4E6B0D', 'accent_soft': '#4E6B0D', 'scheme': 'light',
 },
 'l2': {
   'label': 'L2 · Ivory', 'swatch': '#F7F4EC',
   'bg': '#F7F4EC', 'bg_image': ("radial-gradient(1000px 480px at 84% -8%, rgba(200,241,105,.15), transparent 60%),"
     "radial-gradient(840px 560px at -6% 44%, rgba(255,194,75,.10), transparent 60%),"
     "radial-gradient(920px 640px at 66% 110%, rgba(200,241,105,.08), transparent 62%)"),
   'surface': '#FFFDF9', 'surface2': '#FFFFFF', 'surface_raised': '#FAF6EC', 'surface_inset': '#F3EFE4',
   'line': '#E9E2D3', 'line_strong': '#D6CCB6', 'hover': '#F3EFE4',
   'text': '#1C1810', 'text2': '#4A4436', 'muted': '#6B6455', 'faint': '#756E5F',
   'header_bg': '#FFFDF9', 'header_solid': '#FFFDF9',
   'dock_bg': '#FFFDF9',
   'overlay04': 'rgba(60,50,30,.04)', 'overlay06': 'rgba(60,50,30,.07)',
   'overlay08': 'rgba(60,50,30,.09)', 'overlay15': 'rgba(60,50,30,.16)',
   'sheen': 'rgba(255,255,255,.6)',
   'nav_active_text': '#22270A',
   'shadow_card': '0 12px 28px -20px rgba(60,50,30,.20)', 'shadow_hover': '0 14px 32px -20px rgba(60,50,30,.26)',
   'dock_shadow': '0 16px 40px -18px rgba(60,50,30,.32), 0 2px 5px rgba(60,50,30,.08)',
   'brief_gradient': 'linear-gradient(145deg, rgba(255,255,255,.9), rgba(243,239,228,.9))',
   'accent_soft': '#5C6B0E', 'scheme': 'light',
 },
 'l3': {
   'label': 'L3 · Sky', 'swatch': '#ECF3FA',
   'bg': '#ECF3FA', 'bg_image': ("radial-gradient(940px 480px at 86% -8%, rgba(111,199,255,.34), transparent 58%),"
     "radial-gradient(780px 580px at -8% 40%, rgba(200,241,105,.16), transparent 60%),"
     "radial-gradient(880px 640px at 62% 112%, rgba(167,139,250,.14), transparent 62%)"),
   'surface': '#FFFFFF', 'surface2': '#FFFFFF', 'surface_raised': '#F3F8FD', 'surface_inset': '#E8F1F9',
   'line': '#D9E5F2', 'line_strong': '#BCD2E8', 'hover': '#EFF5FB',
   'text': '#101A26', 'text2': '#3C4A5C', 'muted': '#5B6B7E', 'faint': '#66788C',
   'header_bg': '#FFFFFF', 'header_solid': '#FFFFFF',
   'dock_bg': '#FFFFFF',
   'overlay04': 'rgba(16,26,38,.04)', 'overlay06': 'rgba(16,26,38,.06)',
   'overlay08': 'rgba(16,26,38,.09)', 'overlay15': 'rgba(16,26,38,.16)',
   'sheen': 'rgba(255,255,255,0)',
   'nav_active_text': '#1A2205',
   'shadow_card': '0 12px 28px -20px rgba(30,50,80,.24)', 'shadow_hover': '0 14px 32px -20px rgba(30,50,80,.30)',
   'dock_shadow': '0 16px 40px -18px rgba(30,50,80,.32), 0 2px 5px rgba(30,50,80,.08)',
   'brief_gradient': 'linear-gradient(145deg, #FFFFFF, #EFF5FB)',
   'accent_soft': '#4E6B0D', 'scheme': 'light',
 },
 'l4': {
   'label': 'L4 · Mint', 'swatch': '#E9F5EE',
   'bg': '#E9F5EE', 'bg_image': ("radial-gradient(900px 460px at 82% -8%, rgba(18,161,102,.18), transparent 60%),"
     "radial-gradient(760px 560px at -8% 44%, rgba(16,185,129,.14), transparent 62%),"
     "radial-gradient(820px 620px at 64% 112%, rgba(200,241,105,.12), transparent 62%)"),
   'surface': '#FFFFFF', 'surface2': '#FFFFFF', 'surface_raised': '#F0F8F3', 'surface_inset': '#E3F3E8',
   'line': '#D8EDDF', 'line_strong': '#B9DCC6', 'hover': '#E3F3E8',
   'text': '#0E1F16', 'text2': '#2F4A38', 'muted': '#5B7A68', 'faint': '#556F60',
   'header_bg': '#FFFFFF', 'header_solid': '#FFFFFF',
   'dock_bg': '#FFFFFF',
   'overlay04': 'rgba(14,31,22,.04)', 'overlay06': 'rgba(14,31,22,.07)',
   'overlay08': 'rgba(14,31,22,.09)', 'overlay15': 'rgba(14,31,22,.16)',
   'sheen': 'rgba(255,255,255,.55)',
   'nav_active_text': '#1A2205',
   'shadow_card': '0 12px 28px -20px rgba(16,120,70,.28)', 'shadow_hover': '0 14px 32px -20px rgba(16,120,70,.34)',
   'dock_shadow': '0 16px 40px -18px rgba(16,120,70,.35), 0 2px 5px rgba(16,120,70,.08)',
   'brief_gradient': 'linear-gradient(145deg, rgba(255,255,255,.92), rgba(227,243,232,.9))',
   'accent_soft': '#4E6B0D', 'scheme': 'light',
 },
 'l5': {
   'label': 'L5 · Sorbet', 'swatch': '#F6F0FF',
   'bg': '#F4F1FA', 'bg_image': ("radial-gradient(860px 440px at 86% -8%, rgba(167,139,250,.30), transparent 58%),"
     "radial-gradient(760px 540px at -8% 40%, rgba(61,220,151,.22), transparent 60%),"
     "radial-gradient(840px 600px at 60% 112%, rgba(255,176,120,.26), transparent 62%),"
     "linear-gradient(120deg,#F6F0FF 0%,#ECF7F1 48%,#FFF3E8 100%)"),
   'surface': '#FFFFFF', 'surface2': '#FFFFFF', 'surface_raised': '#F6F2FC', 'surface_inset': '#EFE9F9',
   'line': '#E7E1F3', 'line_strong': '#D3C9EA', 'hover': '#F3EEFB',
   'text': '#17122A', 'text2': '#4A4358', 'muted': '#6E6688', 'faint': '#6E6688',
   'header_bg': '#FFFFFF', 'header_solid': '#FFFFFF',
   'dock_bg': '#FFFFFF',
   'overlay04': 'rgba(23,18,42,.04)', 'overlay06': 'rgba(23,18,42,.06)',
   'overlay08': 'rgba(23,18,42,.08)', 'overlay15': 'rgba(23,18,42,.14)',
   'sheen': 'rgba(255,255,255,.5)',
   'nav_active_text': '#1A2205',
   'shadow_card': '0 16px 36px -24px rgba(70,50,120,.30)', 'shadow_hover': '0 20px 42px -24px rgba(70,50,120,.36)',
   'dock_shadow': '0 16px 40px -18px rgba(70,50,120,.32), 0 2px 5px rgba(70,50,120,.08)',
   'brief_gradient': 'linear-gradient(145deg, rgba(255,255,255,.85), rgba(244,239,252,.75))',
   'accent_soft': '#4E6B0D', 'scheme': 'light',
 },
}

# ── tailwind scale families (step -> hex) per theme ───────────────────────
DARK_FAM = {
  'slate': {'50':'#F8FAFC','100':'#F1F5F9','200':'#E2E8F0','300':'#CBD5E1','400':'#94A3B8','500':'#64748B','600':'#475569','700':'#334155','800':'#1E293B','900':'#0F172A','950':'#020617'},
  'white': {'DEFAULT':'#FFFFFF'},
  'cyan': {'100':'#F3FAD8','200':'#EAF5B3','300':'#DFF28E','400':'#C8F169','500':'#A9D845','950':'#22300B'},
  'emerald': {'50':'#EAFBF3','200':'#A3EDC9','300':'#7BE4B2','400':'#57DFA5','500':'#3DDC97','600':'#27B87A'},
  'rose': {'50':'#FFF0F3','200':'#FFC0CE','300':'#FFA3B8','400':'#FF8AA5','500':'#FF6B8A','950':'#4C1321'},
  'purple': {'100':'#EAE6FF','200':'#D9D2FF','300':'#C4B5FD','400':'#A78BFA','500':'#8B5CF6','600':'#7C4DEF','950':'#2A1A57'},
  'amber': {'100':'#FFF0C7','200':'#FFE39B','300':'#FFD477','400':'#FFCA5F','500':'#FFC24B'},
  'blue': {'200':'#B8DBFF','300':'#8AC4FF','400':'#6FC7FF','500':'#45A9F5','950':'#132C47'},
}

def light_fam(theme):
    t = {
    'l1': {'white':'#10151C','slate100':'#10151C','slate200':'#1E2733','slate300':'#39424E','slate400':'#5D6874','slate500':'#6B7684','slate600':'#7E8894','slate700':'#D5DCE4','slate800':'#E8EDF3','slate900':'#F1F4F8','slate950':'#F7F9FC',
           'cyan100':'#57761B','cyan200':'#4E6B0D','cyan300':'#56770F','cyan400':'#6B8F1E','cyan500':'#89B02C','cyan950':'#F0F7DE',
           'emerald50':'#0A6B47','emerald200':'#0B7A50','emerald300':'#0B7A50','emerald400':'#0E8A5A','emerald500':'#12A166','emerald600':'#0E7D51',
           'rose50':'#B03040','rose200':'#C0404D','rose300':'#C0404D','rose400':'#C93B47','rose500':'#DC4A60','rose950':'#FBE9EC',
           'purple100':'#6D4FCF','purple200':'#6D4FCF','purple300':'#6D4FCF','purple400':'#7C5CE0','purple500':'#8B5CF6','purple600':'#7A4EE0','purple950':'#EFEAFF',
           'amber100':'#8A5A12','amber200':'#8A5A12','amber300':'#8A5A12','amber400':'#A0680F','amber500':'#C08A2E',
           'blue200':'#0B6FA8','blue300':'#0B6FA8','blue400':'#1179B8','blue500':'#2E8CDA','blue950':'#E3F0FB'},
    'l2': {'white':'#1C1810','slate100':'#1C1810','slate200':'#292318','slate300':'#4A4436','slate400':'#6B6455','slate500':'#7A7263','slate600':'#8B8271','slate700':'#E4DCCB','slate800':'#EDE7D9','slate900':'#F4EFE3','slate950':'#FAF6EC',
           'cyan100':'#5C6B0E','cyan200':'#5C6B0E','cyan300':'#5C6B0E','cyan400':'#6E821C','cyan500':'#8CA22A','cyan950':'#F3F1DA',
           'emerald50':'#0A6B47','emerald200':'#0B7A50','emerald300':'#0B7A50','emerald400':'#0E8A5A','emerald500':'#12A166','emerald600':'#0E7D51',
           'rose50':'#B03040','rose200':'#C0404D','rose300':'#BE3D45','rose400':'#C63B47','rose500':'#D84A5C','rose950':'#F9E8E4',
           'purple100':'#6D4FCF','purple200':'#6D4FCF','purple300':'#6D4FCF','purple400':'#7C5CE0','purple500':'#8B5CF6','purple600':'#7A4EE0','purple950':'#EFE9F7',
           'amber100':'#8A5A12','amber200':'#8A5A12','amber300':'#8A5A12','amber400':'#A0680F','amber500':'#C08A2E',
           'blue200':'#0B6FA8','blue300':'#0B6FA8','blue400':'#1179B8','blue500':'#2E8CDA','blue950':'#E4EEF5'},
    'l3': {'white':'#0F141B','slate100':'#0F141B','slate200':'#1E2733','slate300':'#39424E','slate400':'#5A6573','slate500':'#68737F','slate600':'#7E8894','slate700':'#D8DFE8','slate800':'#E9EEF4','slate900':'#F0F3F8','slate950':'#F6F8FB',
           'cyan100':'#57761B','cyan200':'#4E6B0D','cyan300':'#56770F','cyan400':'#6B8F1E','cyan500':'#89B02C','cyan950':'#F0F7DE',
           'emerald50':'#0A6B47','emerald200':'#0B7A50','emerald300':'#0B7A50','emerald400':'#0E8A5A','emerald500':'#12A166','emerald600':'#0E7D51',
           'rose50':'#B03040','rose200':'#C0404D','rose300':'#C0404D','rose400':'#C93B47','rose500':'#DC4A60','rose950':'#FBE9EC',
           'purple100':'#6D4FCF','purple200':'#6D4FCF','purple300':'#6D4FCF','purple400':'#7C5CE0','purple500':'#8B5CF6','purple600':'#7A4EE0','purple950':'#EFEAFF',
           'amber100':'#8A5A12','amber200':'#8A5A12','amber300':'#8A5A12','amber400':'#A0680F','amber500':'#C08A2E',
           'blue200':'#0B6FA8','blue300':'#0B6FA8','blue400':'#1179B8','blue500':'#2E8CDA','blue950':'#E3F0FB'},
    'l4': {'white':'#0E1F16','slate100':'#0E1F16','slate200':'#1C2E23','slate300':'#2F4A38','slate400':'#5B7A68','slate500':'#5E7A6A','slate600':'#75917F','slate700':'#D8EDDF','slate800':'#E3F3E8','slate900':'#EDF7F1','slate950':'#F3FAF5',
           'cyan100':'#4E6B0D','cyan200':'#4E6B0D','cyan300':'#4E6B0D','cyan400':'#5C7A17','cyan500':'#7BA428','cyan950':'#EDF6DC',
           'emerald50':'#0A6B47','emerald200':'#0B7A50','emerald300':'#0A7A4E','emerald400':'#0C8656','emerald500':'#12A166','emerald600':'#0E7D51',
           'rose50':'#B03040','rose200':'#C0404D','rose300':'#BE3D45','rose400':'#C63B47','rose500':'#D84A5C','rose950':'#F9E8E4',
           'purple100':'#6D4FCF','purple200':'#6D4FCF','purple300':'#6D4FCF','purple400':'#7C5CE0','purple500':'#8B5CF6','purple600':'#7A4EE0','purple950':'#EFEAF7',
           'amber100':'#8A5A12','amber200':'#8A5A12','amber300':'#8A5A12','amber400':'#A0680F','amber500':'#C08A2E',
           'blue200':'#0B6FA8','blue300':'#0B6FA8','blue400':'#1179B8','blue500':'#2E8CDA','blue950':'#E3F0FB'},
    'l5': {'white':'#17122A','slate100':'#17122A','slate200':'#262039','slate300':'#4A4358','slate400':'#6E6688','slate500':'#776E90','slate600':'#8A81A0','slate700':'#E4DEF2','slate800':'#EFEAF7','slate900':'#F4EFFC','slate950':'#F8F5FE',
           'cyan100':'#57761B','cyan200':'#4E6B0D','cyan300':'#56770F','cyan400':'#6B8F1E','cyan500':'#89B02C','cyan950':'#F0F7DE',
           'emerald50':'#0A6B47','emerald200':'#0B7A50','emerald300':'#0B7A50','emerald400':'#0E8A5A','emerald500':'#12A166','emerald600':'#0E7D51',
           'rose50':'#B03040','rose200':'#C0404D','rose300':'#C0404D','rose400':'#C93B47','rose500':'#DC4A60','rose950':'#FBE9EC',
           'purple100':'#6D4FCF','purple200':'#6D4FCF','purple300':'#6D4FCF','purple400':'#7C5CE0','purple500':'#8B5CF6','purple600':'#7A4EE0','purple950':'#EFEAFF',
           'amber100':'#8A5A12','amber200':'#8A5A12','amber300':'#8A5A12','amber400':'#A0680F','amber500':'#C08A2E',
           'blue200':'#0B6FA8','blue300':'#0B6FA8','blue400':'#1179B8','blue500':'#2E8CDA','blue950':'#E3F0FB'},
    }[theme]
    return t

def core_block(tid, t):
    lines = []
    lines.append(f"  /* {t.get('label', tid)} */")
    core = [
      ('--t-bg', t['bg']), ('--t-bg-image', t['bg_image']), ('--t-accent-soft', t['accent_soft']), ('--t-surface', t['surface']), ('--t-surface-2', t['surface2']),
      ('--t-surface-raised', t['surface_raised']), ('--t-surface-inset', t['surface_inset']),
      ('--t-line', t['line']), ('--t-line-strong', t['line_strong']), ('--t-hover', t['hover']),
      ('--t-text', t['text']), ('--t-text-2', t['text2']), ('--t-muted', t['muted']), ('--t-faint', t['faint']),
      ('--t-header-bg', t['header_bg']), ('--t-header-solid', t['header_solid']), ('--t-dock-bg', t['dock_bg']),
      ('--t-overlay-04', t['overlay04']), ('--t-overlay-06', t['overlay06']),
      ('--t-overlay-08', t['overlay08']), ('--t-overlay-15', t['overlay15']),
      ('--t-sheen', t['sheen']), ('--t-nav-active-text', t['nav_active_text']),
      ('--t-shadow-card', t['shadow_card']), ('--t-shadow-hover', t['shadow_hover']), ('--t-dock-shadow', t['dock_shadow']),
      ('--t-brief-gradient', t['brief_gradient']),
      # legacy families kept in sync
      ('--glass-fill', t['surface']), ('--glass-edge', t['line']), ('--glass-shadow', t['shadow_card']),
      ('--ml-bg', t['bg']), ('--ml-surface', t['surface']), ('--ml-surface-raised', t['surface_raised']),
      ('--ml-line', t['line']), ('--ml-muted', t['muted']), ('--ml-text', t['text']),
      # tailwind rgb triplets (family scales)
    ]
    for name, val in core:
        lines.append(f"  {name}: {val};")
    # rgb triplets for surfaces (tailwind alpha support)
    import re as _re
    def _rgb(s):
        s = s.strip()
        m = _re.match(r'#([0-9A-Fa-f]{6})', s)
        if m: return h2rgb('#' + m.group(1))
        m = _re.match(r'rgba\((\d+),\s*(\d+),\s*(\d+)', s)
        if m: return f"{m.group(1)} {m.group(2)} {m.group(3)}"
        return None
    for name, val in (('--t-bg-rgb', t['bg']), ('--t-surface-rgb', t['surface']), ('--t-surface-2-rgb', t['surface2']),
                      ('--t-surface-raised-rgb', t['surface_raised']), ('--t-line-rgb', t['line']), ('--t-hover-rgb', t['hover'])):
        rgb = _rgb(val)
        if rgb: lines.append(f"  {name}: {rgb};")
    fam = DARK_FAM if tid == 'dark' else None
    # rgb triplets
    if tid == 'dark':
        triplets = {}
        for fam_name, steps in DARK_FAM.items():
            for step, hexv in steps.items():
                key = 'DEFAULT' if step == 'DEFAULT' else step
                triplets[f"--t-{fam_name.lower()}{'' if step=='DEFAULT' else '-'+step}-rgb"] = hexv
    else:
        triplets = {}
        for fam_name, steps in DARK_FAM.items():
            for step in steps:
                triplets[f"--t-{fam_name.lower()}{'' if step=='DEFAULT' else '-'+step}-rgb"] = None
        vals = light_fam(tid)
        triplets['--t-white-rgb'] = vals['white']
        for fam_name in ('slate','cyan','emerald','rose','purple','amber','blue'):
            for step in DARK_FAM[fam_name]:
                key = f"--t-{fam_name}-{step}-rgb"
                ls = fam_name+step
                if fam_name == 'slate': ls = 'slate'+step
                triplets[key] = vals.get(ls)
        # purple aliases for violet/fuchsia happen in tailwind config, not here
    for key, hexv in triplets.items():
        if hexv:
            lines.append(f"  {key}: {h2rgb(hexv)};")
    return '\n'.join(lines)

out = []
out.append("/* ══════════════════════════════════════════════════════════════════\n"
           "   Theme engine — tokens for dark + 5 light themes (2026-09-16)\n"
           "   Generated by apps/web/tools/gen-theme.py; edit that file and re-run.\n"
           "   Switch via <html data-theme=\"dark|l1|l2|l3|l4|l5\">\n"
           "   ══════════════════════════════════════════════════════════════════ */\n")
out.append(":root {")
out.append(core_block('dark', THEMES['dark']))
out.append("}\n")
for tid in ('l1','l2','l3','l4','l5'):
    t = THEMES[tid]
    out.append(f"html[data-theme='{tid}'] {{ color-scheme: {t['scheme']}; }}")
    out.append(f"html[data-theme='{tid}'] {{")
    out.append(core_block(tid, t))
    out.append("}\n")

# light-specific structural overrides
out.append("""/* Light structural overrides — solid surfaces, no translucency */
html[data-theme^='l'] .app-header,
html[data-theme^='l'] .card-base, html[data-theme^='l'] .card-elevated, html[data-theme^='l'] .cyber-glass,
html[data-theme^='l'] .market-overview .card-base, html[data-theme^='l'] .app-sidebar,
html[data-theme^='l'] .mobile-nav, html[data-theme^='l'] .mobile-search-orb, html[data-theme^='l'] .intro-watchlist,
html[data-theme^='l'] .theme-menu, html[data-theme^='l'] .mobile-more-menu {
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
html[data-theme^='l'] .card-base, html[data-theme^='l'] .card-elevated, html[data-theme^='l'] .cyber-glass,
html[data-theme^='l'] .market-overview .card-base {
  background-image: none;
}
html[data-theme^='l'] .market-overview .card-base:first-child {
  background-image: linear-gradient(135deg, rgba(200,241,105,.18), rgba(200,241,105,.035) 72%);
  border-color: rgba(150,178,66,.35);
}
html[data-theme='l3'] .market-overview .card-base:first-child {
  background-image: linear-gradient(135deg, #EAF3FD, #FBFDFF 62%);
  border-color: rgba(120,160,210,.4);
}
html[data-theme='l5'] .market-overview .card-base:nth-child(1) { background-image: linear-gradient(135deg, #EFE8FC, #FBF9FF 62%); }
html[data-theme='l5'] .market-overview .card-base:nth-child(2) { background-image: linear-gradient(135deg, #E6F6EE, #FAFFFC 62%); }
html[data-theme='l5'] .market-overview .card-base:nth-child(3) { background-image: linear-gradient(135deg, #FDEEDF, #FFFBF6 62%); }
html[data-theme^='l'] .brand-mark { box-shadow: 0 6px 18px -8px rgba(120,160,20,.45); }
html[data-theme^='l'] .scanner-section table th { color: var(--t-muted); }
html[data-theme^='l'] .mobile-nav-lens { box-shadow: inset 0 1px 1px rgba(255,255,255,.5), 0 2px 8px rgba(23,32,46,.12); }
html[data-theme^='l'] ::-webkit-scrollbar-thumb { background: var(--t-overlay-15); }
html[data-theme^='l'] ::-webkit-scrollbar-thumb:hover { background: rgba(15,20,27,.28); }
html[data-theme^='l'] .intelligence-icon { border-color: rgba(139,92,246,.3); color: #6D4FCF; background: rgba(139,92,246,.1); }
html[data-theme^='l'] .intelligence-eyebrow { color: #6D4FCF; }
html[data-theme^='l'] .intelligence-state.is-error { color: #8A5A12; }
html[data-theme^='l'] .intelligence-state button { color: #8A5A12; border-color: rgba(138,90,18,.35); background: rgba(255,194,75,.15); }
""")

pathlib.Path('apps/web/src/theme.css').write_text('\n'.join(out))
print('theme.css written:', len('\n'.join(out)), 'bytes')
# quick sanity: print tokens for l1
import re
m = re.search(r"html\[data-theme='l1'\] \{(.*?)\n\}", '\n'.join(out), re.S)
print(m.group(1)[:600] if m else 'L1 block missing!')
