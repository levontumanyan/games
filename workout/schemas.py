from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class BaseSchema(BaseModel):
	model_config = ConfigDict(extra="allow", populate_by_name=True)


class UserCreate(BaseSchema):
	id: str | None = Field(default=None, description="Unique user identifier (slug)")
	username: str | None = Field(default=None, description="Alias for user id")
	display_name: str | None = Field(default=None, description="Human-readable display name")


class MediaAsset(BaseSchema):
	id: str = Field(..., description="Unique asset identifier")
	kind: str = Field(
		..., description="Role of asset: demonstration (follow-along) or instruction (tutorial)"
	)
	type: str = Field(..., description="Media type: video or image")
	title: str = Field(..., description="Asset title or label")
	url: str = Field(..., description="URL to media resource")


class ExerciseCreate(BaseSchema):
	id: str | None = Field(
		default=None, description="Optional exercise ID (auto-generated if empty)"
	)
	name: str = Field(..., description="Exercise name", min_length=1)
	category: str = Field(
		default="strength", description="Category e.g. strength, cardio, technique, mobility, drill"
	)
	discipline: str = Field(
		default="general", description="Discipline e.g. general, boxing, muay_thai, kickboxing, bjj"
	)
	default_mode: str | None = Field(default=None, description="Execution mode: reps or time")
	default_quantity: int | None = Field(
		default=None, description="Default reps count or seconds duration"
	)
	description: str = Field(default="", description="Instructional details or cue notes")
	media_url: str = Field(default="", description="Primary demonstration video or image URL")
	media_assets: list[MediaAsset | dict[str, Any]] = Field(
		default_factory=list, description="Structured media assets"
	)
	primary_muscles: list[str] = Field(default_factory=list, description="Targeted primary muscles")
	secondary_muscles: list[str] = Field(
		default_factory=list, description="Targeted secondary muscles"
	)


class ComboCreate(BaseSchema):
	id: str | None = Field(default=None, description="Optional combo ID (auto-generated if empty)")
	name: str = Field(..., description="Combo title/name", min_length=1)
	category: str = Field(
		default="drill", description="Combo category e.g. drill, technique, circuit"
	)
	discipline: str = Field(
		default="general", description="Discipline e.g. boxing, muay_thai, general"
	)
	flow_type: str = Field(
		default="alternating", description="Execution flow: alternating, sequential, or circuit"
	)
	exercise_ids: list[Any] = Field(
		default_factory=list, description="List of exercise IDs or references"
	)
	default_mode: str = Field(default="time", description="Execution mode: reps or time")
	default_quantity: int = Field(default=190, description="Default quantity: seconds or reps")
	description: str = Field(default="", description="Combo instructions or notes")
	media_url: str = Field(default="", description="Demonstration URL")
	media_assets: list[MediaAsset | dict[str, Any]] = Field(
		default_factory=list, description="Structured media assets"
	)


class RoutineStep(BaseSchema):
	id: str | None = Field(default=None, description="Step identifier")
	type: str = Field(
		default="timer", description="Legacy step type: timer, clip, rest, combo, etc."
	)
	mode: str | None = Field(
		default=None,
		description="Execution mode: time, reps, or break (decoupled from media)",
	)
	stepMode: str | None = Field(
		default=None,
		validation_alias=AliasChoices("stepMode", "step_mode"),
		description="Execution mode: reps or time",
	)
	label: str | None = Field(default="", description="Step display label / title")
	durationSeconds: int | None = Field(
		default=None,
		validation_alias=AliasChoices("durationSeconds", "duration", "duration_seconds"),
		description="Timer duration in seconds",
	)
	targetDuration: int | None = Field(
		default=None,
		validation_alias=AliasChoices("targetDuration", "target_duration"),
		description="Execution target duration in seconds (time/break)",
	)
	duration: int | None = Field(
		default=None, description="Concise shorthand for step duration in seconds"
	)
	reps: int | None = Field(default=None, description="Repetition target if reps-based")
	targetReps: int | None = Field(
		default=None,
		validation_alias=AliasChoices("targetReps", "reps", "target_reps"),
		description="Execution target reps (reps mode)",
	)
	rest: int | None = Field(default=None, description="Concise rest duration in seconds")
	exercise_id: str | None = Field(default=None, description="Direct exercise identifier")
	mediaUrl: str | None = Field(
		default=None,
		validation_alias=AliasChoices("mediaUrl", "media_url", "gifUrl", "gif_url"),
		description="Demonstration media or image URL",
	)
	gifUrl: str | None = Field(default=None, description="Legacy media or gif URL")
	isBreak: bool | None = Field(
		default=None,
		validation_alias=AliasChoices("isBreak", "is_break"),
		description="Break step indicator",
	)
	subtype: str | None = Field(default=None, description="Step subtype (e.g. break)")
	videoId: str | None = Field(default=None, description="YouTube video ID if video clip")
	startSeconds: float | None = Field(default=None, description="Video clip start time in seconds")
	endSeconds: float | None = Field(default=None, description="Video clip end time in seconds")
	speed: float | None = Field(default=None, description="Playback speed multiplier")
	musicTracks: list[Any] = Field(default_factory=list, description="Background music tracks")
	combo_id: str | None = Field(
		default=None, description="Associated combo ID if linked to a combo"
	)
	flow_type: str | None = Field(default=None, description="Combo flow type if applicable")
	exercises: list[Any] = Field(default_factory=list, description="Referenced exercises in step")


