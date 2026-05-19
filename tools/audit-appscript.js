'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'src');
const workflowPath = path.join(root, '.github', 'workflows', 'deploy-appscript.yml');

const errors = [];
const warnings = [];

function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, predicate));
    if (entry.isFile() && (!predicate || predicate(full))) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

if (!fs.existsSync(srcDir)) errors.push('Diretorio src/ nao encontrado.');

const srcGsFiles = listFiles(srcDir, file => file.endsWith('.gs')).sort();
if (!srcGsFiles.length) errors.push('Nenhum arquivo .gs encontrado em src/.');

const allGsFiles = listFiles(root, file => file.endsWith('.gs')).sort();
const nonSrcGsFiles = allGsFiles.filter(file => !rel(file).startsWith('src/'));
if (nonSrcGsFiles.length) warnings.push('Arquivos .gs fora de src/ sao legado/nao publicados: ' + nonSrcGsFiles.map(rel).join(', '));

const functionOwners = new Map();
const globalVarOwners = new Map();
const spreadsheetIdOccurrences = [];

for (const file of srcGsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const fileRel = rel(file);
  let match;

  const functionRegex = /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  while ((match = functionRegex.exec(text)) !== null) {
    const name = match[1];
    if (!functionOwners.has(name)) functionOwners.set(name, []);
    functionOwners.get(name).push(fileRel);
  }

  const globalRegex = /^\s*var\s+([A-Za-z_$][\w$]*)\s*=/gm;
  while ((match = globalRegex.exec(text)) !== null) {
    const name = match[1];
    if (!globalVarOwners.has(name)) globalVarOwners.set(name, []);
    globalVarOwners.get(name).push(fileRel);
  }

  const literalRegex = /15LgI2U2dtM7vnrxFsiQMPTvBapBDg5ftgGttx7Pw0Cw/g;
  while ((match = literalRegex.exec(text)) !== null) spreadsheetIdOccurrences.push(fileRel);
}

for (const [name, owners] of functionOwners.entries()) {
  const uniqueOwners = Array.from(new Set(owners));
  if (uniqueOwners.length > 1) errors.push('Funcao duplicada em src/: ' + name + ' aparece em ' + uniqueOwners.join(', '));
}

for (const [name, owners] of globalVarOwners.entries()) {
  const uniqueOwners = Array.from(new Set(owners));
  if (uniqueOwners.length > 1) errors.push('Variavel global duplicada em src/: ' + name + ' aparece em ' + uniqueOwners.join(', '));
}

const uniqueSpreadsheetOwners = Array.from(new Set(spreadsheetIdOccurrences));
if (uniqueSpreadsheetOwners.length > 1) {
  errors.push('ID da planilha mestre aparece em multiplos arquivos src/: ' + uniqueSpreadsheetOwners.join(', ') + '. Use getConfigWMGJ_().SPREADSHEET_ID como fonte unica.');
}

if (fs.existsSync(workflowPath)) {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const commandLines = workflow.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('cp '));
  if (!commandLines.includes('cp src/*.gs build-appscript/')) errors.push('Workflow nao copia src/*.gs para build-appscript/.');
  if (commandLines.some(line => line.includes('apps-script') || line.includes('appsscript/'))) {
    errors.push('Workflow tenta copiar apps-script/appsscript. Essas pastas sao legado.');
  }
  if (!workflow.includes('node tools/audit-appscript.js')) errors.push('Workflow nao executa tools/audit-appscript.js antes do deploy.');
}

console.log('AUDITORIA_APPSCRIPT_WMGJ');
console.log(JSON.stringify({ ok: errors.length === 0, srcFiles: srcGsFiles.map(rel), legacyGsFiles: nonSrcGsFiles.map(rel), warnings, errors }, null, 2));

if (warnings.length) console.warn('WARNINGS:\n' + warnings.map(w => '- ' + w).join('\n'));
if (errors.length) {
  console.error('ERROS:\n' + errors.map(e => '- ' + e).join('\n'));
  process.exit(1);
}
