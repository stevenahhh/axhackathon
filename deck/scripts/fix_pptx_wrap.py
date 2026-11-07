"""Post-process a slides-grab text-engine PPTX: single-line text boxes must not wrap.
Usage: python -I fix_pptx_wrap.py <in.pptx> <out.pptx>
"""
import re, sys, zipfile, shutil

src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
changed = 0
for item in zin.infolist():
    data = zin.read(item.filename)
    if re.match(r'ppt/slides/slide\d+\.xml$', item.filename):
        xml = data.decode('utf-8')
        def fix(m):
            global changed
            tag = m.group(0)
            tag = re.sub(r'\swrap="[^"]*"', '', tag)
            tag = re.sub(r'\s[lr]Ins="[^"]*"', '', tag)
            tag = tag.replace('<a:bodyPr', '<a:bodyPr wrap="none" lIns="0" rIns="0"', 1)
            changed += 1
            return tag
        xml = re.sub(r'<a:bodyPr[^>]*>', fix, xml)
        data = xml.encode('utf-8')
    zout.writestr(item, data)
zout.close()
print('bodyPr fixed:', changed)