class StepPatch(BaseSchema):
	label: str | None = Field(default=None, description="Step display label / title")
	durationSeconds: int | None = Field(
		default=None,
		validation_alias=AliasChoices("durationSeconds", "duration", "duration_seconds"),
		description="Timer duration in seconds",
	)
	targetDuration: int | None = Field(
		default=None,
		validation_alias=AliasChoices("targetDuration", "target_duration"),
		description="Execution target duration in seconds",
	)
	reps: int | None = Field(default=None, description="Repetition target if reps-based")
	targetReps: int | None = Field(
		default=None,
		validation_alias=AliasChoices("targetReps", "reps", "target_reps"),
		description="Execution target reps",
	)
	duration: int | None = Field(default=None, description="Shorthand for duration")
	mode: str | None = Field(default=None, description="Execution mode: time, reps, or break")
	stepMode: str | None = Field(
		default=None,
		validation_alias=AliasChoices("stepMode", "step_mode"),
		description="Execution mode: reps or time",
	)
	speed: float | None = Field(default=None, description="Playback speed multiplier")
	mediaUrl: str | None = Field(
		default=None,
		validation_alias=AliasChoices("mediaUrl", "media_url", "gifUrl", "gif_url"),
		description="Demonstration media URL",
	)
	exercise_id: str | None = Field(default=None, description="Associated exercise ID")
	isBreak: bool | None = Field(
		default=None,
		validation_alias=AliasChoices("isBreak", "is_break"),
		description="Break flag",
	)
	subtype: str | None = Field(default=None, description="Step subtype")


class StepReorder(BaseSchema):
	step_ids: list[str] = Field(..., description="Ordered list of step identifiers", min_length=1)


class RoutineUpsert(BaseSchema):
	id: str | None = Field(default=None, description="Routine ID (auto-generated if empty)")
	title: str = Field(default="Untitled Workout", description="Routine title")
	steps: list[RoutineStep | dict[str, Any]] = Field(
		default_factory=list, description="Ordered routine steps"
	)
	musicTracks: list[Any] = Field(
		default_factory=list,
		validation_alias=AliasChoices("musicTracks", "music_tracks"),
		description="Soundtrack / music items",
	)


class SessionUpsert(BaseSchema):
	id: str = Field(..., description="Session identifier", min_length=1)
	routine_id: str | None = Field(default=None, description="Referenced routine ID")
	routine_title: str | None = Field(default="Workout", description="Routine title snapshot")
	started_at: str | None = Field(default=None, description="ISO 8601 start timestamp")
	completed_at: str | None = Field(default=None, description="ISO 8601 completion timestamp")
	duration_seconds: int = Field(default=0, description="Total active duration in seconds")
	completed_steps: int = Field(default=0, description="Number of completed steps")
	total_steps: int = Field(default=0, description="Total steps in routine")
	status: str = Field(
		default="in_progress", description="Session status: in_progress, completed, abandoned"
	)
	is_preview: int | bool = Field(
		default=0, description="Whether this was a share preview session"
	)
	exercises: list[Any] = Field(
		default_factory=list, description="Exercise log / metrics snapshot"
	)
