import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// Allow piping to `head`/`sed` without crashing on EPIPE.
// (When the pipe closes early, Node may emit an 'error' on stdout/stderr.)
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
});
process.stderr.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
});

type IstanbulFileCov = {
  path?: string;
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  s: Record<string, number>;
  branchMap?: Record<
    string,
    { locations: Array<{ start: { line: number }; end: { line: number } }> }
  >;
  b?: Record<string, number[]>;
  fnMap?: Record<string, { loc: { start: { line: number }; end: { line: number } } }>;
  f?: Record<string, number>;
};

type IstanbulCoverage = Record<string, IstanbulFileCov>;

type FileStats = {
  file: string; // repo-relative
  changedLines: number;
  executableChanged: number;
  coveredChanged: number;
  uncoveredChanged: number;
  uncoveredLines: number[];
  coverageMissing: boolean;
};

const repoRoot = process.cwd();
const coverageReportsDirectory = process.env.ZINTRUST_COVERAGE_REPORTS_DIR?.trim();

const resolveCoveragePath = (): string => {
  if (!coverageReportsDirectory) {
    return path.join(repoRoot, 'coverage', 'coverage-final.json');
  }

  const reportsDirectory = path.isAbsolute(coverageReportsDirectory)
    ? coverageReportsDirectory
    : path.join(repoRoot, coverageReportsDirectory);

  return path.join(reportsDirectory, 'coverage-final.json');
};

const normalizeRel = (p: string): string => {
  const rel = path.isAbsolute(p) ? path.relative(repoRoot, p) : p;
  return rel.split(path.sep).join('/');
};

const isCoverageExcluded = (fileRel: string): boolean => {
  // Keep this aligned with vitest.config.ts `test.coverage.exclude`.
  // This tool treats missing coverage as uncovered to approximate patch coverage,
  // but excluded files should not be counted.
  if (fileRel.endsWith('.d.ts')) return true;
  if (fileRel.endsWith('/index.ts')) return true;
  if (fileRel.endsWith('/types.ts')) return true;
  if (fileRel.startsWith('src/scripts/')) return true;
  if (fileRel.startsWith('src/features/')) return true;
  if (fileRel.startsWith('src/node-singletons/')) return true;
  if (fileRel === 'src/runtime/WorkersModule.ts') return true;
  if (fileRel === 'src/tools/mail/template-loader.ts') return true;
  if (fileRel === 'src/routes/errorPages.ts') return true;
  if (fileRel.startsWith('app/') && fileRel.endsWith('.d.ts')) return true;
  if (fileRel.startsWith('routes/') && fileRel.endsWith('.d.ts')) return true;
  return false;
};

const parseHunkNewStart = (line: string): number | undefined => {
  // @@ -oldStart,oldCount +newStart,newCount @@
  const m = /^@@ .* \+(\d+)(?:,(\d+))? @@/.exec(line); // NOSONAR
  if (!m) return undefined;
  return Number.parseInt(m[1], 10);
};

const loadCoverage = (coveragePath: string): IstanbulCoverage => {
  const raw = fs.readFileSync(coveragePath, 'utf8');
  return JSON.parse(raw) as IstanbulCoverage;
};

const buildCoverageIndex = (cov: IstanbulCoverage): Map<string, IstanbulFileCov> => {
  const index = new Map<string, IstanbulFileCov>();
  for (const [key, value] of Object.entries(cov)) {
    const rel = normalizeRel(value.path ?? key);
    index.set(rel, value);
  }
  return index;
};

const addRange = (set: Set<number>, start: number, end: number): void => {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  for (let i = from; i <= to; i += 1) set.add(i);
};

const addLoc = (
  set: Set<number>,
  loc: { start: { line: number }; end: { line: number } },
  mode: 'start-only' | 'range'
): void => {
  if (mode === 'range') {
    addRange(set, loc.start.line, loc.end.line);
    return;
  }
  set.add(loc.start.line);
};

const processStatementMap = (
  statementMap: IstanbulFileCov['statementMap'],
  sMap: IstanbulFileCov['s'],
  executable: Set<number>,
  covered: Set<number>,
  mode: 'start-only' | 'range'
): void => {
  for (const [id, loc] of Object.entries(statementMap ?? {})) {
    addLoc(executable, loc, mode);
    if ((sMap?.[id] ?? 0) > 0) addLoc(covered, loc, mode);
  }
};

const processBranchMap = (
  branchMap: IstanbulFileCov['branchMap'],
  bMap: IstanbulFileCov['b'],
  executable: Set<number>,
  covered: Set<number>,
  mode: 'start-only' | 'range'
): void => {
  if (!branchMap || !bMap) return;
  for (const [id, branch] of Object.entries(branchMap)) {
    const counts = bMap[id] ?? [];
    const locs = branch.locations ?? [];
    for (let i = 0; i < locs.length; i += 1) {
      const loc = locs[i];
      addLoc(executable, loc, mode);
      if ((counts[i] ?? 0) > 0) addLoc(covered, loc, mode);
    }
  }
};

