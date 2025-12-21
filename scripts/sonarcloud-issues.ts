#!/usr/bin/env tsx
/**
 * SonarCloud Issues Downloader
 * Fetch and analyze issues from SonarCloud Web API
 */

import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';

interface SonarCloudIssue {
  key: string;
  rule: string;
  severity: string;
  component: string;
  project: string;
  line?: number;
  hash: string;
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  flows: unknown[];
  status: string;
  message: string;
  effort?: string;
  debt?: string;
  author?: string;
  tags: string[];
  creationDate: string;
  updateDate: string;
  type: string;
  organization: string;
  cleanCodeAttribute?: string;
  cleanCodeAttributeCategory?: string;
  impacts?: Array<{
    softwareQuality: string;
    severity: string;
  }>;
}

interface SonarCloudResponse {
  total: number;
  p: number;
  ps: number;
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
  issues: SonarCloudIssue[];
  components: unknown[];
  facets: unknown[];
}

interface QueryParams {
  componentKeys?: string;
  impactSeverities?: string;
  issueStatuses?: string;
  types?: string;
  severities?: string;
  resolved?: string;
  p?: number;
  ps?: number;
}

class SonarCloudClient {
  private readonly organization: string;
  private readonly projectKey: string;
  private readonly token?: string;
  private readonly baseUrl = 'sonarcloud.io';

  constructor(organization: string, projectKey: string, token?: string) {
    this.organization = organization;
    this.projectKey = projectKey;
    this.token = token;
  }

  /**
   * Fetch issues from SonarCloud
   */
  public async fetchIssues(params: QueryParams = {}): Promise<SonarCloudResponse> {
    const defaultParams: QueryParams = {
      componentKeys: this.projectKey,
      ps: 500, // Max page size
      p: 1,
    };

    const queryParams = { ...defaultParams, ...params };
    const queryString = this.buildQueryString(queryParams);

    const options = {
      hostname: this.baseUrl,
      path: `/api/issues/search?${queryString}`,
      method: 'GET',
      headers: this.token
        ? {
            Authorization: `Bearer ${this.token}`,
          }
        : {},
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data) as SonarCloudResponse);
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * Fetch all issues (handle pagination)
   */
  public async fetchAllIssues(params: QueryParams = {}): Promise<SonarCloudIssue[]> {
    const allIssues: SonarCloudIssue[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchIssues({ ...params, p: page });
      allIssues.push(...response.issues);
      const totalPages = Math.ceil(response.paging.total / response.paging.pageSize);
      hasMore = page < totalPages;
      page++;

      console.log(
        `Fetched page ${page - 1}/${totalPages} (${allIssues.length}/${response.paging.total} issues)`
      );
    }

    return allIssues;
  }

  /**
   * Build query string from parameters
   */
  private buildQueryString(params: QueryParams): string {
    return Object.entries(params)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
  }

  /**
   * Get project measures (quality gate, coverage, etc.)
   */
  public async fetchMeasures(metricKeys: string[]): Promise<unknown> {
    const queryString = `component=${encodeURIComponent(this.projectKey)}&metricKeys=${metricKeys.join(',')}`;

    const options = {
      hostname: this.baseUrl,
      path: `/api/measures/component?${queryString}`,
      method: 'GET',
      headers: this.token
        ? {
            Authorization: `Bearer ${this.token}`,
          }
        : {},
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }
}

/**
 * Strip quotes from value if present
 */
function stripQuotes(value: string): string {
  if (value.length < 2) return value;

  const firstChar = value[0];
  const lastChar = value[value.length - 1];
  const isDoubleQuoted = firstChar === '"' && lastChar === '"';
  const isSingleQuoted = firstChar === "'" && lastChar === "'";

  if (isDoubleQuoted || isSingleQuoted) {
    return value.slice(1, -1);
  }

  return value;
}

/**
 * Parse a single line from .env file
 */
function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmedLine = line.trim();
  if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) return null;

  const eqIndex = trimmedLine.indexOf('=');
  if (eqIndex === -1) return null;

  const key = trimmedLine.slice(0, eqIndex).trim();
  if (key.length === 0) return null;

  const valueRaw = trimmedLine.slice(eqIndex + 1).trim();
  return { key, value: stripQuotes(valueRaw) };
}

/**
 * Load environment variables from .env file
 */
function loadEnv(): void {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const result = parseEnvLine(line);
      if (result) {
        process.env[result.key] = result.value;
      }
    }
  } catch {
    // Ignore errors loading .env
  }
}

/**
 * Get code snippet from local file
 */
