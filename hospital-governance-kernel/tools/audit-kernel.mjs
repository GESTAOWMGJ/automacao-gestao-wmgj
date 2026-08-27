import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.name === '.venv' || entry.name === '__pycache__') return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(root);
const gsFiles = files.filter(file => file.endsWith('.gs'));
for (const file of gsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  try { new vm.Script(text, { filename: file }); } catch (error) { errors.push(`SYNTAX ${path.relative(root, file)}: ${error.message}`); }
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) errors.push(`REMOTE_CODE_EXECUTION ${path.relative(root, file)}`);
  if (/catch\s*\(\s*(ignore|_)\s*\)\s*\{\s*\}/.test(text)) errors.push(`SILENT_CATCH ${path.relative(root, file)}`);
  if (/AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}/.test(text)) errors.push(`SECRET_LITERAL ${path.relative(root, file)}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
const scopes = manifest.oauthScopes || [];
if (scopes.includes('https://mail.google.com/')) errors.push('MANIFEST_GMAIL_FULL_SCOPE');
if (scopes.includes('https://www.googleapis.com/auth/drive')) errors.push('MANIFEST_DRIVE_FULL_SCOPE');
if (manifest.executionApi) errors.push('MANIFEST_EXECUTION_API_FORBIDDEN');

for (const schemaFile of files.filter(file => file.endsWith('.schema.json'))) {
  const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  if (schema.type === 'object' && schema.additionalProperties !== false) {
    warnings.push(`ROOT_SCHEMA_NOT_STRICT ${path.relative(root, schemaFile)}`);
  }
}

const workflowDir = path.resolve(root, '..', '.github', 'workflows');
const workflowFiles = fs.existsSync(workflowDir)
  ? fs.readdirSync(workflowDir)
      .filter(file => file.includes('hospital-governance-kernel'))
      .map(file => path.join(workflowDir, file))
  : [];
for (const file of workflowFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/clasp\s+run\s+HKGK_/.test(text)) errors.push(`DEPLOY_EXECUTES_RUNTIME ${path.relative(root, file)}`);
  if (/APPS_SCRIPT_ID\s*:\s*['\"][A-Za-z0-9_-]{12,}/.test(text)) {
    errors.push(`HARDCODED_SCRIPT_ID ${path.relative(root, file)}`);
  }
}

const report = {
  ok: errors.length === 0,
  gsFiles: gsFiles.length,
  schemas: files.filter(file => file.endsWith('.schema.json')).length,
  workflows: workflowFiles.length,
  warnings,
  errors
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
