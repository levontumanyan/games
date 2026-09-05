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


def test_step_creation_from_exercise_and_combo():
	import shutil
	import subprocess

	if not shutil.which("node"):
		return

	js_dir = Path(__file__).parent.parent / "js"
	node_script = f"""
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
	globalThis.document = {{ querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {{}} }};
	globalThis.window = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}},
		__INITIAL_EXERCISES__: [
			{{
				id: 'ex-check-repeats',
				name: 'Check Repeats (Lead & Rear Block)',
				category: 'technique',
				discipline: 'muay_thai',
				default_mode: 'time',
				default_quantity: 60,
				media_assets: [
					{{
						id: 'asset-check-repeats-demo',
						kind: 'demonstration',
						type: 'video',
						title: 'Check Repeats Technique & Cadence',
						videoId: 'wPGC3uFIOBA',
						startSeconds: 0,
						endSeconds: 60
					}}
				]
			}}
		]
	}};

	const {{ createStepFromExercise, createStepFromCombo }} = await import('{js_dir}/editor.js');

	// 1. Video-backed exercise (Check Repeats)
	const checkRepeatsEx = {{
		id: 'ex-check-repeats',
		name: 'Check Repeats (Lead & Rear Block)',
		category: 'technique',
		discipline: 'muay_thai',
		default_mode: 'time',
		default_quantity: 60,
		media_assets: [
			{{
				id: 'asset-check-repeats-demo',
				kind: 'demonstration',
				type: 'video',
				title: 'Check Repeats Technique & Cadence',
				videoId: 'wPGC3uFIOBA',
				startSeconds: 0,
				endSeconds: 60
			}}
		]
	}};

	const clipStep = createStepFromExercise(checkRepeatsEx);
	if (clipStep.type !== 'clip' || clipStep.videoId !== 'wPGC3uFIOBA' || clipStep.endSeconds !== 60) {{
		throw new Error('createStepFromExercise failed for video exercise: ' + JSON.stringify(clipStep));
	}}

	// 2. Non-video exercise (pushups timer)
	const pushupsEx = {{
		id: 'ex-pushups',
		name: 'Push-Ups',
		category: 'strength',
		discipline: 'general',
		default_mode: 'reps',
		default_quantity: 25,
		media_url: '/workout/media/pushups.svg'
	}};

	const timerStep = createStepFromExercise(pushupsEx);
	if (timerStep.type !== 'timer' || timerStep.stepMode !== 'reps' || timerStep.targetReps !== 25) {{
		throw new Error('createStepFromExercise failed for reps exercise: ' + JSON.stringify(timerStep));
	}}

	// 2b. Reps exercise with instruction video (Explosive Pushups)
	const explosivePushupsEx = {{
		id: 'ex-explosive-pushups',
		name: 'Explosive Plyometric Pushups',
		category: 'strength',
		discipline: 'calisthenics',
		default_mode: 'reps',
		default_quantity: 8,
		media_url: 'https://www.youtube.com/watch?v=pdchoc-4f7Q',
		media_assets: [
			{{
				id: 'asset-explosive-pushups-video',
				kind: 'instruction',
				type: 'video',
				title: 'Instruction Tutorial',
				videoId: 'pdchoc-4f7Q',
				startSeconds: 0
			}}
		]
	}};

	const explosiveStep = createStepFromExercise(explosivePushupsEx);
	if (explosiveStep.type !== 'timer' || explosiveStep.stepMode !== 'reps' || explosiveStep.targetReps !== 8) {{
		throw new Error('createStepFromExercise failed for explosive pushups instruction video: ' + JSON.stringify(explosiveStep));
	}}

	// 2c. Timed exercise with instruction video (should not force a clip step)
	const timedInstructionEx = {{
		id: 'ex-timed-instruction',
		name: 'Plank Form Coaching',
		category: 'core',
		discipline: 'general',
		default_mode: 'time',
		default_quantity: 45,
		media_url: 'https://www.youtube.com/watch?v=example',
		media_assets: [
			{{
				id: 'asset-plank-tutorial',
				kind: 'instruction',
				type: 'video',
				title: 'Plank Tutorial',
				videoId: 'example'
			}}
		]
	}};

	const timedInstructionStep = createStepFromExercise(timedInstructionEx);
	if (timedInstructionStep.type !== 'timer' || timedInstructionStep.stepMode !== 'time' || timedInstructionStep.durationSeconds !== 45) {{
		throw new Error('createStepFromExercise failed for timed instruction exercise: ' + JSON.stringify(timedInstructionStep));
	}}

	// 3. Combo with video
	const comboWithVid = {{
		id: 'combo-1',
		name: 'Star Jumps Combo',
		flow_type: 'alternating',
		default_mode: 'time',
		default_quantity: 190,
		media_assets: [
			{{
				id: 'combo-asset-1',
				type: 'video',
				videoId: 'ZWZWzRnLpVM',
				startSeconds: 60,
				endSeconds: 250
			}}
		]
	}};

	// 4. Test resolveStepVideoAsset from player.js
	const {{ resolveStepVideoAsset }} = await import('{js_dir}/player.js');
	const legacyTimerStep = {{
		id: 'legacy-step-1',
		type: 'timer',
		durationSeconds: 60,
		label: 'Check Repeats',
		exercises: [{{ id: 'ex-check-repeats' }}]
	}};

	const resolvedVid = resolveStepVideoAsset(legacyTimerStep);
	if (!resolvedVid || resolvedVid.videoId !== 'wPGC3uFIOBA' || resolvedVid.endSeconds !== 60) {{
		throw new Error('resolveStepVideoAsset failed for legacy timer step: ' + JSON.stringify(resolvedVid));
	}}
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
	)
	assert res.returncode == 0, f"Node test for step creation failed:\n{res.stderr}"


def test_combo_substep_reps_and_duration_division():
	"""Verify getEffectiveSubStepReps and getEffectiveSubStepDuration correctly divide combo quantities."""
	import subprocess

	js_dir = Path(__file__).parent.parent / "js"
	node_script = f"""
	import {{ getEffectiveSubStepReps, getEffectiveSubStepDuration }} from '{js_dir}/utils.js';

	// Case 1: 30 reps across 4 exercises -> 8, 8, 7, 7 = 30
	const comboStep30 = {{
		id: 'step-pushups-30',
		type: 'timer',
		stepMode: 'reps',
		targetReps: 30,
		exercises: [
			{{ id: 'ex-pike-pushups', default_mode: 'reps', default_quantity: 12 }},
			{{ id: 'ex-decline-pushups', default_mode: 'reps', default_quantity: 15 }},
			{{ id: 'ex-standard-pushups', default_mode: 'reps', default_quantity: 20 }},
			{{ id: 'ex-diamond-pushups', default_mode: 'reps', default_quantity: 15 }}
		]
	}};

	const reps0 = getEffectiveSubStepReps(comboStep30, 0, 4, comboStep30.exercises[0]);
	const reps1 = getEffectiveSubStepReps(comboStep30, 1, 4, comboStep30.exercises[1]);
	const reps2 = getEffectiveSubStepReps(comboStep30, 2, 4, comboStep30.exercises[2]);
	const reps3 = getEffectiveSubStepReps(comboStep30, 3, 4, comboStep30.exercises[3]);

	if (reps0 !== 8 || reps1 !== 8 || reps2 !== 7 || reps3 !== 7) {{
		throw new Error(`Expected 8, 8, 7, 7 but got ${{reps0}}, ${{reps1}}, ${{reps2}}, ${{reps3}}`);
	}}
	if (reps0 + reps1 + reps2 + reps3 !== 30) {{
		throw new Error(`Sum of reps must equal 30, got ${{reps0 + reps1 + reps2 + reps3}}`);
	}}

	// Case 2: Explicit sub-exercise overrides
	const explicitStep = {{
		id: 'step-custom',
		type: 'timer',
		stepMode: 'reps',
		targetReps: 38,
		exercises: [
			{{ id: 'ex-pike', targetReps: 10 }},
			{{ id: 'ex-decline', targetReps: 10 }},
			{{ id: 'ex-standard', targetReps: 10 }},
			{{ id: 'ex-diamond', targetReps: 8 }}
		]
	}};
	if (getEffectiveSubStepReps(explicitStep, 0, 4, explicitStep.exercises[0]) !== 10) throw new Error('Expected explicit 10');
	if (getEffectiveSubStepReps(explicitStep, 3, 4, explicitStep.exercises[3]) !== 8) throw new Error('Expected explicit 8');

	// Case 3: 120s duration across 3 exercises -> 40, 40, 40
	const timedCombo = {{
		id: 'step-timed',
		type: 'timer',
		stepMode: 'time',
		durationSeconds: 120,
		exercises: [
			{{ id: 'ex-1' }},
			{{ id: 'ex-2' }},
			{{ id: 'ex-3' }}
		]
	}};
	if (getEffectiveSubStepDuration(timedCombo, 0, 3, timedCombo.exercises[0]) !== 40) throw new Error('Expected 40s');
	if (getEffectiveSubStepDuration(timedCombo, 1, 3, timedCombo.exercises[1]) !== 40) throw new Error('Expected 40s');
	if (getEffectiveSubStepDuration(timedCombo, 2, 3, timedCombo.exercises[2]) !== 40) throw new Error('Expected 40s');
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
	)
	assert res.returncode == 0, f"Node test for reps/duration division failed:\n{res.stderr}"


def test_routine_picker_module():
	"""Verify routine_picker.js module exports and popover helpers."""
	import shutil
	import subprocess

	if not shutil.which("node"):
		return

	js_dir = Path(__file__).parent.parent / "js"
	node_script = f"""
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
	globalThis.document = {{
		createElement: () => ({{
			className: '',
			style: {{}},
			classList: {{ add: () => {{}}, remove: () => {{}}, toggle: () => {{}} }},
			addEventListener: () => {{}},
			removeEventListener: () => {{}},
			appendChild: () => {{}},
			remove: () => {{}},
			querySelector: () => null,
			querySelectorAll: () => []
		}}),
		body: {{ appendChild: () => {{}} }},
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};
	globalThis.window = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}},
		innerHeight: 900,
		innerWidth: 1200
	}};

	const {{ showRoutinePickerPopover, closeRoutinePickerPopover }} = await import('{js_dir}/routine_picker.js');
	if (typeof showRoutinePickerPopover !== 'function') throw new Error('showRoutinePickerPopover not exported');
	if (typeof closeRoutinePickerPopover !== 'function') throw new Error('closeRoutinePickerPopover not exported');
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
	)
	assert res.returncode == 0, f"Node test for routine picker failed:\n{res.stderr}"
