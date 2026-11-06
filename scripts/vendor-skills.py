"""Refresh Jig's reviewed, pinned skill snapshots. Run deliberately; never at app startup.
Only Markdown/reference text is bundled; no upstream hooks, agents, MCP servers or executables.
"""
import concurrent.futures
import json
from pathlib import Path, PurePosixPath
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'skills'
SOURCES = [
 ('frontend-design', 'Frontend design', 'Design', 'Distinctive visual design, typography and styling that respects an existing product.', 'anthropics/skills', 'ca45fc496a3436251f191354091d557da31c15b5', 'skills/frontend-design', 'frontend-design', 'Apache-2.0', 'skills/frontend-design/LICENSE.txt'),
 ('react-performance', 'React performance', 'Frontend', 'React and Next.js rendering, data fetching and bundle performance.', 'vercel-labs/agent-skills', '1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62', 'skills/react-best-practices', 'vercel-react-best-practices', 'MIT', None),
 ('angular-development', 'Angular development', 'Frontend', 'Version-aware Angular components, signals, forms, routing and accessibility.', 'angular/angular', 'fdb4517612cf191da3c3e2df251f9f79f026448b', 'skills/dev-skills/angular-developer', 'angular-developer', 'MIT', 'LICENSE'),
 ('aspnet-api', 'ASP.NET Core APIs', 'Backend', 'HTTP APIs, validation, OpenAPI contracts and consistent error responses.', 'dotnet/skills', '95e7d0cb7994d47b5789baa68e13f7a2f348b956', 'plugins/dotnet-aspnetcore/skills/dotnet-webapi', 'dotnet-webapi', 'MIT', 'LICENSE'),
 # Jig factory's (D-430): text only, off by default (D-441); their upstream scripts are not bundled.
 ('web-artifacts', 'Web artifacts builder', 'Frontend', 'Multi-screen React, Tailwind and shadcn/ui front ends bundled into one HTML file.', 'anthropics/skills', 'ca45fc496a3436251f191354091d557da31c15b5', 'skills/web-artifacts-builder', 'web-artifacts-builder', 'Apache-2.0', 'skills/web-artifacts-builder/LICENSE.txt'),
 ('theme-factory', 'Theme factory', 'Design', 'Colour and font themes applied consistently to slides, documents and pages.', 'anthropics/skills', 'ca45fc496a3436251f191354091d557da31c15b5', 'skills/theme-factory', 'theme-factory', 'Apache-2.0', 'skills/theme-factory/LICENSE.txt'),
 ('webapp-testing', 'Web app testing', 'Testing', 'Checking a local web app with Playwright: screenshots, console logs, flows.', 'anthropics/skills', 'ca45fc496a3436251f191354091d557da31c15b5', 'skills/webapp-testing', 'webapp-testing', 'Apache-2.0', 'skills/webapp-testing/LICENSE.txt'),
 ('web-design-guidelines', 'Web design guidelines', 'Design', 'Reviewing UI code against the Web Interface Guidelines.', 'vercel-labs/agent-skills', '1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62', 'skills/web-design-guidelines', 'web-design-guidelines', 'MIT', None),
]
OFF_BY_DEFAULT = {'web-artifacts', 'theme-factory', 'webapp-testing', 'web-design-guidelines'}
# Extra pinned files: (skill id, repo, revision, upstream path, path inside the skill folder).
EXTRAS = [
 ('web-design-guidelines', 'vercel-labs/web-interface-guidelines', '434b7f91364665f2f733b310ec54809bf8f37937', 'command.md', 'references/web-interface-guidelines.md'),
 ('web-design-guidelines', 'vercel-labs/web-interface-guidelines', '434b7f91364665f2f733b310ec54809bf8f37937', 'LICENSE', 'references/LICENSE-web-interface-guidelines.txt'),
]

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Jig-reviewed-skills'})
    return urllib.request.urlopen(request, timeout=45).read()

def api(repo, path):
    return json.loads(fetch('https://api.github.com/repos/' + repo + '/' + path))

def download(repo, revision, path):
    return fetch(f'https://raw.githubusercontent.com/{repo}/{revision}/{path}')

catalog = []
for id, title, category, description, repo, revision, directory, name, license, license_path in SOURCES:
    dest = ROOT / id
    folder = dest / 'skills' / name
    entries = api(repo, f'contents/{directory}?ref={revision}')
    files = []
    for entry in entries:
        if entry['type'] == 'file':
            files.append((entry['name'], entry['path']))
        elif entry['type'] == 'dir':
            for item in api(repo, 'git/trees/' + entry['sha'] + '?recursive=1')['tree']:
                if item['type'] == 'blob':
                    relative = entry['name'] + '/' + item['path']
                    files.append((relative, directory + '/' + relative))
    def save(item):
        relative, upstream = item
        path = PurePosixPath(relative)
        if path.is_absolute() or '..' in path.parts:
            raise ValueError(relative)
        if not (relative.endswith('.md') or path.name.startswith('LICENSE') or relative == 'metadata.json'):
            return
        target = folder.joinpath(*path.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(download(repo, revision, upstream))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(save, files))
    if license_path:
        (dest / 'LICENSE.txt').write_bytes(download(repo, revision, license_path))
    else:
        # This upstream declares MIT in SKILL.md but supplies no separate licence file.
        # Preserve that declaration and attribution, and include the standard MIT grant.
        (dest / 'LICENSE.txt').write_text("""MIT License

Copyright (c) Vercel, Inc. and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
""", encoding='utf-8', newline='\n')
    for extra_id, extra_repo, extra_revision, upstream, relative in EXTRAS:
        if extra_id == id:
            target = folder / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(download(extra_repo, extra_revision, upstream))
    plugin = dest / '.claude-plugin' / 'plugin.json'
    plugin.parent.mkdir(parents=True, exist_ok=True)
    plugin.write_text(json.dumps({'name': 'jig-' + id, 'version': '1.0.0', 'description': description, 'author': {'name': repo.split('/')[0]}}, indent=2) + '\n', encoding='utf-8', newline='\n')
    catalog.append(dict(id=id,title=title,category=category,description=description,skillName=name,source=f'https://github.com/{repo}/tree/{revision}/{directory}',revision=revision,license=license,author=repo.split('/')[0],**({'defaultEnabled': False} if id in OFF_BY_DEFAULT else {})))
    print(id, len(files), 'reference files')
existing = json.loads((ROOT / 'catalog.json').read_text(encoding='utf-8')) if (ROOT / 'catalog.json').exists() else []
catalog += [skill for skill in existing if skill['author'] == 'Jig']
(ROOT / 'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8', newline='\n')
