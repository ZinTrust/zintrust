#!/usr/bin/env tsx
/**
 * SonarCloud Issues Downloader
 * Fetch and analyze issues from SonarCloud Web API
 */

import { Logger } from '@config/logger';
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
  private readonly logger = Logger.scope('sonarcloud');

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

      this.logger.info(
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
 * Load environment variables from .env file
 */
function loadEnv(): void {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts
            .join('=')
            .trim()
            .replace(/^["']|["']$/g, '');
          process.env[key.trim()] = value;
        }
      }
    }
  } catch (error) {
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
  } catch (error) {
    // Ignore errors reading file
  }
  return '';
}

/**
 * Generate issue report
 */
function generateReport(issues: SonarCloudIssue[]): string {
  const groupedByType = new Map<string, SonarCloudIssue[]>();
  const groupedBySeverity = new Map<string, SonarCloudIssue[]>();
  const groupedByFile = new Map<string, SonarCloudIssue[]>();

  for (const issue of issues) {
    // Group by type
    if (!groupedByType.has(issue.type)) {
      groupedByType.set(issue.type, []);
    }
    groupedByType.get(issue.type)?.push(issue);

    // Group by severity
    const severity = issue.impacts?.[0]?.severity || issue.severity;
    if (!groupedBySeverity.has(severity)) {
      groupedBySeverity.set(severity, []);
    }
    groupedBySeverity.get(severity)?.push(issue);

    // Group by file
    const file = issue.component.split(':').pop() || 'unknown';
    if (!groupedByFile.has(file)) {
      groupedByFile.set(file, []);
    }
    groupedByFile.get(file)?.push(issue);
  }

  let report = '╔════════════════════════════════════════════════════════════════╗\n';
  report += '║                SONARCLOUD ISSUES REPORT                        ║\n';
  report += `║                ${new Date().toISOString()}                ║\n`;
  report += '╚════════════════════════════════════════════════════════════════╝\n\n';

  report += `Total Issues: ${issues.length}\n\n`;

  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += 'ISSUES BY TYPE\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const [type, typeIssues] of Array.from(groupedByType.entries()).sort(
    (a, b) => b[1].length - a[1].length
  )) {
    report += `${type}: ${typeIssues.length}\n`;
  }

  report += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += 'ISSUES BY SEVERITY\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  const severityOrder = ['BLOCKER', 'CRITICAL', 'HIGH', 'MAJOR', 'MEDIUM', 'MINOR', 'LOW', 'INFO'];
  for (const severity of severityOrder) {
    if (groupedBySeverity.has(severity)) {
      const severityIssues = groupedBySeverity.get(severity)!;
      report += `${severity}: ${severityIssues.length}\n`;
    }
  }

  report += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += 'TOP 10 FILES WITH MOST ISSUES\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  const topFiles = Array.from(groupedByFile.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  for (const [file, fileIssues] of topFiles) {
    report += `${file}: ${fileIssues.length} issues\n`;
  }

  report += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += 'DETAILED ISSUES\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const issue of issues.slice(0, 50)) {
    // Show first 50 detailed
    const file = issue.component.split(':').pop() || 'unknown';
    const line = issue.line || 0;
    const severity = issue.impacts?.[0]?.severity || issue.severity;
    report += `[${severity}] ${file}:${line || '?'}\n`;
    report += `  Rule: ${issue.rule}\n`;
    report += `  Message: ${issue.message}\n`;
    report += `  Status: ${issue.status}\n`;

    if (issue.cleanCodeAttribute) {
      report += `  Attribute: ${issue.cleanCodeAttribute} (${issue.cleanCodeAttributeCategory})\n`;
    }

    if (issue.impacts && issue.impacts.length > 0) {
      const impacts = issue.impacts.map((i) => `${i.softwareQuality}: ${i.severity}`).join(', ');
      report += `  Impacts: ${impacts}\n`;
    }

    if (line > 0) {
      const snippet = getCodeSnippet(issue.component, line);
      if (snippet) {
        report += snippet;
      }
    }
    report += '\n';
  }

  if (issues.length > 50) {
    report += `\n... and ${issues.length - 50} more issues\n`;
  }

  return report;
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

  const logger = Logger.scope('sonarcloud');

  logger.info('🔍 SonarCloud Issues Downloader');
  logger.info(`Organization: ${organization}`);
  logger.info(`Project: ${projectKey}`);
  logger.info(`Token: ${token ? '✓ Provided' : '✗ Not provided'}\n`);

  const client = new SonarCloudClient(organization, projectKey, token);

  try {
    // Parse query parameters from URL or command line
    const params: QueryParams = {};

    if (args.includes('--low')) {
      params.impactSeverities = 'LOW';
    }
    if (args.includes('--medium')) {
      params.impactSeverities = 'MEDIUM';
    }
    if (args.includes('--high')) {
      params.impactSeverities = 'HIGH';
    }
    if (args.includes('--open')) {
      params.issueStatuses = 'OPEN,CONFIRMED';
    }
    if (args.includes('--resolved')) {
      params.resolved = 'true';
    }
    if (args.includes('--all-statuses')) {
      params.issueStatuses = 'OPEN,CONFIRMED,FALSE_POSITIVE,ACCEPTED,FIXED';
    }

    // Allow passing any parameter via --key=value
    for (const arg of args) {
      if (arg.startsWith('--') && arg.includes('=')) {
        const [key, value] = arg.slice(2).split('=');
        (params as any)[key] = value;
      }
    }

    logger.info('Fetching issues from SonarCloud...\n');

    const issues = await client.fetchAllIssues(params);

    logger.info(`\n✓ Fetched ${issues.length} issues\n`);

    // Generate report
    const report = generateReport(issues);

    // Save to file
    const outputDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(outputDir, `sonarcloud-issues-${timestamp}.txt`);
    const jsonFile = path.join(outputDir, `sonarcloud-issues-${timestamp}.json`);

    fs.writeFileSync(reportFile, report);
    fs.writeFileSync(jsonFile, JSON.stringify(issues, null, 2));

    logger.info(report);
    logger.info(`\n✓ Report saved to: ${reportFile}`);
    logger.info(`✓ JSON data saved to: ${jsonFile}`);

    // Optionally fetch quality measures
    if (args.includes('--measures')) {
      logger.info('\nFetching quality measures...');
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
      logger.info('Measures fetched successfully', { measures });

      const measuresFile = path.join(outputDir, `sonarcloud-measures-${timestamp}.json`);
      fs.writeFileSync(measuresFile, JSON.stringify(measures, null, 2));
      logger.info(`✓ Measures saved to: ${measuresFile}`);
    }
  } catch (error) {
    logger.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    Logger.error('Fatal error in main:', error);
    process.exit(1);
  });
}

export { SonarCloudClient };
