import re
from pathlib import Path

_WORD_SET: set[str] | None = None
_WORDS_FILE = Path(__file__).parent / "words.txt"


def _load_words() -> set[str]:
	with open(_WORDS_FILE, "r", encoding="utf-8") as f:
		return {line.strip() for line in f if line.strip()}


def get_word_set() -> set[str]:
	global _WORD_SET
	if _WORD_SET is None:
		_WORD_SET = _load_words()
	return _WORD_SET


def is_valid_word(word: str, letters: set[str], center: str) -> tuple[bool, str]:
	"""
	Validate a submitted word against the current puzzle.
	Returns (valid: bool, reason: str).
	"""
	word = word.lower().strip()

	if len(word) < 4:
		return False, "Too short — words must be 4+ letters."

	if not re.fullmatch(r"[a-z]+", word):
		return False, "Only English letters allowed."

	if center not in word:
		return False, f'Must contain the center letter "{center.upper()}".'

	if not all(c in letters for c in word):
		return False, "Letters not in today's puzzle."

	if word not in get_word_set():
		return False, "Not in word list."

	return True, "OK"


def is_pangram(word: str, letters: set[str]) -> bool:
	"""Returns True if the word uses every letter in the set."""
	return letters.issubset(set(word))


def score_word(word: str, letters: set[str]) -> int:
	"""NYT-style scoring."""
	n = len(word)
	if n == 4:
		return 1
	pts = n
	if is_pangram(word, letters):
		pts += 7
	return pts
