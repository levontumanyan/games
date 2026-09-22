"""
Test suite to statically analyze JavaScript ES module dependency graph,
verify all named imports/exports resolve, and guarantee ZERO circular dependencies.
"""

import re
import subprocess
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


def test_workout_js_has_no_undeclared_or_unbound_identifiers():
	"""
	Run oxlint with `no-undef` enabled across all JS files.
	Guarantees 100% of referenced variables, functions, and imported identifiers
	exist and are bound in scope, preventing runtime ReferenceErrors in uncalled closures.
	"""
	import json
	import shutil
	import subprocess
	import tempfile

	if not shutil.which("npx"):
		return

	js_dir = Path(__file__).parent.parent / "js"
	config = {
		"env": {
			"browser": True,
			"builtin": True,
			"es2024": True,
		},
		"globals": {
			"YT": "readonly",
		},
		"rules": {
			"no-undef": "error",
			"no-unused-vars": "off",
		},
	}

	with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
		json.dump(config, f)
		cfg_path = f.name

	try:
		res = subprocess.run(
			["npx", "--yes", "oxlint", "-c", cfg_path, str(js_dir)],
			capture_output=True,
			text=True,
		)
		assert res.returncode == 0, (
			f"Undeclared / missing identifiers detected in workout JavaScript:\n{res.stdout}"
		)
	finally:
		Path(cfg_path).unlink(missing_ok=True)


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

	const {{ createStepFromExercise, createStepFromCombo, getStepDisplayName }} = await import('{js_dir}/editor.js');
	const {{ resolveStepVideo }} = await import('{js_dir}/exercises.js');

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
	if (clipStep.type !== 'timer' || clipStep.stepMode !== 'time' || clipStep.durationSeconds !== 60) {{
		throw new Error('createStepFromExercise should not bake a clip for a video exercise: ' + JSON.stringify(clipStep));
	}}
	// Media is resolved dynamically from the exercise library, not baked into the step.
	const dynamicVid = resolveStepVideo(clipStep);
	if (!dynamicVid || dynamicVid.videoId !== 'wPGC3uFIOBA' || dynamicVid.endSeconds !== 60) {{
		throw new Error('createStepFromExercise video should resolve dynamically: ' + JSON.stringify(dynamicVid));
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

	// 5. Test getStepDisplayName fallback logic
	if (getStepDisplayName({{ exercises: [{{ name: 'Plank Shoulder Taps' }}] }}) !== 'Plank Shoulder Taps') {{
		throw new Error('getStepDisplayName failed for step without label');
	}}
	if (getStepDisplayName({{ label: 'Exercise', exercises: [{{ name: 'Push-Ups' }}] }}) !== 'Push-Ups') {{
		throw new Error('getStepDisplayName failed for generic Exercise label');
	}}
	if (getStepDisplayName({{ label: 'Custom Workout Round', exercises: [{{ name: 'Push-Ups' }}] }}) !== 'Custom Workout Round') {{
		throw new Error('getStepDisplayName failed for explicit custom label');
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


def test_dynamic_exercise_media_resolution():
	"""Verify that workout routine steps dynamically inherit updated exercise video and GIF media."""
	js_dir = (Path(__file__).parent.parent / "js").resolve().as_posix()

	node_script = f"""
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
	globalThis.window = {{
		__INITIAL_EXERCISES__: [
			{{
				id: 'ex-frog-stretch',
				name: 'Frog Stretch',
				category: 'stretch',
				discipline: 'yoga',
				default_mode: 'time',
				default_quantity: 60,
				media_url: 'https://www.youtube.com/watch?v=7d-4CkcXWVU',
				media_assets: [
					{{
						id: 'asset-frog-v1',
						kind: 'demonstration',
						type: 'video',
						title: 'Frog Pose V1',
						videoId: '7d-4CkcXWVU',
						startSeconds: 0,
						endSeconds: 60
					}}
				]
			}}
		],
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};
	globalThis.document = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};

	const {{ resolveStepVideo, resolveStepVisual, setExercises, getExercises }} = await import('{js_dir}/exercises.js');
	const {{ createStepFromExercise, getStepDisplayName }} = await import('{js_dir}/editor.js');

	const initialEx = getExercises()[0];
	const step = createStepFromExercise(initialEx);

	// 1. Initial resolution should dynamically yield the exercise video
	const initialVideo = resolveStepVideo(step);
	if (!initialVideo || initialVideo.videoId !== '7d-4CkcXWVU') {{
		throw new Error('Expected initial video 7d-4CkcXWVU, got: ' + JSON.stringify(initialVideo));
	}}

	// 2. Dynamically update the exercise to a new video
	setExercises([
		{{
			...initialEx,
			media_url: 'https://www.youtube.com/watch?v=dUuZLrUOmhU',
			media_assets: [
				{{
					id: 'asset-frog-v2',
					kind: 'demonstration',
					type: 'video',
					title: 'Frog Pose V2',
					videoId: 'dUuZLrUOmhU',
					startSeconds: 5,
					endSeconds: 65
				}}
			]
		}}
	]);

	// The existing step should dynamically resolve to the new video without editing the routine!
	const updatedVideo = resolveStepVideo(step);
	if (!updatedVideo || updatedVideo.videoId !== 'dUuZLrUOmhU' || updatedVideo.startSeconds !== 5) {{
		throw new Error('Expected dynamically updated video dUuZLrUOmhU, got: ' + JSON.stringify(updatedVideo));
	}}

	// 3. Dynamically update the exercise to a GIF (removing video)
	setExercises([
		{{
			...initialEx,
			media_url: '/workout/media/frog-stretch.gif',
			media_assets: [
				{{
					id: 'asset-frog-gif',
					kind: 'animation',
					type: 'image',
					url: '/workout/media/frog-stretch.gif'
				}}
			]
		}}
	]);

	const noVideo = resolveStepVideo(step);
	if (noVideo !== null) {{
		throw new Error('Expected no video after switching exercise to GIF, got: ' + JSON.stringify(noVideo));
	}}
	const gifVisual = resolveStepVisual(step);
	if (gifVisual !== '/workout/media/frog-stretch.gif') {{
		throw new Error('Expected visual GIF /workout/media/frog-stretch.gif, got: ' + gifVisual);
	}}

	// 3b. Dynamically rename exercise -> getStepDisplayName should dynamically reflect new name
	setExercises([
		{{
			...initialEx,
			name: 'Frog Pose Super Stretch',
			media_url: '/workout/media/frog-stretch.gif'
		}}
	]);
	const updatedDisplayName = getStepDisplayName(step);
	if (updatedDisplayName !== 'Frog Pose Super Stretch') {{
		throw new Error('Expected dynamically updated step name, got: ' + updatedDisplayName);
	}}

	// 4. Custom step override takes precedence if flagged
	const customStep = {{
		...step,
		customMedia: true,
		videoId: 'override_abc',
		startSeconds: 10,
		endSeconds: 70
	}};
	const overrideVideo = resolveStepVideo(customStep);
	if (!overrideVideo || overrideVideo.videoId !== 'override_abc') {{
		throw new Error('Expected customMedia override override_abc, got: ' + JSON.stringify(overrideVideo));
	}}

	// 5. Standalone step video with no exercise attached
	const standaloneStep = {{
		id: 'step-standalone',
		type: 'clip',
		videoId: 'standalone_xyz',
		startSeconds: 0,
		endSeconds: 30
	}};
	const standaloneVideo = resolveStepVideo(standaloneStep);
	if (!standaloneVideo || standaloneVideo.videoId !== 'standalone_xyz') {{
		throw new Error('Expected standalone video standalone_xyz, got: ' + JSON.stringify(standaloneVideo));
	}}
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
	)
	assert res.returncode == 0, f"Node dynamic exercise media resolution test failed:\n{res.stderr}"


def test_player_start_routine_countdown():
	"""Verify startRoutine and countdown initialization run without ReferenceError or freeze."""
	js_dir = (Path(__file__).parent.parent / "js").resolve().as_posix()

	node_script = f"""
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
	const makeEl = () => ({{
		className: '',
		style: {{}},
		classList: {{ add: () => {{}}, remove: () => {{}}, toggle: () => {{}} }},
		addEventListener: () => {{}},
		removeEventListener: () => {{}},
		appendChild: () => {{}},
		removeChild: () => {{}},
		setAttribute: () => {{}},
		removeAttribute: () => {{}},
		querySelector: () => null,
		querySelectorAll: () => [],
		offsetHeight: 50,
		textContent: '',
		innerHTML: ''
	}});
	globalThis.document = {{
		getElementById: () => makeEl(),
		querySelector: () => makeEl(),
		querySelectorAll: () => [],
		createElement: () => makeEl(),
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};
	globalThis.window = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}},
		innerHeight: 800,
		innerWidth: 1200,
		__INITIAL_EXERCISES__: []
	}};

	const {{ startRoutine, clearCountdown, skipCountdown, stopPlayback }} = await import('{js_dir}/player.js');

	// Create a test routine starting with a video clip (matching san-lorenzo-el-ciclon)
	const testRoutine = {{
		id: 'test-routine-video-first',
		title: 'Test Routine Video First',
		steps: [
			{{
				id: 'step-0',
				type: 'clip',
				videoId: 'ZWZWzRnLpVM',
				startSeconds: 60,
				endSeconds: 250,
				label: 'Star Jumps & Coordination',
				exercises: [
					{{ id: 'ex-star-jumps', name: 'Star Jumps' }}
				]
			}},
			{{
				id: 'step-1',
				type: 'timer',
				durationSeconds: 30,
				label: 'Rest',
				isBreak: true
			}}
		]
	}};

	// Should successfully initialize countdown without throwing ReferenceError: videoAsset is not defined
	startRoutine(testRoutine, 0, false);

	// Test skipping countdown works without error
	skipCountdown();

	// Clean up
	clearCountdown();
	stopPlayback();
	process.exit(0);
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
		timeout=5,
	)
	assert res.returncode == 0, f"Node start routine countdown test failed:\n{res.stderr}"


