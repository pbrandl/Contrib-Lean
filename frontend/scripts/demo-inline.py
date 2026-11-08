# Turns frontend/build-demo into one self-contained page for an Artifact.
import base64, glob, os, re, sys
build = sys.argv[1]
out = sys.argv[2]
css_path = glob.glob(os.path.join(build, 'static/css/main.*.css'))[0]
js_path = glob.glob(os.path.join(build, 'static/js/main.*.js'))[0]
css = open(css_path, encoding='utf-8').read()

# Keep only the latin font subsets (German needs nothing else).
def keep_face(m):
    block = m.group(0)
    return block if re.search(r'-latin(-ext)?-wght', block) else ''
css = re.sub(r'@font-face\{[^}]*\}', keep_face, css)

def data_uri(m):
    rel = m.group(1).strip('\'"')
    path = os.path.normpath(os.path.join(os.path.dirname(css_path), rel))
    mime = 'font/woff2' if path.endswith('.woff2') else 'image/webp' if path.endswith('.webp') else 'application/octet-stream'
    return 'url(data:%s;base64,%s)' % (mime, base64.b64encode(open(path, 'rb').read()).decode())
css = re.sub(r'url\(([^)]+\.(?:woff2|webp))\)', data_uri, css)
css = re.sub(r'/\*# sourceMappingURL=.*?\*/', '', css)

js = open(js_path, encoding='utf-8').read()
js = re.sub(r'//# sourceMappingURL=.*', '', js).replace('</script', '<\\/script')

# The artifact host wraps the page in its own document; charset and viewport make the file
# work on its own too (a release attaches it, and phones would show it zoomed out without).
page = f'''<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Bietrunde Demo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Bietrunde: Gebote und Stunden für ein Gemeinschaftsprojekt sammeln. Demo mit Beispieldaten.">
<style>{css}</style>
<noscript>Bitte aktiviere JavaScript, um die Demo zu sehen.</noscript>
<div id="root"></div>
<script>{js}</script>
'''
open(out, 'w', encoding='utf-8').write(page)
print(len(page) // 1024, 'KB')