function getCodeSnippet(filePath: string, line?: number): string {
  if (!line) return '';
  try {
    // SonarCloud component is usually project:path/to/file.ts
    const relativePath = filePath.includes(':') ? filePath.split(':').pop()! : filePath;
    const absolutePath = path.join(process.cwd(), relativePath);

    if (fs.existsSync(absolutePath)) {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, line - 3);
      const end = Math.min(lines.length, line + 2);

      let snippet = '  Code:\n';
      for (let i = start; i < end; i++) {
        const lineNumber = i + 1;
        const prefix = lineNumber === line ? '    > ' : '      ';
        snippet += `${prefix}${lineNumber} | ${lines[i]}\n`;
      }
      return snippet;
    }
  } catch {
    // Ignore errors reading file
  }
  return '';
}

/**
 * Generate issue report
 */
/**
 * Group issues by type, severity, and file
 */
function groupIssues(issues: SonarCloudIssue[]): {
  byType: Map<string, SonarCloudIssue[]>;
  bySeverity: Map<string, SonarCloudIssue[]>;
  byFile: Map<string, SonarCloudIssue[]>;
} {
  const byType = new Map<string, SonarCloudIssue[]>();
  const bySeverity = new Map<string, SonarCloudIssue[]>();
  const byFile = new Map<string, SonarCloudIssue[]>();

  for (const issue of issues) {
    // Group by type
    if (!byType.has(issue.type)) {
      byType.set(issue.type, []);
    }
    byType.get(issue.type)?.push(issue);

    // Group by severity
    const severity = issue.impacts?.[0]?.severity || issue.severity;
    if (!bySeverity.has(severity)) {
      bySeverity.set(severity, []);
    }
    bySeverity.get(severity)?.push(issue);

    // Group by file
    const file = issue.component.split(':').pop() || 'unknown';
    if (!byFile.has(file)) {
      byFile.set(file, []);
    }
    byFile.get(file)?.push(issue);
  }

  return { byType, bySeverity, byFile };
}

/**
 * Build type summary section
 */
function buildTypeSummary(groupedByType: Map<string, SonarCloudIssue[]>): string {
  let report = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += 'ISSUES BY TYPE\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const [type, typeIssues] of Array.from(groupedByType.entries()).sort(
    (a, b) => b[1].length - a[1].length
  )) {
    report += `${type}: ${typeIssues.length}\n`;
  }

  return report + '\n';
}

/**
 * Build severity summary section
 */
function buildSeveritySummary(groupedBySeverity: Map<string, SonarCloudIssue[]>): string {
  let report = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += 'ISSUES BY SEVERITY\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  const severityOrder = ['BLOCKER', 'CRITICAL', 'HIGH', 'MAJOR', 'MEDIUM', 'MINOR', 'LOW', 'INFO'];
  for (const severity of severityOrder) {
    if (groupedBySeverity.has(severity)) {
      const severityIssues = groupedBySeverity.get(severity)!;
      report += `${severity}: ${severityIssues.length}\n`;
    }
  }

  return report + '\n';
}

/**
 * Build top files section
 */
function buildTopFilesSummary(groupedByFile: Map<string, SonarCloudIssue[]>): string {
  let report = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += 'TOP 10 FILES WITH MOST ISSUES\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  const topFiles = Array.from(groupedByFile.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  for (const [file, fileIssues] of topFiles) {
    report += `${file}: ${fileIssues.length} issues\n`;
  }

  return report + '\n';
}

/**
 * Format single issue details
 */
function formatIssueDetails(issue: SonarCloudIssue): string {
  const file = issue.component.split(':').pop() || 'unknown';
  const line = issue.line || 0;
  const severity = issue.impacts?.[0]?.severity || issue.severity;

  let details = `[${severity}] ${file}:${line || '?'}\n`;
  details += `  Rule: ${issue.rule}\n`;
  details += `  Message: ${issue.message}\n`;
  details += `  Status: ${issue.status}\n`;

  if (issue.cleanCodeAttribute) {
    details += `  Attribute: ${issue.cleanCodeAttribute} (${issue.cleanCodeAttributeCategory})\n`;
  }

  if (issue.impacts && issue.impacts.length > 0) {
    const impacts = issue.impacts.map((i) => `${i.softwareQuality}: ${i.severity}`).join(', ');
    details += `  Impacts: ${impacts}\n`;
  }

  if (line > 0) {
    const snippet = getCodeSnippet(issue.component, line);
    if (snippet) {
      details += snippet;
    }
  }

  return details + '\n';
}

/**
 * Build detailed issues section
 */
function buildDetailedIssues(issues: SonarCloudIssue[]): string {
  let report = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += 'DETAILED ISSUES\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const issue of issues) {
    report += formatIssueDetails(issue);
  }

  return report;
}