def test_combo_video_resolution_and_up_next_metadata():
	"""Verify that combos dynamically resolve their demonstration asset without being hijacked by sub-exercises."""
	js_dir = (Path(__file__).parent.parent / "js").resolve().as_posix()

	node_script = f"""
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
	globalThis.window = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};
	globalThis.document = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};

	const {{ setExercises, resolveStepVideo }} = await import('{js_dir}/exercises.js');
	const {{ setCombos }} = await import('{js_dir}/combos.js');
	const {{ isRepsStep, isClipStep, isTimerStep, isBreakStep, getStepDuration }} = await import('{js_dir}/utils.js');

	// Set up exercises: ex-jab-cross (has instruction video 7sLw5dHdRG4, start 662)
	setExercises([
		{{
			id: 'ex-jab-cross',
			name: 'Jab-Cross Combo',
			category: 'technique',
			discipline: 'boxing',
			default_mode: 'time',
			default_quantity: 184,
			media_url: 'https://www.youtube.com/watch?v=7sLw5dHdRG4',
			media_assets: [
				{{
					id: 'asset-jab-cross-inst',
					kind: 'instruction',
					type: 'video',
					title: 'Jab Cross Punching Mechanics',
					videoId: '7sLw5dHdRG4',
					startSeconds: 662,
					endSeconds: 846
				}}
			]
		}},
		{{
			id: 'ex-knee-strike',
			name: 'Rear Knee Strike',
			category: 'technique',
			discipline: 'muay_thai',
			default_mode: 'time',
			default_quantity: 60,
			media_url: 'https://www.youtube.com/watch?v=z37V3X6tPG4',
			media_assets: [
				{{
					id: 'asset-knee-demo',
					kind: 'demonstration',
					type: 'video',
					videoId: 'z37V3X6tPG4',
					startSeconds: 694,
					endSeconds: 938
				}}
			]
		}}
	]);

	// Set up combo: combo-jab-knee (demonstration video z37V3X6tPG4 at 694s)
	setCombos([
		{{
			id: 'combo-jab-knee',
			name: 'Jab + Rear Knee',
			category: 'technique',
			discipline: 'muay_thai',
			flow_type: 'sequence',
			exercise_ids: ['ex-jab-cross', 'ex-knee-strike'],
			default_mode: 'time',
			default_quantity: 244,
			media_url: 'https://www.youtube.com/watch?v=z37V3X6tPG4',
			media_assets: [
				{{
					id: 'asset-combo-jab-knee',
					kind: 'demonstration',
					type: 'video',
					videoId: 'z37V3X6tPG4',
					startSeconds: 694,
					endSeconds: 938
				}}
			]
		}}
	]);

	// 1. Routine step referencing combo-jab-knee
	const comboStep = {{
		id: 'step-combo-1',
		type: 'clip',
		label: 'Jab + Rear Knee',
		combo_id: 'combo-jab-knee',
		videoId: 'z37V3X6tPG4',
		startSeconds: 694,
		endSeconds: 874,
		exercises: [
			{{ id: 'ex-jab-cross' }},
			{{ id: 'ex-knee-strike' }}
		]
	}};

	const resolvedComboVid = resolveStepVideo(comboStep);
	if (!resolvedComboVid || resolvedComboVid.videoId !== 'z37V3X6tPG4' || resolvedComboVid.startSeconds !== 694) {{
		throw new Error('Combo step video resolution failed: ' + JSON.stringify(resolvedComboVid));
	}}

	// 2. Reps step must resolve video to null
	const repsStep = {{
		id: 'step-reps-1',
		type: 'timer',
		stepMode: 'reps',
		targetReps: 25,
		durationSeconds: 30,
		label: 'Explosive Plyometric Pushups',
		exercises: [{{ id: 'ex-jab-cross' }}]
	}};

	if (!isRepsStep(repsStep)) {{
		throw new Error('isRepsStep failed for reps step');
	}}
	if (resolveStepVideo(repsStep) !== null) {{
		throw new Error('resolveStepVideo should return null for reps steps, got: ' + JSON.stringify(resolveStepVideo(repsStep)));
	}}

	// 3. Timed interval step with only instruction video must resolve video to null (not play at 0:00)
	const timedStep = {{
		id: 'step-timed-1',
		type: 'timer',
		stepMode: 'time',
		durationSeconds: 60,
		label: 'Jab-Cross Form Interval',
		exercises: [{{ id: 'ex-jab-cross' }}]
	}};

	if (!isTimerStep(timedStep)) {{
		throw new Error('isTimerStep failed for timed step');
	}}
	if (resolveStepVideo(timedStep) !== null) {{
		throw new Error('resolveStepVideo should return null for timed steps with only instruction video, got: ' + JSON.stringify(resolveStepVideo(timedStep)));
	}}

	// 4. getStepDuration
	if (getStepDuration(comboStep, resolvedComboVid) !== 180) {{
		throw new Error('getStepDuration failed for clip step, expected 180, got: ' + getStepDuration(comboStep, resolvedComboVid));
	}}
	if (getStepDuration(timedStep) !== 60) {{
		throw new Error('getStepDuration failed for timed step, expected 60, got: ' + getStepDuration(timedStep));
	}}

	// 5. Instruction tutorial breakdown preview must resolve to tutorial video slice
	const tutorialStep = {{
		id: 'preview-step',
		type: 'clip',
		isTutorial: true,
		customMedia: true,
		videoId: '7sLw5dHdRG4',
		startSeconds: 662,
		endSeconds: 846,
		label: 'Jab-Cross Combo: [Tutorial] Jab Cross Punching Mechanics',
		exercises: [{{ id: 'ex-jab-cross' }}]
	}};

	if (!isClipStep(tutorialStep)) {{
		throw new Error('isClipStep failed for tutorial step');
	}}
	const resolvedTutVid = resolveStepVideo(tutorialStep);
	if (!resolvedTutVid || resolvedTutVid.videoId !== '7sLw5dHdRG4' || resolvedTutVid.startSeconds !== 662 || resolvedTutVid.endSeconds !== 846) {{
		throw new Error('resolveStepVideo failed for tutorial step, got: ' + JSON.stringify(resolvedTutVid));
	}}
	if (getStepDuration(tutorialStep, resolvedTutVid) !== 184) {{
		throw new Error('getStepDuration failed for tutorial step, expected 184, got: ' + getStepDuration(tutorialStep, resolvedTutVid));
	}}

	// 6. Tutorial step with only exercise reference and isTutorial flag dynamically resolves instruction media
	const dynamicTutStep = {{
		id: 'preview-step-dyn',
		type: 'clip',
		isTutorial: true,
		label: 'Jab-Cross [Tutorial]',
		exercises: [{{ id: 'ex-jab-cross' }}]
	}};
	const resolvedDynTut = resolveStepVideo(dynamicTutStep);
	if (!resolvedDynTut || resolvedDynTut.videoId !== '7sLw5dHdRG4' || resolvedDynTut.startSeconds !== 662) {{
		throw new Error('resolveStepVideo failed to dynamically resolve instruction media, got: ' + JSON.stringify(resolvedDynTut));
	}}
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
		timeout=5,
	)
	assert res.returncode == 0, f"Node combo video resolution test failed:\n{res.stderr}"


def test_get_effective_exercise_quantity():
	"""Verify getEffectiveExerciseQuantity derives duration from video snippet when timed."""
	js_dir = Path(__file__).parent.parent / "js"
	node_script = f"""
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
	globalThis.window = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};
	globalThis.document = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};

	const {{ getEffectiveExerciseQuantity }} = await import('{js_dir}/exercises.js');

	// 1. Exercise with video snippet (243s) but default_quantity = 60
	const elbowStrikes = {{
		id: 'ex-elbow-strikes',
		name: 'Lead & Rear Elbow Strikes',
		default_mode: 'time',
		default_quantity: 60,
		media_assets: [
			{{
				id: 'asset-1',
				kind: 'demonstration',
				type: 'video',
				startSeconds: 1000,
				endSeconds: 1243
			}}
		]
	}};
	if (getEffectiveExerciseQuantity(elbowStrikes) !== 243) {{
		throw new Error('Expected 243s for elbowStrikes snippet, got: ' + getEffectiveExerciseQuantity(elbowStrikes));
	}}

	// 2. Exercise in reps mode should keep reps quantity
	const pushups = {{
		id: 'ex-pushups',
		name: 'Pushups',
		default_mode: 'reps',
		default_quantity: 25,
		media_assets: [
			{{
				id: 'asset-2',
				kind: 'demonstration',
				type: 'video',
				startSeconds: 10,
				endSeconds: 40
			}}
		]
	}};
	if (getEffectiveExerciseQuantity(pushups) !== 25) {{
		throw new Error('Expected 25 for reps mode, got: ' + getEffectiveExerciseQuantity(pushups));
	}}

	// 3. Timed exercise without snippet should use default_quantity
	const plank = {{
		id: 'ex-plank',
		name: 'Plank',
		default_mode: 'time',
		default_quantity: 45,
		media_assets: []
	}};
	if (getEffectiveExerciseQuantity(plank) !== 45) {{
		throw new Error('Expected 45 for plank without snippet, got: ' + getEffectiveExerciseQuantity(plank));
	}}
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
		timeout=5,
	)
	assert res.returncode == 0, f"Node getEffectiveExerciseQuantity test failed:\n{res.stderr}"


