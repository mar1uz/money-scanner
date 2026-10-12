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
   'header_bg': '#0B0D10', 'header_solid': 'rgba(11,13,16,.96)',
   'dock_bg': 'rgba(18,21,26,.92)',
   'overlay04': 'rgba(255,255,255,.04)', 'overlay06': 'rgba(255,255,255,.06)',
   'overlay08': 'rgba(255,255,255,.08)', 'overlay15': 'rgba(255,255,255,.15)',
   'sheen': 'rgba(255,255,255,.028)',
   'nav_active_text': '#E9EDF3',
   'shadow_card': '0 8px 24px rgba(0,0,0,.16)', 'shadow_hover': '0 10px 28px rgba(0,0,0,.2)',
   'dock_shadow': 'inset 0 1px 1px rgba(255,255,255,.06), 0 16px 40px rgba(0,0,0,.5), 0 2px 5px rgba(0,0,0,.12)',
   'brief_gradient': '#12151A',
   'accent_soft': '#4E6B0D', 'scheme': 'dark',
 },
 'l1': {
   'label': 'L1 · Paper', 'swatch': '#F5F7FA', 'sun': True,
   'bg': '#F5F7FA', 'bg_image': 'none',
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
   'brief_gradient': '#FFFFFF',
   'accent_soft': '#4E6B0D', 'accent_soft': '#5C6B0E', 'accent_soft': '#4E6B0D', 'accent_soft': '#4E6B0D', 'accent_soft': '#4E6B0D', 'accent_soft': '#4E6B0D', 'scheme': 'light',
 },
 'l2': {
   'label': 'L2 · Ivory', 'swatch': '#F7F4EC',
   'bg': '#F7F4EC', 'bg_image': 'none',
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
   'brief_gradient': '#FFFDF9',
   'accent_soft': '#5C6B0E', 'scheme': 'light',
 },
 'l3': {
   'label': 'L3 · Sky', 'swatch': '#ECF3FA',
   'bg': '#ECF3FA', 'bg_image': 'none',
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
   'brief_gradient': '#FFFFFF',
   'accent_soft': '#4E6B0D', 'scheme': 'light',
 },
 'l4': {
   'label': 'L4 · Mint', 'swatch': '#E9F5EE',
   'bg': '#E9F5EE', 'bg_image': 'none',
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
   'brief_gradient': '#FFFFFF',
   'accent_soft': '#4E6B0D', 'scheme': 'light',
 },
 'l5': {
   'label': 'L5 · Sorbet', 'swatch': '#F6F0FF',
   'bg': '#F4F1FA', 'bg_image': 'none',
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
   'brief_gradient': '#FFFFFF',
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
  background-image: none;
  background-color: var(--t-surface);
  border-color: var(--t-line-strong);
}
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

