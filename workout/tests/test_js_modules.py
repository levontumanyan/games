"""
Test suite to statically analyze JavaScript ES module dependency graph,
verify all named imports/exports resolve, and guarantee ZERO circular dependencies.
"""

import re
from pathlib import Path


def parse_js_exports(file_path: Path) -> set[str]:
	"""Extract all named export identifiers from a JS module file."""
	content = file_path.read_text(encoding="utf-8")
	exports = set()

	# Pattern 1: export function foo / export async function foo / export const foo / export class foo
	for match in re.finditer(
		r"\bexport\s+(?:async\s+)?(?:function|const|let|var|class)\s+([a-zA-Z0-9_$]+)", content
	):
		exports.add(match.group(1))

	# Pattern 2: export { a, b as c, d }
	for match in re.finditer(r"\bexport\s*\{([^}]+)\}(?:\s*from\s*['\"]([^'\"]+)['\"])?", content):
		block = match.group(1)
		for item in block.split(","):
			item = item.strip()
			if not item:
				continue
			if " as " in item:
				_, exported_name = item.split(" as ")
				exports.add(exported_name.strip())
			else:
				exports.add(item)

	return exports


def parse_js_imports_and_exports_with_sources(file_path: Path) -> list[tuple[set[str], str]]:
	"""Extract imported/re-exported symbol names and their relative module specifier."""
	content = file_path.read_text(encoding="utf-8")
	results = []

	# Pattern 1: import { a, b } from './foo.js'
	for match in re.finditer(r"\bimport\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]", content):
		names = {n.strip().split(" as ")[0].strip() for n in match.group(1).split(",") if n.strip()}
		specifier = match.group(2)
		results.append((names, specifier))

	# Pattern 2: export { a, b } from './foo.js'
	for match in re.finditer(r"\bexport\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]", content):
		names = {n.strip().split(" as ")[0].strip() for n in match.group(1).split(",") if n.strip()}
		specifier = match.group(2)
		results.append((names, specifier))

	# Pattern 3: import * as foo from './foo.js' or import defaultExport from './foo.js'
	for match in re.finditer(
		r"\bimport\s+(?:(?:\*\s+as\s+[a-zA-Z0-9_$]+)|(?:[a-zA-Z0-9_$]+))\s+from\s*['\"]([^'\"]+)['\"]",
		content,
	):
		specifier = match.group(1)
		results.append((set(), specifier))

	return results


def build_js_dependency_graph(js_dir: Path) -> dict[str, set[str]]:
	"""Build a map of module_name -> set of imported module_names."""
	graph: dict[str, set[str]] = {}
	for js_file in js_dir.glob("*.js"):
		mod_name = js_file.name
		graph[mod_name] = set()
		for _, specifier in parse_js_imports_and_exports_with_sources(js_file):
			if specifier.startswith("."):
				target_name = Path(specifier).name
				graph[mod_name].add(target_name)
	return graph


def find_cycles_in_graph(graph: dict[str, set[str]]) -> list[list[str]]:
	"""Detect all cycles in directed graph using Tarjan / DFS."""
	cycles = []
	visited: set[str] = set()
	stack: list[str] = []
	stack_set: set[str] = set()

	def dfs(node: str):
		visited.add(node)
		stack.append(node)
		stack_set.add(node)

		for neighbor in graph.get(node, []):
			if neighbor in stack_set:
				cycle_start = stack.index(neighbor)
				cycles.append(stack[cycle_start:] + [neighbor])
			elif neighbor not in visited:
				dfs(neighbor)

		stack.pop()
		stack_set.remove(node)

	for node in graph:
		if node not in visited:
			dfs(node)

	return cycles


def test_workout_js_has_no_circular_dependencies():
	js_dir = Path(__file__).parent.parent / "js"
	assert js_dir.exists(), f"Directory not found: {js_dir}"

	graph = build_js_dependency_graph(js_dir)
	cycles = find_cycles_in_graph(graph)
	assert not cycles, f"Circular dependencies detected in {js_dir.name}:\n" + "\n".join(
		" -> ".join(c) for c in cycles
	)


def test_workout_all_js_imports_resolve_to_existing_files():
	js_dir = Path(__file__).parent.parent / "js"
	for js_file in js_dir.glob("*.js"):
		for _, specifier in parse_js_imports_and_exports_with_sources(js_file):
			if specifier.startswith("."):
				resolved_path = (js_file.parent / specifier).resolve()
				assert resolved_path.exists(), (
					f"{js_file.name} imports non-existent file: {specifier}"
				)