function generateReport(issues: SonarCloudIssue[]): string {
  const { byType, bySeverity, byFile } = groupIssues(issues);

  let report = '╔════════════════════════════════════════════════════════════════╗\n';
  report += '║                SONARCLOUD ISSUES REPORT                        ║\n';
  report += `║                ${new Date().toISOString()}                ║\n`;
  report += '╚════════════════════════════════════════════════════════════════╝\n\n';

  report += `Total Issues: ${issues.length}\n\n`;

  report += buildTypeSummary(byType);
  report += buildSeveritySummary(bySeverity);
  report += buildTopFilesSummary(byFile);
  report += buildDetailedIssues(issues);

  return report;
}

/**
 * Parse command line arguments to query parameters
 */
function parseArguments(args: string[]): QueryParams {
  const params: QueryParams = {};

  // Map common arguments to parameters
  const argMap: Record<string, [string, string]> = {
    '--low': ['impactSeverities', 'LOW'],
    '--medium': ['impactSeverities', 'MEDIUM'],
    '--high': ['impactSeverities', 'HIGH'],
    '--open': ['issueStatuses', 'OPEN,CONFIRMED'],
    '--resolved': ['resolved', 'true'],
    '--all-statuses': ['issueStatuses', 'OPEN,CONFIRMED,FALSE_POSITIVE,ACCEPTED,FIXED'],
  };

  for (const [arg, [key, value]] of Object.entries(argMap)) {
    if (args.includes(arg)) {
      (params as any)[key] = value;
    }
  }

  // Allow passing any parameter via --key=value
  for (const arg of args) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split('=');
      (params as any)[key] = value;
    }
  }

  return params;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  const organization = process.env['SONAR_ORGANIZATION'] || 'ZinTrust_ZinTrust';
  const projectKey = process.env['SONAR_PROJECT_KEY'] || 'ZinTrust_ZinTrust';
  const token = process.env['SONAR_TOKEN'];

  console.log('🔍 SonarCloud Issues Downloader');
  console.log(`Organization: ${organization}`);
  console.log(`Project: ${projectKey}`);
  console.log(`Token: ${token ? '✓ Provided' : '✗ Not provided'}\n`);

  const client = new SonarCloudClient(organization, projectKey, token);

  try {
    const params = parseArguments(args);

    console.log('Fetching issues from SonarCloud...\n');

    let issues = await client.fetchAllIssues(params);

    // Filter out ignored paths (docs-website is excluded from scanning)
    issues = filterIgnoredPaths(issues);

    const originalCount = issues.length;
    if (originalCount > 0) {
      console.log(`\n✓ Fetched ${originalCount} issues\n`);
    } else {
      console.log('\n✓ No issues fetched\n');
    }

    // Generate and save reports
    await saveReports(issues);

    // Optionally fetch quality measures
    if (args.includes('--measures')) {
      await fetchAndSaveMeasures(client);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Filter out ignored paths from issues
 */
function filterIgnoredPaths(issues: SonarCloudIssue[]): SonarCloudIssue[] {
  const ignoredPaths = ['docs-website/'];
  return issues.filter((issue) => {
    const file = issue.component.split(':').pop() || '';
    return !ignoredPaths.some((path) => file.startsWith(path));
  });
}

/**
 * Save report and JSON files
 */
async function saveReports(issues: SonarCloudIssue[]): Promise<void> {
  const report = generateReport(issues);
  const outputDir = path.join(process.cwd(), 'reports');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const reportFile = path.join(outputDir, 'sonarcloud-issues.txt');
  const jsonFile = path.join(outputDir, 'sonarcloud-issues.json');

  fs.writeFileSync(reportFile, report);
  fs.writeFileSync(jsonFile, JSON.stringify(issues, null, 2));

  console.log(report);
  console.log(`\n✓ Report saved to: ${reportFile}`);
  console.log(`✓ JSON data saved to: ${jsonFile}`);
}

/**
 * Fetch and save quality measures
 */
async function fetchAndSaveMeasures(client: SonarCloudClient): Promise<void> {
  console.log('\nFetching quality measures...');
  const measures = await client.fetchMeasures([
    'bugs',
    'vulnerabilities',
    'code_smells',
    'coverage',
    'duplicated_lines_density',
    'ncloc',
    'sqale_index',
    'reliability_rating',
    'security_rating',
    'sqale_rating',
  ]);
  console.log('Measures fetched successfully', { measures });

  const outputDir = path.join(process.cwd(), 'reports');
  const measuresFile = path.join(outputDir, 'sonarcloud-measures.json');
  fs.writeFileSync(measuresFile, JSON.stringify(measures, null, 2));
  console.log(`✓ Measures saved to: ${measuresFile}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await main().catch((error) => {
    console.error('Fatal error in main:', error);
    process.exit(1);
  });
}

export { SonarCloudClient };
