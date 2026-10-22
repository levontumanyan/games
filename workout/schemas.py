from typing import Any, Literal

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
	laterality: str = Field(
		default="bilateral",
		description="Side coverage: bilateral (both sides together) or unilateral (one side at a time)",
	)


class ExerciseUpdate(BaseSchema):
	name: str | None = Field(default=None, description="Exercise name", min_length=1)
	category: str | None = Field(
		default=None, description="Category e.g. strength, cardio, technique, mobility, drill"
	)
	discipline: str | None = Field(
		default=None, description="Discipline e.g. general, boxing, muay_thai, kickboxing, bjj"
	)
	default_mode: str | None = Field(default=None, description="Execution mode: reps or time")
	default_quantity: int | None = Field(
		default=None, description="Default reps count or seconds duration"
	)
	description: str | None = Field(default=None, description="Instructional details or cue notes")
	media_url: str | None = Field(
		default=None, description="Primary demonstration video or image URL"
	)
	media_assets: list[MediaAsset | dict[str, Any]] | None = Field(
		default=None, description="Structured media assets"
	)
	primary_muscles: list[str] | None = Field(default=None, description="Targeted primary muscles")
	secondary_muscles: list[str] | None = Field(
		default=None, description="Targeted secondary muscles"
	)
	laterality: str | None = Field(
		default=None,
		description="Side coverage: bilateral (both sides together) or unilateral (one side at a time)",
	)


class ExerciseMediaAdd(BaseSchema):
	url: str = Field(..., description="Media resource URL", min_length=1)
	kind: str = Field(
		default="demonstration",
		description="Role of asset: demonstration (follow-along) or instruction (tutorial)",
	)
	type: str | None = Field(
		default=None, description="Media type: video or image (auto-detected if omitted)"
	)
	title: str | None = Field(default=None, description="Asset title or label")
	set_as_primary: bool = Field(
		default=True,
		description="Whether to also update exercise media_url with this URL",
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


class MusicTrack(BaseSchema):
	id: str = Field(..., description="Unique track identifier")
	source: str = Field(
		default="youtube",
		description="Audio source: youtube (video or playlist) or file (uploaded audio)",
	)
	label: str = Field(default="Music Track", description="Track display name or label")
	videoId: str | None = Field(
		default=None,
		validation_alias=AliasChoices("videoId", "video_id"),
		description="YouTube video ID if track is a single video",
	)
	playlistId: str | None = Field(
		default=None,
		validation_alias=AliasChoices("playlistId", "playlist_id"),
		description="YouTube playlist ID if track is a playlist or album",
	)
	isPlaylist: bool = Field(
		default=False,
		validation_alias=AliasChoices("isPlaylist", "is_playlist"),
		description="True if track is a YouTube playlist or album",
	)
	fileId: str | None = Field(
		default=None,
		validation_alias=AliasChoices("fileId", "file_id"),
		description="Uploaded audio file ID",
	)
	fileName: str | None = Field(
		default=None,
		validation_alias=AliasChoices("fileName", "file_name"),
		description="Original uploaded audio filename",
	)
	url: str | None = Field(
		default=None,
		description="Source URL (YouTube, YouTube Music, or direct audio link)",
	)


class MusicTrackAdd(BaseSchema):
	url: str | None = Field(
		default=None,
		description="Direct YouTube, YouTube Music, or audio URL (auto-parsed by backend if provided)",
	)
	source: str = Field(
		default="youtube",
		description="Audio source: youtube or file",
	)
	label: str | None = Field(
		default=None,
		description="Optional custom display title or label (falls back to playlist/track name)",
	)
	videoId: str | None = Field(
		default=None,
		validation_alias=AliasChoices("videoId", "video_id"),
		description="Optional YouTube video ID if known",
	)
	playlistId: str | None = Field(
		default=None,
		validation_alias=AliasChoices("playlistId", "playlist_id"),
		description="Optional YouTube playlist ID if known",
	)
	isPlaylist: bool | None = Field(
		default=None,
		validation_alias=AliasChoices("isPlaylist", "is_playlist"),
		description="Optional flag indicating whether target is a playlist",
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
	cue: str | None = Field(
		default=None,
		description="Optional concise step execution cue or note (e.g. 'Left Leg', 'Tempo 3s')",
	)
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
	musicTracks: list[MusicTrack | dict[str, Any]] = Field(
		default_factory=list, description="Background music tracks"
	)
	combo_id: str | None = Field(
		default=None, description="Associated combo ID if linked to a combo"
	)
	flow_type: str | None = Field(default=None, description="Combo flow type if applicable")
	exercises: list[Any] = Field(default_factory=list, description="Referenced exercises in step")


class StepPatch(BaseSchema):
	label: str | None = Field(default=None, description="Step display label / title")
	cue: str | None = Field(
		default=None,
		description="Optional concise step execution cue or note (e.g. 'Left Leg', 'Tempo 3s')",
	)
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
	musicTracks: list[MusicTrack | dict[str, Any]] = Field(
		default_factory=list,
		validation_alias=AliasChoices("musicTracks", "music_tracks"),
		description="Soundtrack / music items",
	)
	is_archived: bool = Field(
		default=False,
		validation_alias=AliasChoices("is_archived", "isArchived", "archived"),
		description="Whether the routine is archived",
	)


class RoutineArchiveUpdate(BaseSchema):
	is_archived: bool = Field(
		default=True,
		validation_alias=AliasChoices("is_archived", "isArchived", "archived"),
		description="Whether the routine is archived",
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


class ScheduledWorkoutCreate(BaseSchema):
	routine_id: str | None = Field(default=None, description="Optional referenced routine ID")
	routine_title: str = Field(
		default="Workout", description="Routine title or scheduled activity name"
	)
	scheduled_date: str = Field(
		..., description="Target date in ISO format YYYY-MM-DD", pattern=r"^\d{4}-\d{2}-\d{2}$"
	)
	scheduled_time: str | None = Field(default=None, description="Optional scheduled time HH:MM")
	status: Literal["scheduled", "completed", "skipped"] = Field(
		default="scheduled", description="Status: scheduled, completed, skipped"
	)
	notes: str = Field(default="", description="Optional workout cues or schedule notes")


class ScheduledWorkoutUpdate(BaseSchema):
	routine_id: str | None = Field(default=None, description="Updated routine ID")
	routine_title: str | None = Field(default=None, description="Updated routine title")
	scheduled_date: str | None = Field(
		default=None, description="Updated target date YYYY-MM-DD", pattern=r"^\d{4}-\d{2}-\d{2}$"
	)
	scheduled_time: str | None = Field(default=None, description="Updated target time HH:MM")
	status: Literal["scheduled", "completed", "skipped"] | None = Field(
		default=None, description="Status: scheduled, completed, skipped"
	)
	notes: str | None = Field(default=None, description="Updated schedule notes")
	session_id: str | None = Field(default=None, description="Linked session ID if completed")


class ScheduledWorkoutOut(BaseSchema):
	id: str = Field(..., description="Unique schedule entry identifier")
	user_id: str = Field(..., description="Owner user ID")
	routine_id: str | None = Field(default=None, description="Referenced routine ID")
	routine_title: str = Field(..., description="Routine title")
	scheduled_date: str = Field(..., description="Target date YYYY-MM-DD")
	scheduled_time: str | None = Field(default=None, description="Target time HH:MM")
	status: str = Field(default="scheduled", description="Status: scheduled, completed, skipped")
	session_id: str | None = Field(default=None, description="Linked session ID")
	notes: str = Field(default="", description="Schedule notes")
	created_at: str = Field(..., description="ISO creation timestamp")
