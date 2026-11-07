/**
 * What Motion downloads, from where, and how it checks it (D-454, D-463). Nothing is downloaded
 * without the install modal; every file is checked against the checksum pinned here before use.
 */

export const RENDERER = {
  name: "HyperFrames",
  package: "hyperframes",
  version: "0.9.19",
  /** npm's own integrity for the tarball (npm checks it on install). */
  integrity:
    "sha512-/3j1j+dFok7SQKKEljvyHOfn1GlRpgPnDLFeUWVZ7+s8ySsvNN6SLUT+dyzct7GSgzjZXJFZryoHGkhx7kCxTg==",
  licence: "Apache-2.0",
  source: "https://www.npmjs.com/package/hyperframes",
  /** About 24 MB, plus the headless Chrome it fetches (about 150 MB). */
  approxMb: 175,
  /** Node.js the renderer needs (it runs with your `node`). */
  node: 22,
} as const;

export interface FfmpegAsset {
  tool: "ffmpeg" | "ffprobe";
  url: string;
  sha256: string;
  bytes: number;
}

const BASE = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0";

/** FFmpeg 6.0 static builds (GPL; downloaded on request, never bundled), gzipped single files. */
export const FFMPEG_BUILDS: Record<string, FfmpegAsset[]> = {
  "win32-x64": [
    {
      tool: "ffmpeg",
      url: `${BASE}/ffmpeg-win32-x64.gz`,
      sha256: "450d66226c79405c724e821f291cab0911e934bfa9fa2231adcab587f3e07b50",
      bytes: 28894894,
    },
    {
      tool: "ffprobe",
      url: `${BASE}/ffprobe-win32-x64.gz`,
      sha256: "3f33adbad509f324e6f72449a5e8428fd655fb2b2eebf1d782c7ef23c44eed6a",
      bytes: 28830399,
    },
  ],
  "linux-x64": [
    {
      tool: "ffmpeg",
      url: `${BASE}/ffmpeg-linux-x64.gz`,
      sha256: "17c1ae10b52ac499180679fe6ba77e17642390c4eedb0f1e3b0ac045da55128f",
      bytes: 28928723,
    },
    {
      tool: "ffprobe",
      url: `${BASE}/ffprobe-linux-x64.gz`,
      sha256: "88ca6818d82a70e87de2bb6166026ad411528c72eda0e4e11ed25d185116ee17",
      bytes: 28861806,
    },
  ],
  "darwin-x64": [
    {
      tool: "ffmpeg",
      url: `${BASE}/ffmpeg-darwin-x64.gz`,
      sha256: "a12354fce7eb62361473bbe10d53a1893695babd35869ec8e92e5dfea8d0440b",
      bytes: 25067704,
    },
    {
      tool: "ffprobe",
      url: `${BASE}/ffprobe-darwin-x64.gz`,
      sha256: "b75d816c5658bd417a2a05e174957963e2f9f85be3eb731b2a04467545a665dc",
      bytes: 25015394,
    },
  ],
  "darwin-arm64": [
    {
      tool: "ffmpeg",
      url: `${BASE}/ffmpeg-darwin-arm64.gz`,
      sha256: "6be74d6f449889c2e87a75873894f8520cad56c08ac76f2a628d85b0519daaca",
      bytes: 19253088,
    },
    {
      tool: "ffprobe",
      url: `${BASE}/ffprobe-darwin-arm64.gz`,
      sha256: "a4db76bafdb8529312e138fb55aaf143cad21b6d672e2634c9dd07ae83c6a310",
      bytes: 19216948,
    },
  ],
};

export const FFMPEG_LICENCE = "GPL-3.0 (FFmpeg static builds by ffmpeg-static, b6.0)";

export function ffmpegAssets(platform: string, arch: string): FfmpegAsset[] | undefined {
  return FFMPEG_BUILDS[`${platform}-${arch}`];
}

/** The executable's file name on this platform. */
export function exe(tool: string, platform: string): string {
  return platform === "win32" ? `${tool}.exe` : tool;
}

/** Where to look for a tool: the setting first (a file or its folder), then every PATH folder. */
export function candidates(
  tool: "ffmpeg" | "ffprobe",
  setting: string,
  pathEnv: string,
  platform: string,
): string[] {
  const sep = platform === "win32" ? ";" : ":";
  const slash = platform === "win32" ? "\\" : "/";
  const name = exe(tool, platform);
  const out: string[] = [];
  const s = setting.trim();
  if (s) {
    const base = s.replace(/[\\/]+$/, "");
    const file = base.split(/[\\/]/).pop() ?? "";
    // A setting that names ffmpeg itself: ffprobe is beside it.
    if (/^ffmpeg(\.exe)?$/i.test(file))
      out.push(tool === "ffmpeg" ? base : base.slice(0, -file.length) + name);
    else out.push(`${base}${slash}${name}`);
  }
  for (const dir of pathEnv.split(sep))
    if (dir.trim()) out.push(`${dir.replace(/[\\/]+$/, "")}${slash}${name}`);
  return [...new Set(out)];
}

/** `{ major }` from `node --version` output, e.g. "v22.3.0". */
export function nodeMajor(output: string): number | undefined {
  const m = output.trim().match(/^v?(\d+)\./);
  return m ? Number(m[1]) : undefined;
}

/** Progress 0–1 from a line of the renderer's output: "frame 120/450", "45%". */
export function parseProgress(line: string): number | undefined {
  const frames = line.match(/(\d+)\s*\/\s*(\d+)\s*(?:frames?)?/i);
  if (frames && /frame|render|captur|encod/i.test(line)) {
    const [done, total] = [Number(frames[1]), Number(frames[2])];
    if (total > 0 && done <= total) return done / total;
  }
  const pct = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (pct) {
    const v = Number(pct[1]);
    if (v >= 0 && v <= 100) return v / 100;
  }
  return undefined;
}