const processFnMap = (
  fnMap: IstanbulFileCov['fnMap'],
  fMap: IstanbulFileCov['f'],
  executable: Set<number>,
  covered: Set<number>,
  mode: 'start-only' | 'range'
): void => {
  if (!fnMap || !fMap) return;
  for (const [id, fn] of Object.entries(fnMap)) {
    addLoc(executable, fn.loc, mode);
    if ((fMap[id] ?? 0) > 0) addLoc(covered, fn.loc, mode);
  }
};

const computeCoveredLines = (
  fileCov: IstanbulFileCov,
  mode: 'start-only' | 'range'
): { executable: Set<number>; covered: Set<number> } => {
  const executable = new Set<number>();
  const covered = new Set<number>();

  processStatementMap(fileCov.statementMap, fileCov.s, executable, covered, mode);
  processBranchMap(fileCov.branchMap, fileCov.b, executable, covered, mode);
  processFnMap(fileCov.fnMap, fileCov.f, executable, covered, mode);

  return { executable, covered };
};

const readLineText = (fileRel: string, line: number): string => {
  try {
    const abs = path.join(repoRoot, fileRel);
    const content = fs.readFileSync(abs, 'utf8');
    const lines = content.split(/\r?\n/);
    return (lines[line - 1] ?? '').trimEnd();
  } catch {
    return '';
  }
};

const collectChangedLines = async (
  baseRef: string,
  headRef: string
): Promise<Map<string, Set<number>>> => {
  const range = `${baseRef}...${headRef}`;
  const args = ['diff', '-U0', range, '--', 'src', 'app', 'routes'];

  const child = spawn('git', args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (!child.stdout) {
    throw new Error('git diff spawned without a stdout stream');
  }
  const rl = readline.createInterface({ input: child.stdout });

  const changed = new Map<string, Set<number>>();

  let currentFile: string | undefined;
  let newLine = 0;

  rl.on('line', (line) => {
    if (line.startsWith('+++ ')) {
      // +++ b/path OR +++ /dev/null
      if (line.includes('/dev/null')) {
        currentFile = undefined;
        return;
      }
      const m = /^\+\+\+\s+b\/(.*)$/.exec(line);
      if (!m) {
        currentFile = undefined;
        return;
      }
      const next = m[1];
      // Patch coverage should reflect executable source, not templates or docs.
      // Limit to TS source files so `.ts.tpl`, `.md`, etc don't skew results.
      if (next.endsWith('.ts') || next.endsWith('.tsx')) {
        currentFile = next;
      } else {
        currentFile = undefined;
      }
      return;
    }

    if (line.startsWith('@@')) {
      const start = parseHunkNewStart(line);
      if (start !== undefined) newLine = start;
      return;
    }

    if (!currentFile) return;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const rel = normalizeRel(currentFile);
      const set = changed.get(rel) ?? new Set<number>();
      set.add(newLine);
      changed.set(rel, set);
      newLine += 1;
      return;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      // deletion: does not advance newLine
      return;
    }

    if (line.startsWith(' ')) {
      // context line (should be rare with -U0)
      newLine += 1;
    }
  });

  await new Promise<void>((resolve, reject) => {
    child.on('error', (err) => {
      rl.close();
      reject(err);
    });
    child.on('close', (code) => {
      rl.close();
      if (code === 0) resolve();
      else reject(new Error(`git diff exited with code ${code}`));
    });
  });

  return changed;
};