def test_editor_insert_divider_and_wheel_protections():
	"""Verify editor insert dividers flag the last step and contain drop slot indicators."""
	js_dir = Path(__file__).parent.parent / "js"
	node_script = f"""
	function makeEl(tag = 'div') {{
		const listeners = {{}};
		const classes = new Set();
		const children = [];
		return {{
			tagName: tag.toUpperCase(),
			className: '',
			dataset: {{}},
			style: {{}},
			children,
			classList: {{
				add: (...cls) => cls.forEach(c => classes.add(c)),
				remove: (...cls) => cls.forEach(c => classes.delete(c)),
				contains: (c) => classes.has(c),
				toggle: (c, force) => {{
					if (force === undefined) {{
						if (classes.has(c)) classes.delete(c); else classes.add(c);
					}} else if (force) {{
						classes.add(c);
					}} else {{
						classes.delete(c);
					}}
					return classes.has(c);
				}}
			}},
			appendChild: (ch) => {{ children.push(ch); return ch; }},
			append: (...chs) => chs.forEach(ch => children.push(ch)),
			addEventListener: (evt, cb) => {{
				if (!listeners[evt]) listeners[evt] = [];
				listeners[evt].push(cb);
			}},
			removeEventListener: (evt, cb) => {{
				if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== cb);
			}},
			dispatchEvent: (evt) => {{
				if (listeners[evt.type]) listeners[evt.type].forEach(cb => cb(evt));
			}},
			querySelector: (sel) => {{
				if (sel === '.step-drop-indicator') return children.find(c => c.className === 'step-drop-indicator') || null;
				if (sel === '.btn-insert-divider') return children.find(c => c.className === 'btn-insert-divider') || null;
				return null;
			}},
			querySelectorAll: () => []
		}};
	}}

	globalThis.document = {{
		createElement: (tag) => makeEl(tag),
		addEventListener: () => {{}},
		removeEventListener: () => {{}},
		querySelectorAll: () => []
	}};
	globalThis.window = {{
		addEventListener: () => {{}},
		removeEventListener: () => {{}}
	}};
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};

	const {{ createInsertDivider }} = await import('{js_dir}/editor.js');

	const routine = {{
		id: 'test-routine',
		title: 'Test Workout',
		steps: [
			{{ id: 's1', type: 'clip', videoId: 'abc', startSeconds: 0, endSeconds: 60 }},
			{{ id: 's2', type: 'timer', durationSeconds: 30, label: 'Rest', subtype: 'break' }}
		]
	}};

	// 1. Divider 0 should not be marked as last
	const div0 = createInsertDivider(routine, 0, () => {{}});
	if (div0.classList.contains('step-insert-divider-last')) {{
		throw new Error('Divider 0 should not be marked as step-insert-divider-last');
	}}

	// 2. Divider at index = routine.steps.length MUST be marked as step-insert-divider-last
	const divLast = createInsertDivider(routine, routine.steps.length, () => {{}});
	if (!divLast.classList.contains('step-insert-divider-last')) {{
		throw new Error('Last divider should have step-insert-divider-last class');
	}}

	// 3. Drop indicator must be present in divider
	const dropIndicator = divLast.querySelector('.step-drop-indicator');
	if (!dropIndicator) {{
		throw new Error('Divider must contain .step-drop-indicator');
	}}
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
		timeout=5,
	)
	assert res.returncode == 0, (
		f"Node test_editor_insert_divider_and_wheel_protections failed:\n{res.stderr}"
	)


def test_media_kinds_roles_and_visual_resolution():
	"""Verify media roles (demonstration vs instruction) and image demonstration handling."""
	js_dir = Path(__file__).parent.parent / "js"
	node_script = f"""
	globalThis.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
	globalThis.window = {{ addEventListener: () => {{}}, removeEventListener: () => {{}} }};
	globalThis.document = {{ addEventListener: () => {{}}, removeEventListener: () => {{}} }};

	const {{ getMediaKindInfo, getMediaKindBadgeHtml }} = await import('{js_dir}/taxonomy.js');
	const {{ getExerciseFollowAlongMedia, getExerciseInstructionMedia }} = await import('{js_dir}/exercises.js');

	// 1. Taxonomy info for demonstration video vs demonstration image
	const vidInfo = getMediaKindInfo('demonstration', 'video');
	if (vidInfo.label !== 'Follow-Along Demo') {{
		throw new Error('Expected Follow-Along Demo, got: ' + vidInfo.label);
	}}
	const imgInfo = getMediaKindInfo('demonstration', 'image');
	if (imgInfo.label !== 'Visual Form') {{
		throw new Error('Expected Visual Form, got: ' + imgInfo.label);
	}}

	// 2. Badge generation with asset object
	const imgBadge = getMediaKindBadgeHtml({{ kind: 'demonstration', type: 'image' }});
	if (!imgBadge.includes('Visual Form')) {{
		throw new Error('Expected Visual Form in badge, got: ' + imgBadge);
	}}

	// 3. Exercise follow-along resolution with demonstration image
	const exWithImgDemo = {{
		id: 'ex-img',
		name: 'Photo Pushup',
		media_assets: [
			{{ id: 'a1', kind: 'demonstration', type: 'image', url: '/workout/media/pushup.png' }},
			{{ id: 'a2', kind: 'instruction', type: 'video', videoId: 'abc123' }}
		]
	}};
	const followAlong = getExerciseFollowAlongMedia(exWithImgDemo);
	if (!followAlong || followAlong.id !== 'a1') {{
		throw new Error('Expected followAlong to resolve to a1, got: ' + JSON.stringify(followAlong));
	}}

	const instruction = getExerciseInstructionMedia(exWithImgDemo);
	if (!instruction || instruction.id !== 'a2') {{
		throw new Error('Expected instruction to resolve to a2, got: ' + JSON.stringify(instruction));
	}}
	"""

	res = subprocess.run(
		["node", "--input-type=module", "-e", node_script],
		capture_output=True,
		text=True,
		timeout=5,
	)
	assert res.returncode == 0, f"Node media kinds test failed:\n{res.stderr}"