# Curated signature themes stay separate from the existing dark and l1-l5 palettes.
EXTRA_THEME_CSS = r"""/* Five selectable signature themes. The existing dark theme remains Signal Graphite. */
html[data-theme='ember'] {
  color-scheme: dark;
  --t-bg: #0B0A09; --t-bg-image: radial-gradient(900px 520px at 78% -8%, rgba(242,163,58,.10), transparent 62%), radial-gradient(800px 540px at -8% 52%, rgba(255,115,95,.06), transparent 60%);
  --t-accent-soft: #44250E; --t-surface: #12110F; --t-surface-2: #191612; --t-surface-raised: #1D1915; --t-surface-inset: #0A0908;
  --t-line: #342820; --t-line-strong: #4A382C; --t-hover: #241B16; --t-text: #F4ECE3; --t-text-2: #D7C3B2; --t-muted: #AA8F7C; --t-faint: #886F60;
  --t-header-bg: rgba(11,10,9,.92); --t-header-solid: rgba(11,10,9,.98); --t-dock-bg: rgba(18,17,15,.94);
  --t-overlay-04: rgba(255,255,255,.04); --t-overlay-06: rgba(255,255,255,.06); --t-overlay-08: rgba(255,255,255,.08); --t-overlay-15: rgba(255,255,255,.15); --t-sheen: rgba(255,255,255,.025);
  --t-nav-active-text: #FFF4E8; --t-shadow-card: 0 8px 24px rgba(0,0,0,.28); --t-shadow-hover: 0 10px 28px rgba(0,0,0,.34); --t-dock-shadow: 0 16px 40px rgba(0,0,0,.48); --t-brief-gradient: #12110F;
  --glass-fill: #12110F; --glass-edge: #342820; --glass-shadow: 0 8px 24px rgba(0,0,0,.28); --ml-bg: #0B0A09; --ml-surface: #12110F; --ml-surface-raised: #1D1915; --ml-line: #342820; --ml-muted: #AA8F7C; --ml-text: #F4ECE3;
  --t-bg-rgb: 11 10 9; --t-surface-rgb: 18 17 15; --t-surface-2-rgb: 25 22 18; --t-surface-raised-rgb: 29 25 21; --t-line-rgb: 52 40 32; --t-hover-rgb: 36 27 22;
  --t-cyan-100-rgb: 255 235 205; --t-cyan-200-rgb: 255 214 160; --t-cyan-300-rgb: 255 194 112; --t-cyan-400-rgb: 242 163 58; --t-cyan-500-rgb: 216 131 40; --t-cyan-950-rgb: 61 37 16;
  --t-rose-50-rgb: 255 240 237; --t-rose-200-rgb: 255 188 177; --t-rose-300-rgb: 255 146 127; --t-rose-400-rgb: 255 115 95; --t-rose-500-rgb: 233 91 73; --t-rose-950-rgb: 58 23 20;
}
html[data-theme='arctic'] {
  color-scheme: light;
  --t-bg: #F2F7FC; --t-bg-image: none; --t-accent-soft: #DBEAFE;
  --t-surface: #FFFFFF; --t-surface-2: #FFFFFF; --t-surface-raised: #F8FAFD; --t-surface-inset: #E8F0F8;
  --t-line: #DCE6F0; --t-line-strong: #B9CADB; --t-hover: #EAF2FA; --t-text: #102A43; --t-text-2: #334E68; --t-muted: #52677D; --t-faint: #647C94;
  --t-header-bg: #FFFFFF; --t-header-solid: #FFFFFF; --t-dock-bg: #FFFFFF;
  --t-overlay-04: rgba(16,42,67,.04); --t-overlay-06: rgba(16,42,67,.06); --t-overlay-08: rgba(16,42,67,.08); --t-overlay-15: rgba(16,42,67,.15); --t-sheen: rgba(255,255,255,.48);
  --t-nav-active-text: #173B68; --t-shadow-card: 0 12px 28px -20px rgba(16,42,67,.20); --t-shadow-hover: 0 14px 32px -20px rgba(16,42,67,.28); --t-dock-shadow: 0 16px 40px -18px rgba(16,42,67,.24); --t-brief-gradient: #FFFFFF;
  --glass-fill: #FFFFFF; --glass-edge: #DCE6F0; --glass-shadow: 0 12px 28px -20px rgba(16,42,67,.20); --ml-bg: #F2F7FC; --ml-surface: #FFFFFF; --ml-surface-raised: #F8FAFD; --ml-line: #DCE6F0; --ml-muted: #52677D; --ml-text: #102A43;
  --t-bg-rgb: 242 247 252; --t-surface-rgb: 255 255 255; --t-surface-2-rgb: 255 255 255; --t-surface-raised-rgb: 248 250 253; --t-line-rgb: 220 230 240; --t-hover-rgb: 234 242 250;
  --t-white-rgb: 13 35 58; --t-slate-100-rgb: 13 35 58; --t-slate-200-rgb: 22 47 72; --t-slate-300-rgb: 51 68 86; --t-slate-400-rgb: 79 98 119; --t-slate-500-rgb: 96 114 134; --t-slate-600-rgb: 126 144 161; --t-slate-700-rgb: 218 229 241; --t-slate-800-rgb: 233 240 247; --t-slate-900-rgb: 243 247 251; --t-slate-950-rgb: 248 250 252;
  --t-cyan-100-rgb: 30 64 120; --t-cyan-200-rgb: 30 64 120; --t-cyan-300-rgb: 37 99 235; --t-cyan-400-rgb: 37 99 235; --t-cyan-500-rgb: 29 78 216; --t-cyan-950-rgb: 219 234 254;
  --t-blue-200-rgb: 30 64 120; --t-blue-300-rgb: 37 99 235; --t-blue-400-rgb: 37 99 235; --t-blue-500-rgb: 29 78 216; --t-blue-950-rgb: 219 234 254;
}
html[data-theme='burgundy'] {
  color-scheme: dark;
  --t-bg: #160A10; --t-bg-image: radial-gradient(900px 540px at 82% -8%, rgba(219,91,128,.13), transparent 62%), radial-gradient(700px 600px at 2% 90%, rgba(92,28,51,.20), transparent 60%);
  --t-accent-soft: #4A1F30; --t-surface: #201018; --t-surface-2: #29141D; --t-surface-raised: #311923; --t-surface-inset: #10070B;
  --t-line: #462633; --t-line-strong: #603344; --t-hover: #381B29; --t-text: #F6E8ED; --t-text-2: #E0C6D0; --t-muted: #B3919F; --t-faint: #967382;
  --t-header-bg: rgba(22,10,16,.92); --t-header-solid: rgba(22,10,16,.98); --t-dock-bg: rgba(32,16,24,.95);
  --t-overlay-04: rgba(255,255,255,.04); --t-overlay-06: rgba(255,255,255,.06); --t-overlay-08: rgba(255,255,255,.08); --t-overlay-15: rgba(255,255,255,.15); --t-sheen: rgba(255,255,255,.025);
  --t-nav-active-text: #FFF0F4; --t-shadow-card: 0 8px 24px rgba(0,0,0,.30); --t-shadow-hover: 0 10px 28px rgba(0,0,0,.36); --t-dock-shadow: 0 16px 40px rgba(0,0,0,.5); --t-brief-gradient: #201018;
  --glass-fill: #201018; --glass-edge: #462633; --glass-shadow: 0 8px 24px rgba(0,0,0,.30); --ml-bg: #160A10; --ml-surface: #201018; --ml-surface-raised: #311923; --ml-line: #462633; --ml-muted: #B3919F; --ml-text: #F6E8ED;
  --t-bg-rgb: 22 10 16; --t-surface-rgb: 32 16 24; --t-surface-2-rgb: 41 20 29; --t-surface-raised-rgb: 49 25 35; --t-line-rgb: 70 38 51; --t-hover-rgb: 56 27 41;
  --t-cyan-100-rgb: 255 221 231; --t-cyan-200-rgb: 255 179 200; --t-cyan-300-rgb: 245 132 163; --t-cyan-400-rgb: 232 102 140; --t-cyan-500-rgb: 199 70 111; --t-cyan-950-rgb: 63 21 38;
  --t-rose-50-rgb: 255 235 241; --t-rose-200-rgb: 255 179 200; --t-rose-300-rgb: 245 132 163; --t-rose-400-rgb: 232 102 140; --t-rose-500-rgb: 199 70 111; --t-rose-950-rgb: 63 21 38;
}
html[data-theme='redline'] {
  color-scheme: dark;
  --t-bg: #090909; --t-bg-image: linear-gradient(rgba(255,75,62,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,75,62,.035) 1px, transparent 1px);
  --t-accent-soft: #361312; --t-surface: #121212; --t-surface-2: #191919; --t-surface-raised: #161616; --t-surface-inset: #080808;
  --t-line: #2B2B2B; --t-line-strong: #484848; --t-hover: #222222; --t-text: #F3F3F3; --t-text-2: #D0D0D0; --t-muted: #A4A4A4; --t-faint: #858585;
  --t-header-bg: rgba(9,9,9,.94); --t-header-solid: rgba(9,9,9,.99); --t-dock-bg: rgba(18,18,18,.96);
  --t-overlay-04: rgba(255,255,255,.04); --t-overlay-06: rgba(255,255,255,.06); --t-overlay-08: rgba(255,255,255,.08); --t-overlay-15: rgba(255,255,255,.15); --t-sheen: rgba(255,255,255,.02);
  --t-nav-active-text: #FFFFFF; --t-shadow-card: 0 8px 24px rgba(0,0,0,.34); --t-shadow-hover: 0 10px 28px rgba(0,0,0,.42); --t-dock-shadow: 0 16px 40px rgba(0,0,0,.55); --t-brief-gradient: #121212;
  --glass-fill: #121212; --glass-edge: #2B2B2B; --glass-shadow: 0 8px 24px rgba(0,0,0,.34); --ml-bg: #090909; --ml-surface: #121212; --ml-surface-raised: #161616; --ml-line: #2B2B2B; --ml-muted: #A4A4A4; --ml-text: #F3F3F3;
  --t-bg-rgb: 9 9 9; --t-surface-rgb: 18 18 18; --t-surface-2-rgb: 25 25 25; --t-surface-raised-rgb: 22 22 22; --t-line-rgb: 43 43 43; --t-hover-rgb: 34 34 34;
  --t-cyan-100-rgb: 255 226 223; --t-cyan-200-rgb: 255 192 186; --t-cyan-300-rgb: 255 136 126; --t-cyan-400-rgb: 255 75 62; --t-cyan-500-rgb: 214 54 45; --t-cyan-950-rgb: 54 19 18;
  --t-rose-50-rgb: 255 226 223; --t-rose-200-rgb: 255 192 186; --t-rose-300-rgb: 255 136 126; --t-rose-400-rgb: 255 75 62; --t-rose-500-rgb: 214 54 45; --t-rose-950-rgb: 54 19 18;
  --t-emerald-50-rgb: 238 238 238; --t-emerald-200-rgb: 210 210 210; --t-emerald-300-rgb: 195 195 195; --t-emerald-400-rgb: 178 178 178; --t-emerald-500-rgb: 156 156 156; --t-emerald-600-rgb: 130 130 130;
  --t-purple-100-rgb: 238 238 238; --t-purple-200-rgb: 218 218 218; --t-purple-300-rgb: 198 198 198; --t-purple-400-rgb: 175 175 175; --t-purple-500-rgb: 145 145 145; --t-purple-600-rgb: 123 123 123; --t-purple-950-rgb: 38 38 38;
  --t-amber-100-rgb: 238 238 238; --t-amber-200-rgb: 218 218 218; --t-amber-300-rgb: 198 198 198; --t-amber-400-rgb: 175 175 175; --t-amber-500-rgb: 145 145 145;
  --t-blue-200-rgb: 218 218 218; --t-blue-300-rgb: 198 198 198; --t-blue-400-rgb: 175 175 175; --t-blue-500-rgb: 145 145 145; --t-blue-950-rgb: 38 38 38;
}
html[data-theme='terra'] {
  color-scheme: light;
  --t-bg: #F3EBDD; --t-bg-image: none; --t-accent-soft: #E7D5C3;
  --t-surface: #FCF9F3; --t-surface-2: #F9F5EE; --t-surface-raised: #F7F1E7; --t-surface-inset: #EAE0D2;
  --t-line: #DED1C0; --t-line-strong: #C8B49B; --t-hover: #EFE5D7; --t-text: #1F2F3B; --t-text-2: #3F515D; --t-muted: #667177; --t-faint: #778184;
  --t-header-bg: #FCF9F3; --t-header-solid: #FCF9F3; --t-dock-bg: #FCF9F3;
  --t-overlay-04: rgba(31,47,59,.04); --t-overlay-06: rgba(31,47,59,.06); --t-overlay-08: rgba(31,47,59,.08); --t-overlay-15: rgba(31,47,59,.15); --t-sheen: rgba(255,255,255,.40);
  --t-nav-active-text: #263F52; --t-shadow-card: 0 12px 28px -20px rgba(71,50,32,.20); --t-shadow-hover: 0 14px 32px -20px rgba(71,50,32,.27); --t-dock-shadow: 0 16px 40px -18px rgba(71,50,32,.25); --t-brief-gradient: #FCF9F3;
  --glass-fill: #FCF9F3; --glass-edge: #DED1C0; --glass-shadow: 0 12px 28px -20px rgba(71,50,32,.20); --ml-bg: #F3EBDD; --ml-surface: #FCF9F3; --ml-surface-raised: #F7F1E7; --ml-line: #DED1C0; --ml-muted: #667177; --ml-text: #1F2F3B;
  --t-bg-rgb: 243 235 221; --t-surface-rgb: 252 249 243; --t-surface-2-rgb: 249 245 238; --t-surface-raised-rgb: 247 241 231; --t-line-rgb: 222 209 192; --t-hover-rgb: 239 229 215;
  --t-white-rgb: 31 47 59; --t-slate-100-rgb: 31 47 59; --t-slate-200-rgb: 45 61 73; --t-slate-300-rgb: 72 86 96; --t-slate-400-rgb: 102 113 119; --t-slate-500-rgb: 119 129 132; --t-slate-600-rgb: 140 149 151; --t-slate-700-rgb: 220 209 193; --t-slate-800-rgb: 235 227 213; --t-slate-900-rgb: 243 235 222; --t-slate-950-rgb: 249 246 239;
  --t-cyan-100-rgb: 117 69 42; --t-cyan-200-rgb: 145 81 48; --t-cyan-300-rgb: 169 101 67; --t-cyan-400-rgb: 181 110 75; --t-cyan-500-rgb: 151 82 55; --t-cyan-950-rgb: 242 226 213;
  --t-blue-200-rgb: 38 63 82; --t-blue-300-rgb: 38 63 82; --t-blue-400-rgb: 55 83 101; --t-blue-500-rgb: 73 105 123; --t-blue-950-rgb: 227 236 239;
}

/* Solid, low-glare surfaces for the two added light themes. */
html[data-theme='arctic'] .app-header, html[data-theme='terra'] .app-header,
html[data-theme='arctic'] .card-base, html[data-theme='terra'] .card-base,
html[data-theme='arctic'] .card-elevated, html[data-theme='terra'] .card-elevated,
html[data-theme='arctic'] .cyber-glass, html[data-theme='terra'] .cyber-glass,
html[data-theme='arctic'] .market-overview .card-base, html[data-theme='terra'] .market-overview .card-base,
html[data-theme='arctic'] .app-sidebar, html[data-theme='terra'] .app-sidebar,
html[data-theme='arctic'] .mobile-nav, html[data-theme='terra'] .mobile-nav,
html[data-theme='arctic'] .mobile-search-orb, html[data-theme='terra'] .mobile-search-orb,
html[data-theme='arctic'] .intro-watchlist, html[data-theme='terra'] .intro-watchlist,
html[data-theme='arctic'] .theme-menu, html[data-theme='terra'] .theme-menu,
html[data-theme='arctic'] .mobile-more-menu, html[data-theme='terra'] .mobile-more-menu {
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
html[data-theme='arctic'] .card-base, html[data-theme='terra'] .card-base,
html[data-theme='arctic'] .card-elevated, html[data-theme='terra'] .card-elevated,
html[data-theme='arctic'] .cyber-glass, html[data-theme='terra'] .cyber-glass,
html[data-theme='arctic'] .market-overview .card-base, html[data-theme='terra'] .market-overview .card-base { background-image: none; }
html[data-theme='arctic'] .market-overview .card-base:first-child, html[data-theme='terra'] .market-overview .card-base:first-child { background-image: none; background-color: var(--t-surface); border-color: var(--t-line-strong); }
html[data-theme='arctic'] .scanner-section table th, html[data-theme='terra'] .scanner-section table th { color: var(--t-muted); }
html[data-theme='arctic'] .mobile-nav-lens, html[data-theme='terra'] .mobile-nav-lens { box-shadow: inset 0 1px 1px rgba(255,255,255,.48), 0 2px 8px rgba(16,42,67,.12); }
html[data-theme='arctic'] ::-webkit-scrollbar-thumb, html[data-theme='terra'] ::-webkit-scrollbar-thumb { background: var(--t-overlay-15); }

/* Brand marks echo each approved concept while keeping the existing mark asset. */
html[data-theme='ember'] .brand-mark { color: #FFB449; background: linear-gradient(145deg,#3A2114,#1A120E); border: 1px solid #8C542A; border-radius: 7px; box-shadow: 0 6px 18px -8px rgba(242,163,58,.55); }
html[data-theme='arctic'] .brand-mark { color: #2563EB; background: linear-gradient(145deg,#FFFFFF,#DBEAFE); border: 1px solid #B9D5F3; border-radius: 6px; box-shadow: 0 6px 18px -8px rgba(37,99,235,.30); }
html[data-theme='burgundy'] .brand-mark { color: #F084A0; background: #321723; border: 1px solid #8A405A; border-radius: 50%; box-shadow: 0 0 0 2px rgba(219,91,128,.12), 0 6px 18px -8px rgba(219,91,128,.35); }
html[data-theme='redline'] .brand-mark { color: #FF4B3E; background: #111111; border: 1px solid #FF4B3E; border-radius: 2px; box-shadow: 0 0 0 2px rgba(255,75,62,.10); }
html[data-theme='terra'] .brand-mark { color: #A65D3F; background: #F3EBDD; border: 1px solid #B56E4B; border-radius: 50%; box-shadow: inset 0 0 0 2px #FCF9F3, 0 0 0 1px rgba(181,110,75,.50); }

/* Compact terminal typography and editorial heading treatments. */
html[data-theme='ember'] body { font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; letter-spacing: -.015em; }
html[data-theme='arctic'] body { font-family: 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif; }
html[data-theme='burgundy'] :is(h1,h2,h3,h4) { font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif; letter-spacing: -.025em; }
html[data-theme='redline'] body { font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; letter-spacing: -.02em; }
html[data-theme='terra'] :is(h1,h2,h3,h4) { font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif; letter-spacing: -.025em; }
"""
_extra_theme_file = pathlib.Path('apps/web/src/theme.css')
_extra_theme_file.write_text(
    _extra_theme_file.read_text().rstrip() + '\n\n' + EXTRA_THEME_CSS.strip() + '\n'
)