const main = async (): Promise<void> => {
  const baseRef = process.argv[2] ?? 'master';
  const headRef = process.argv[3] ?? 'HEAD';
  const treatMissingAsUncovered = process.argv.includes('--treat-missing-as-uncovered');
  const coverageMode: 'start-only' | 'range' = process.argv.includes('--cover-by-range')
    ? 'range'
    : 'start-only';

  const minPctArg = process.argv.find((a) => a.startsWith('--min-pct='));
  const minPct = minPctArg ? Number.parseFloat(minPctArg.split('=')[1] ?? '') : undefined;
  const failOnUncovered = process.argv.includes('--fail-on-uncovered');

  if (minPct !== undefined && !Number.isFinite(minPct)) {
    console.error(`Invalid --min-pct value: ${minPctArg}`);
    process.exitCode = 2;
    return;
  }

  const coveragePath = resolveCoveragePath();
  if (!fs.existsSync(coveragePath)) {
    console.error(`Missing coverage file: ${coveragePath}`);
    process.exitCode = 2;
    return;
  }

  const cov = loadCoverage(coveragePath);
  const covIndex = buildCoverageIndex(cov);

  const changed = await collectChangedLines(baseRef, headRef);

  const stats: FileStats[] = [];

  for (const [file, lines] of changed.entries()) {
    const fileCov = covIndex.get(file);
    if (!fileCov) {
      const excluded = isCoverageExcluded(file);
      stats.push({
        file,
        changedLines: lines.size,
        executableChanged: treatMissingAsUncovered && !excluded ? lines.size : 0,
        coveredChanged: 0,
        uncoveredChanged: treatMissingAsUncovered && !excluded ? lines.size : 0,
        uncoveredLines:
          treatMissingAsUncovered && !excluded ? Array.from(lines).sort((a, b) => a - b) : [],
        coverageMissing: !excluded,
      });
      continue;
    }

    const { executable, covered } = computeCoveredLines(fileCov, coverageMode);

    let executableChanged = 0;
    let coveredChanged = 0;
    const uncoveredLines: number[] = [];

    for (const line of lines) {
      if (!executable.has(line)) continue;
      executableChanged += 1;
      if (covered.has(line)) {
        coveredChanged += 1;
      } else {
        uncoveredLines.push(line);
      }
    }

    uncoveredLines.sort((a, b) => a - b);

    stats.push({
      file,
      changedLines: lines.size,
      executableChanged,
      coveredChanged,
      uncoveredChanged: uncoveredLines.length,
      uncoveredLines,
      coverageMissing: false,
    });
  }

  const relevantKnown = stats.filter((s) => !s.coverageMissing && s.executableChanged > 0);
  const totalExecutableKnown = relevantKnown.reduce((acc, s) => acc + s.executableChanged, 0);
  const totalCoveredKnown = relevantKnown.reduce((acc, s) => acc + s.coveredChanged, 0);
  const pctKnown =
    totalExecutableKnown === 0 ? 100 : (totalCoveredKnown / totalExecutableKnown) * 100;

  console.log(
    `\nDiff executable line hit rate (known coverage only, approx): ${pctKnown.toFixed(2)}% (${totalCoveredKnown}/${totalExecutableKnown})`
  );

  let pctToCheck = pctKnown;
  let totalExecutableToCheck = totalExecutableKnown;
  let totalCoveredToCheck = totalCoveredKnown;

  if (treatMissingAsUncovered) {
    const relevantAll = stats.filter((s) => s.executableChanged > 0);
    const totalExecutableAll = relevantAll.reduce((acc, s) => acc + s.executableChanged, 0);
    const totalCoveredAll = relevantAll.reduce((acc, s) => acc + s.coveredChanged, 0);
    const pctAll = totalExecutableAll === 0 ? 100 : (totalCoveredAll / totalExecutableAll) * 100;
    console.log(
      `Diff line hit rate (including missing coverage as uncovered): ${pctAll.toFixed(2)}% (${totalCoveredAll}/${totalExecutableAll})`
    );

    pctToCheck = pctAll;
    totalExecutableToCheck = totalExecutableAll;
    totalCoveredToCheck = totalCoveredAll;
  } else {
    console.log(
      'Tip: re-run with --treat-missing-as-uncovered to approximate Codecov patch behavior when coverage excludes files.'
    );
  }

  const totalUncoveredChanged = stats
    .filter((s) => s.executableChanged > 0)
    .reduce((acc, s) => acc + s.uncoveredChanged, 0);

  if (minPct !== undefined && pctToCheck + 1e-9 < minPct) {
    console.error(
      `\n❌ Patch coverage gate failed: ${pctToCheck.toFixed(2)}% (${totalCoveredToCheck}/${totalExecutableToCheck}) < ${minPct.toFixed(2)}%`
    );
    process.exitCode = 1;
  }

  if (failOnUncovered && totalUncoveredChanged > 0) {
    console.error(
      `\n❌ Patch coverage gate failed: ${totalUncoveredChanged} uncovered changed executable line(s)`
    );
    process.exitCode = 1;
  }

  const relevantForWorst = stats.filter((s) => s.executableChanged > 0);
  const worst = relevantForWorst
    .filter((s) => s.uncoveredChanged > 0)
    .sort((a, b) => b.uncoveredChanged - a.uncoveredChanged)
    .slice(0, 15);

  if (worst.length === 0) {
    console.log('No uncovered executable changed lines detected (within src/app/routes).');
    return;
  }

  console.log('\nTop files with uncovered changed lines:');
  for (const s of worst) {
    const filePct =
      s.executableChanged === 0 ? 100 : (s.coveredChanged / s.executableChanged) * 100;
    console.log(
      `- ${s.file}: ${filePct.toFixed(2)}% (${s.coveredChanged}/${s.executableChanged}) uncovered=${s.uncoveredChanged}`
    );
  }

  console.log('\nUncovered changed lines (first 20 per file):');
  for (const s of worst) {
    console.log(`\n${s.file}`);
    for (const line of s.uncoveredLines.slice(0, 20)) {
      const text = readLineText(s.file, line);
      console.log(`  L${line}: ${text}`);
    }
    if (s.uncoveredLines.length > 20) {
      console.log(`  ... (${s.uncoveredLines.length - 20} more)`);
    }
  }

  const missingCov = stats.filter((s) => s.coverageMissing && s.executableChanged > 0);
  if (missingCov.length > 0) {
    console.log(
      `\nFiles changed under src/app/routes with no coverage entry: ${missingCov.length}`
    );
    console.log('These are usually excluded from coverage or not picked up by the reporter.');
    for (const s of missingCov.slice(0, 20)) console.log(`- ${s.file}`);
    if (missingCov.length > 20) console.log(`... (${missingCov.length - 20} more)`);
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
