"""
Puzzle generator for Spelling Bee.
Each server session generates a fresh random puzzle.
A new puzzle can be requested at any time via new_puzzle().
"""

import random

from app.words import get_word_set

# Cache precomputed valid 7-letter pangram bases
_VALID_BASES: list[frozenset[str]] | None = None
VOWELS = {"a", "e", "i", "o", "u"}
MIN_VALID_WORDS = 25

# Module-level current puzzle — generated fresh on import, replaceable via new_puzzle()
_current_puzzle: dict | None = None


def _get_valid_bases(word_set: set[str]) -> list[frozenset[str]]:
	global _VALID_BASES
	if _VALID_BASES is None:
		bases: set[frozenset[str]] = set()
		for word in word_set:
			char_set = frozenset(word)
			if len(char_set) == 7:
				# Ensure vowel equilibrium: 2-3 vowels, avoid unusable single-letter dead ends
				num_vowels = len(char_set & VOWELS)
				if 2 <= num_vowels <= 3 and not (char_set & {"q", "z"}):
					bases.add(char_set)
		_VALID_BASES = list(bases)
	return _VALID_BASES


def _find_valid_puzzle(word_set: set[str]) -> tuple[str, list[str]]:
	"""
	Search for a 7-letter combination using pangram-first sampling where:
		- 7-letter set has 2-3 vowels (balanced structure)
		- At least MIN_VALID_WORDS common words can be formed
		- At least 1 pangram exists
	"""
	rng = random.Random()
	bases = _get_valid_bases(word_set)

	# Shuffle bases to sample without bias
	candidate_indices = list(range(len(bases)))
	rng.shuffle(candidate_indices)

	for idx in candidate_indices:
		base = bases[idx]
		shuffled_letters = list(base)
		rng.shuffle(shuffled_letters)

		# Evaluate candidate center letters to ensure a high-yield puzzle
		viable_centers: list[str] = []
		for candidate_center in shuffled_letters:
			valid_words = [
				w for w in word_set
				if candidate_center in w and set(w).issubset(base)
			]
			if len(valid_words) >= MIN_VALID_WORDS:
				viable_centers.append(candidate_center)

		if viable_centers:
			center = rng.choice(viable_centers)
			outer = [char for char in shuffled_letters if char != center]
			return center, outer

	# Fallback (safety net)
	fallback_base = bases[0]
	center = list(fallback_base)[0]
	outer = [c for c in fallback_base if c != center]
	return center, outer


def _build_puzzle() -> dict:
	"""Generate and return a complete puzzle dict."""
	word_set        = get_word_set()
	center, outer   = _find_valid_puzzle(word_set)
	letters_set     = set(outer) | {center}

	valid_words = sorted(
		w for w in word_set
		if center in w and all(c in letters_set for c in w)
	)
	pangrams = [w for w in valid_words if letters_set.issubset(set(w))]

	return {
		"center":      center,
		"outer":       outer,
		"all_letters": sorted(letters_set),
		"valid_words": valid_words,
		"pangrams":    pangrams,
		"max_score":   sum(_score(w, letters_set) for w in valid_words),
	}


def _score(word: str, letters: set[str]) -> int:
	n = len(word)
	if n == 4:
		return 1
	pts = n
	if letters.issubset(set(word)):
		pts += 7
	return pts


def generate_puzzle() -> dict:
	"""Generate a brand-new standalone puzzle dictionary."""
	return _build_puzzle()


def get_puzzle() -> dict:
	"""Return the current in-memory solo puzzle, generating one if needed."""
	global _current_puzzle
	if _current_puzzle is None:
		_current_puzzle = _build_puzzle()
	return _current_puzzle


def new_puzzle() -> dict:
	"""Discard the current solo puzzle and generate a brand-new random one."""
	global _current_puzzle
	_current_puzzle = _build_puzzle()
	return _current_puzzle
