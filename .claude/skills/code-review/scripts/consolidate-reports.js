#!/usr/bin/env node

/**
 * consolidate-reports.js — Merge findings from Claude, Codex, and Gemini reports
 *
 * Reads:
 *   - code-review-report.md (Claude's primary report)
 *   - .claude/skills/code-review/.reports/codex-report.md
 *   - .claude/skills/code-review/.reports/gemini-report.md
 *
 * Outputs:
 *   - code-review-report-consolidated.md (merged, deduplicated, prioritized)
 *
 * Usage:
 *   node .claude/skills/code-review/scripts/consolidate-reports.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const REPORTS_DIR = path.resolve(__dirname, '../.reports');

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

/**
 * Parse a markdown report into structured findings.
 * Looks for patterns like: ### [SEVERITY] Issue title
 *
 * @param {string} content - Raw markdown content
 * @param {string} source - Source label (claude/codex/gemini)
 * @returns {Array<Object>} Parsed findings
 */
function parseReport(content, source) {
  const findings = [];
  const lines = content.split('\n');
  let current = null;

  for (const line of lines) {
    // Match finding headers: ### [CRITICAL] Issue title
    const match = line.match(/^###?\s*\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]\s*(.+)/i);
    if (match) {
      if (current) findings.push(current);
      current = {
        severity: match[1].toUpperCase(),
        title: match[2].trim(),
        source: source,
        body: '',
        file: '',
        category: '',
      };
      continue;
    }

    if (current) {
      // Extract file path
      const fileMatch = line.match(/\*\*File\*\*:\s*`([^`]+)`/);
      if (fileMatch) current.file = fileMatch[1];

      // Extract category
      const catMatch = line.match(/\*\*Category\*\*:\s*(\S+)/);
      if (catMatch) current.category = catMatch[1];

      current.body += line + '\n';
    }
  }

  if (current) findings.push(current);
  return findings;
}

/**
 * Check if two findings are likely duplicates.
 * Matches on file path + similar title keywords.
 *
 * @param {Object} a - First finding
 * @param {Object} b - Second finding
 * @returns {boolean}
 */
function isDuplicate(a, b) {
  // Must share the same file to be considered duplicates
  if (!a.file || !b.file || a.file !== b.file) return false;

  // Same file + same category + similar title (>50% word overlap)
  const wordsA = new Set(a.title.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.title.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const overlap = intersection.length / Math.min(wordsA.size, wordsB.size);

  return a.category === b.category && overlap > 0.5;
}

/**
 * Merge findings from multiple sources, deduplicating and prioritizing.
 *
 * @param {Array<Array<Object>>} sources - Arrays of findings from each source
 * @returns {Array<Object>} Merged, deduplicated findings sorted by severity
 */
function mergeFindings(sources) {
  const all = sources.flat();
  const merged = [];
  const used = new Set();

  for (let i = 0; i < all.length; i++) {
    if (used.has(i)) continue;

    const finding = { ...all[i], confirmedBy: [all[i].source] };

    // Find duplicates from other sources
    for (let j = i + 1; j < all.length; j++) {
      if (used.has(j)) continue;
      if (all[j].source === all[i].source) continue; // Same source

      if (isDuplicate(all[i], all[j])) {
        finding.confirmedBy.push(all[j].source);
        used.add(j);
      }
    }

    // Upgrade severity by exactly one level if 2+ models confirm the same issue
    if (finding.confirmedBy.length >= 2) {
      const currentIdx = SEVERITY_ORDER.indexOf(finding.severity);
      if (currentIdx > 0) {
        finding.severity = SEVERITY_ORDER[currentIdx - 1];
        finding.upgraded = true;
      }
    }

    used.add(i);
    merged.push(finding);
  }

  // Sort by severity
  merged.sort((a, b) => {
    return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });

  return merged;
}

/**
 * Generate a consolidated markdown report.
 *
 * @param {Array<Object>} findings - Merged findings
 * @param {Object} metadata - Report metadata
 * @returns {string} Markdown report
 */
function generateReport(findings, metadata) {
  const counts = {};
  for (const sev of SEVERITY_ORDER) counts[sev] = 0;
  for (const f of findings) counts[f.severity]++;

  let report = `# Consolidated Code Review Report

**Date**: ${new Date().toISOString().split('T')[0]}
**Models**: ${metadata.models.join(' + ')}
**Total findings**: ${findings.length}

## Summary

| Severity | Count | Multi-Model Confirmed |
|----------|-------|----------------------|
`;

  for (const sev of SEVERITY_ORDER) {
    const confirmed = findings.filter((f) => f.severity === sev && f.confirmedBy.length > 1).length;
    report += `| ${sev} | ${counts[sev]} | ${confirmed} |\n`;
  }

  report += `| **Total** | **${findings.length}** | **${findings.filter((f) => f.confirmedBy.length > 1).length}** |\n`;

  // Group by severity
  for (const sev of SEVERITY_ORDER) {
    const sevFindings = findings.filter((f) => f.severity === sev);
    if (sevFindings.length === 0) continue;

    report += `\n## ${sev} Issues\n\n`;

    for (const f of sevFindings) {
      const sources = f.confirmedBy.join(', ');
      const badge = f.confirmedBy.length > 1 ? ' [MULTI-MODEL]' : '';
      const upgraded = f.upgraded ? ' [SEVERITY UPGRADED]' : '';

      report += `### [${f.severity}] ${f.title}${badge}${upgraded}\n`;
      report += `- **Sources**: ${sources}\n`;
      report += f.body;
      report += '\n';
    }
  }

  return report;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const models = [];
  const allFindings = [];

  // Read Claude report
  const claudeReportPath = path.join(PROJECT_ROOT, 'code-review-report.md');
  if (fs.existsSync(claudeReportPath)) {
    const content = fs.readFileSync(claudeReportPath, 'utf-8');
    allFindings.push(parseReport(content, 'claude'));
    models.push('Claude');
    console.log(`[OK] Claude report: ${parseReport(content, 'claude').length} findings`);
  } else {
    console.log('[SKIP] No Claude report found at code-review-report.md');
  }

  // Read Codex report
  const codexReportPath = path.join(REPORTS_DIR, 'codex-report.md');
  if (fs.existsSync(codexReportPath)) {
    const content = fs.readFileSync(codexReportPath, 'utf-8');
    if (!content.includes('not available') && !content.includes('failed')) {
      allFindings.push(parseReport(content, 'codex'));
      models.push('Codex');
      console.log(`[OK] Codex report: ${parseReport(content, 'codex').length} findings`);
    } else {
      console.log('[SKIP] Codex report empty or failed');
    }
  }

  // Read Gemini report
  const geminiReportPath = path.join(REPORTS_DIR, 'gemini-report.md');
  if (fs.existsSync(geminiReportPath)) {
    const content = fs.readFileSync(geminiReportPath, 'utf-8');
    if (!content.includes('not available') && !content.includes('failed')) {
      allFindings.push(parseReport(content, 'gemini'));
      models.push('Gemini');
      console.log(`[OK] Gemini report: ${parseReport(content, 'gemini').length} findings`);
    } else {
      console.log('[SKIP] Gemini report empty or failed');
    }
  }

  if (allFindings.length === 0) {
    console.error('[ERROR] No reports found. Run the code review first.');
    process.exit(1);
  }

  const merged = mergeFindings(allFindings);
  const report = generateReport(merged, { models });

  const outputPath = path.join(PROJECT_ROOT, 'code-review-report-consolidated.md');
  fs.writeFileSync(outputPath, report, 'utf-8');

  console.log(`\n=== Consolidation Complete ===`);
  console.log(`Total findings: ${merged.length}`);
  console.log(`Multi-model confirmed: ${merged.filter((f) => f.confirmedBy.length > 1).length}`);
  console.log(`Output: ${outputPath}`);
}

main();
