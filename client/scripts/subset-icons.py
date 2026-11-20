"""Refresh the UI icon subset after changing icon names.

From client/, install fonttools[woff] and run python scripts/subset-icons.py.
The source font and Apache license ship in the locked material-symbols package.
"""
from pathlib import Path
import re
import shutil

from fontTools import subset
from fontTools.ttLib import TTFont


client = Path(__file__).resolve().parents[1]
package = client / 'node_modules' / 'material-symbols'
assets = client / 'src' / 'assets'
tokens = set()
for path in (client / 'src').rglob('*'):
    if path.suffix in {'.js', '.jsx'}:
        tokens.update(re.findall(r'[a-z][a-z0-9_]*', path.read_text(encoding='utf-8')))

font = TTFont(package / 'material-symbols-outlined.woff2')
letters = {glyph: chr(code) for code, glyph in font.getBestCmap().items() if code < 128}
icons = set()
for lookup in font['GSUB'].table.LookupList.Lookup:
    for table in lookup.SubTable:
        table = getattr(table, 'ExtSubTable', table)
        if not hasattr(table, 'ligatures'):
            continue
        for first, rules in table.ligatures.items():
            retained = []
            for rule in rules:
                name = ''.join(letters.get(ch, '') for ch in [first, *rule.Component])
                if name in tokens:
                    retained.append(rule)
                    icons.add(rule.LigGlyph)
            table.ligatures[first] = retained

if not icons:
    raise ValueError('No matching UI icon names found')
subsetter = subset.Subsetter()
subsetter.populate(glyphs=icons | set(letters))
subsetter.subset(font)
assets.mkdir(exist_ok=True)
target = assets / 'material-symbols-ui.woff2'
font.save(target)
licenses = client / 'public' / 'licenses'
licenses.mkdir(exist_ok=True)
shutil.copyfile(package / 'LICENSE', licenses / 'material-symbols.txt')
print(f'{len(icons)} UI icons, {target.stat().st_size:,} bytes')
