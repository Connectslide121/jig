/**
 * The sound of a video (M2, D-456): HyperFrames renders the picture; FFmpeg then lays each scene's
 * voice at its time, loops the music under it with fades, ducks the music while the voice speaks
 * and copies the picture as it is. Pure: the arguments only.
 */

export interface VoiceClip {
  path: string;
  /** Seconds into the video. */
  at: number;
}

export interface MixInput {
  video: string;
  out: string;
  seconds: number;
  voices: VoiceClip[];
  music?: { path: string; volume: number };
}

const n3 = (n: number) => String(Math.round(n * 1000) / 1000);

/** FFmpeg's arguments, or undefined when there is nothing to add. */
export function mixArgs(input: MixInput): string[] | undefined {
  const voices = input.voices.filter((v) => v.at < input.seconds);
  const music = input.music && input.music.volume > 0 ? input.music : undefined;
  if (!voices.length && !music) return undefined;
  const T = input.seconds;
  const args = ["-nostdin", "-v", "error", "-y", "-i", input.video];
  for (const v of voices) args.push("-i", v.path);
  // Looped with `aloop`, not `-stream_loop`: FFmpeg 6 hangs at the end with a looped MP3 input.
  if (music) args.push("-i", music.path);
  const graph: string[] = [];
  voices.forEach((v, i) => {
    const delay = Math.max(0, Math.round(v.at * 1000));
    graph.push(
      `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${delay}|${delay}[v${i}]`,
    );
  });
  if (voices.length)
    graph.push(
      voices.length === 1
        ? `[v0]apad,atrim=0:${n3(T)}[voice]`
        : `${voices.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voices.length}:duration=longest:normalize=0,apad,atrim=0:${n3(T)}[voice]`,
    );
  if (music) {
    const m = voices.length + 1;
    const fadeOut = Math.min(2, T / 4);
    graph.push(
      `[${m}:a]aformat=sample_rates=48000:channel_layouts=stereo,aloop=loop=-1:size=2147483647,atrim=0:${n3(T)},asetpts=PTS-STARTPTS,volume=${n3(music.volume)},afade=t=in:d=${n3(Math.min(1, T / 4))},afade=t=out:st=${n3(T - fadeOut)}:d=${n3(fadeOut)}[music]`,
    );
    if (voices.length) {
      graph.push("[voice]asplit=2[vkey][vmix]");
      graph.push("[music][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[ducked]");
      graph.push("[ducked][vmix]amix=inputs=2:duration=first:normalize=0[a]");
    } else graph.push("[music]anull[a]");
  } else graph.push("[voice]anull[a]");
  args.push(
    "-filter_complex",
    graph.join(";"),
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    n3(T),
    "-movflags",
    "+faststart",
    input.out,
  );
  return args;
}