def test_workout_all_named_imports_match_exported_symbols():
	js_dir = Path(__file__).parent.parent / "js"
	for js_file in js_dir.glob("*.js"):
		for names, specifier in parse_js_imports_and_exports_with_sources(js_file):
			if specifier.startswith("."):
				target_file = (js_file.parent / specifier).resolve()
				if target_file.exists():
					target_exports = parse_js_exports(target_file)
					for name in names:
						assert name in target_exports, (
							f"{js_file.name} imports '{name}' from {specifier}, "
							f"but {target_file.name} does not export it! "
							f"Available exports: {sorted(target_exports)}"
						)


def test_workout_js_modules_evaluate_in_node():
	import shutil
	import subprocess

	if not shutil.which("node"):
		return  # Skip if node is not installed

	js_dir = Path(__file__).parent.parent / "js"
	node_script = f"""
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
	globalThis.document = {{ querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {{}} }};
	globalThis.window = {{ addEventListener: () => {{}}, removeEventListener: () => {{}} }};

	const files = {[f.name for f in js_dir.glob("*.js")]};
	for (const file of files) {{
		await import(`{js_dir}/` + file);
	}}
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
	)
	assert res.returncode == 0, f"Node failed to evaluate workout JS modules:\n{res.stderr}"


def test_youtube_playlist_and_video_parsing():
	import shutil
	import subprocess

	if not shutil.which("node"):
		return

	js_dir = Path(__file__).parent.parent / "js"
	node_script = f"""
	import {{ parseYouTubeInfo, parseYouTubeId, parseYouTubePlaylistId }} from '{js_dir}/utils.js';

	// 1. YouTube Music playlist
	const ytMusicPl = parseYouTubeInfo('https://music.youtube.com/playlist?list=OLAK5uy_lIHIK_DkEwWuvS6ibD_HcGpOqxfdK5XZI&si=ylcf4DF_rVxzX1Z3');
	if (!ytMusicPl || ytMusicPl.playlistId !== 'OLAK5uy_lIHIK_DkEwWuvS6ibD_HcGpOqxfdK5XZI' || !ytMusicPl.isPlaylist) {{
		throw new Error('Failed to parse YouTube Music playlist URL: ' + JSON.stringify(ytMusicPl));
	}}
	if (parseYouTubePlaylistId('https://music.youtube.com/playlist?list=OLAK5uy_lIHIK_DkEwWuvS6ibD_HcGpOqxfdK5XZI') !== 'OLAK5uy_lIHIK_DkEwWuvS6ibD_HcGpOqxfdK5XZI') {{
		throw new Error('parseYouTubePlaylistId failed for YT Music');
	}}

	// 2. Standard YouTube playlist
	const ytPl = parseYouTubeInfo('https://www.youtube.com/playlist?list=PL1234567890abcdef');
	if (!ytPl || ytPl.playlistId !== 'PL1234567890abcdef' || !ytPl.isPlaylist) {{
		throw new Error('Failed to parse YouTube playlist URL');
	}}

	// 3. Watch URL with video ID and playlist ID
	const ytWatchWithList = parseYouTubeInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdef');
	if (!ytWatchWithList || ytWatchWithList.videoId !== 'dQw4w9WgXcQ' || ytWatchWithList.playlistId !== 'PL1234567890abcdef' || ytWatchWithList.isPlaylist) {{
		throw new Error('Failed to parse video URL with list param');
	}}

	// 4. Standard Watch URL
	const ytWatch = parseYouTubeInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
	if (!ytWatch || ytWatch.videoId !== 'dQw4w9WgXcQ' || ytWatch.playlistId !== null || ytWatch.isPlaylist) {{
		throw new Error('Failed to parse standard watch URL');
	}}
	if (parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') !== 'dQw4w9WgXcQ') {{
		throw new Error('parseYouTubeId failed for standard watch URL');
	}}

	// 5. Short URL with timestamp
	const ytShort = parseYouTubeInfo('https://youtu.be/dQw4w9WgXcQ?t=45s');
	if (!ytShort || ytShort.videoId !== 'dQw4w9WgXcQ' || ytShort.startSeconds !== 45) {{
		throw new Error('Failed to parse youtu.be short URL with timestamp');
	}}
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
	)
	assert res.returncode == 0, f"Node test for YouTube parsing failed:\n{res.stderr}"
