"""
Taxonomy module for Workout Player.
Provides structured metadata for muscles, anatomical regions, categories,
disciplines, and normalizes legacy muscle keys.
"""

from typing import Any

MUSCLE_DEFINITIONS: dict[str, dict[str, Any]] = {
	"chest": {
		"id": "chest",
		"label": "Chest (Pectorals)",
		"icon": "🫁",
		"region": "upper",
		"color": "#c46860",
	},
	"shoulders": {
		"id": "shoulders",
		"label": "Shoulders (Deltoids)",
		"icon": "🥋",
		"region": "upper",
		"color": "#c77953",
	},
	"biceps": {
		"id": "biceps",
		"label": "Biceps",
		"icon": "💪",
		"region": "upper",
		"color": "#cbb07a",
	},
	"triceps": {
		"id": "triceps",
		"label": "Triceps",
		"icon": "🦾",
		"region": "upper",
		"color": "#d19e5b",
	},
	"forearms": {
		"id": "forearms",
		"label": "Forearms & Wrists",
		"icon": "✊",
		"region": "upper",
		"color": "#9ea2bd",
	},
	"abs": {
		"id": "abs",
		"label": "Abs & Core",
		"icon": "🍫",
		"region": "core",
		"color": "#5fa778",
	},
	"obliques": {
		"id": "obliques",
		"label": "Obliques & Flanks",
		"icon": "📐",
		"region": "core",
		"color": "#6aa3a9",
	},
	"pelvic_floor": {
		"id": "pelvic_floor",
		"label": "Pelvic Floor & Base",
		"icon": "⚓",
		"region": "core",
		"color": "#8195a2",
	},
	"adductors": {
		"id": "adductors",
		"label": "Adductors",
		"icon": "🌿",
		"region": "lower",
		"color": "#78a88a",
	},
	"hip_flexors": {
		"id": "hip_flexors",
		"label": "Hip Flexors & Psoas",
		"icon": "⚡",
		"region": "core",
		"color": "#d19e5b",
	},
	"quads": {
		"id": "quads",
		"label": "Quadriceps",
		"icon": "🦵",
		"region": "lower",
		"color": "#c46860",
	},
	"hamstrings": {
		"id": "hamstrings",
		"label": "Hamstrings",
		"icon": "🏃",
		"region": "lower",
		"color": "#c77953",
	},
	"glutes": {
		"id": "glutes",
		"label": "Glutes",
		"icon": "🍑",
		"region": "lower",
		"color": "#5fa778",
	},
	"calves": {
		"id": "calves",
		"label": "Calves & Ankles",
		"icon": "🦶",
		"region": "lower",
		"color": "#6aa3a9",
	},
	"upper_back": {
		"id": "upper_back",
		"label": "Upper Back & Rhomboids",
		"icon": "🛡️",
		"region": "back",
		"color": "#8195a2",
	},
	"lats": {
		"id": "lats",
		"label": "Lats (Wings)",
		"icon": "🦅",
		"region": "back",
		"color": "#5fa778",
	},
	"lower_back": {
		"id": "lower_back",
		"label": "Lower Back (Erectors)",
		"icon": "🪵",
		"region": "back",
		"color": "#cbb07a",
	},
	"traps": {
		"id": "traps",
		"label": "Traps & Neck",
		"icon": "🪨",
		"region": "upper",
		"color": "#c46860",
	},
}

ANATOMICAL_REGIONS: list[dict[str, Any]] = [
	{"id": "all", "label": "All Movements", "icon": "🎯"},
	{
		"id": "lower",
		"label": "Lower Body & Legs",
		"icon": "🦵",
		"muscles": ["quads", "hamstrings", "glutes", "calves", "adductors"],
	},
	{
		"id": "core",
		"label": "Core & Hip Flexors",
		"icon": "🛡️",
		"muscles": ["abs", "obliques", "lower_back", "hip_flexors", "pelvic_floor"],
	},
	{
		"id": "arms",
		"label": "Arms & Grip",
		"icon": "💪",
		"muscles": ["biceps", "triceps", "forearms"],
	},
	{
		"id": "upper",
		"label": "Shoulders & Upper",
		"icon": "🥊",
		"muscles": ["shoulders", "chest", "traps", "upper_back", "lats"],
	},
	{
		"id": "stretch",
		"label": "Stretch & Mobility",
		"icon": "🧘",
		"categories": ["stretch", "mobility"],
		"disciplines": ["yoga"],
	},
]

CATEGORIES: dict[str, dict[str, Any]] = {
	"strength": {"label": "Strength / Force", "icon": "💪", "color": "#5fa778"},
	"drill": {"label": "Drills & Speed", "icon": "⚡", "color": "#6aa3a9"},
	"technique": {"label": "Technique & Form", "icon": "🥋", "color": "#8195a2"},
	"stretch": {"label": "Stretch & Recovery", "icon": "🧘", "color": "#78a88a"},
	"cardio": {"label": "Cardio & HIIT", "icon": "🫀", "color": "#c46860"},
	"mobility": {"label": "Mobility & Joints", "icon": "🔄", "color": "#cbb07a"},
}

DISCIPLINES: dict[str, dict[str, Any]] = {
	"muay_thai": {"label": "Muay Thai", "icon": "🥊", "color": "#c46860"},
	"boxing": {"label": "Boxing", "icon": "🥊", "color": "#c77953"},
	"calisthenics": {"label": "Calisthenics", "icon": "🤸", "color": "#6aa3a9"},
	"general": {"label": "General Fitness", "icon": "🏋️", "color": "#5fa778"},
	"yoga": {"label": "Yoga", "icon": "🧘", "color": "#78a88a"},
}

MUSCLE_ALIASES: dict[str, str] = {
	"groin": "adductors",
	"adductor": "adductors",
	"hip-flexors": "hip_flexors",
	"hip_flexor": "hip_flexors",
	"hipflexors": "hip_flexors",
	"psoas": "hip_flexors",
}


def normalize_muscle_slug(slug: str) -> str:
	"""Normalize a muscle key string, resolving aliases like 'groin' -> 'adductors'."""
	clean = slug.strip().lower()
	return MUSCLE_ALIASES.get(clean, clean)


def normalize_muscles_list(muscles: list[Any] | None) -> list[str]:
	"""Normalize a list of muscle identifiers, removing duplicates while preserving order."""
	if not muscles or not isinstance(muscles, list):
		return []
	result: list[str] = []
	seen: set[str] = set()
	for item in muscles:
		if not isinstance(item, str):
			continue
		norm = normalize_muscle_slug(item)
		if norm and norm not in seen:
			seen.add(norm)
			result.append(norm)
	return result


def get_taxonomy_payload() -> dict[str, Any]:
	"""Full taxonomy schema dictionary for the GET /api/taxonomy endpoint."""
	return {
		"muscles": list(MUSCLE_DEFINITIONS.values()),
		"regions": ANATOMICAL_REGIONS,
		"categories": [{"id": k, **v} for k, v in CATEGORIES.items()],
		"disciplines": [{"id": k, **v} for k, v in DISCIPLINES.items()],
		"aliases": MUSCLE_ALIASES,
	}
