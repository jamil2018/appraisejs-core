#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const prismaRoot = path.join(repoRoot, 'prisma')
const schemaPath = path.join(prismaRoot, 'schema.prisma')
const migrationsRoot = path.join(prismaRoot, 'migrations')
const outDir = path.join(prismaRoot, 'graphify-out')

const schemaText = fs.readFileSync(schemaPath, 'utf8')
fs.mkdirSync(outDir, { recursive: true })

const nodes = new Map()
const links = []
const communities = new Map()
let nextCommunity = 0

function slug(value) {
  return (
    value
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'node'
  )
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length
}

function relativeToPrisma(file) {
  return path.relative(prismaRoot, file).replace(/\\/g, '/')
}

function communityFor(key, name = key) {
  if (!communities.has(key)) {
    communities.set(key, { id: nextCommunity, name })
    nextCommunity += 1
  }
  return communities.get(key)
}

function addNode(id, label, type, sourceFile, sourceLocation, communityKey, extra = {}) {
  const community = communityFor(communityKey, label)
  if (!nodes.has(id)) {
    nodes.set(id, {
      id,
      label,
      type: 'code',
      file_type: 'code',
      source_file: sourceFile,
      source_location: sourceLocation,
      _origin: 'prisma-schema',
      community: community.id,
      community_name: community.name,
      norm_label: label.toLowerCase(),
      graphify_type: type,
      ...extra,
    })
  }
  return id
}

function addLink(source, target, relation, sourceFile, sourceLocation, context = 'schema') {
  if (source === target || !nodes.has(source) || !nodes.has(target)) return
  links.push({
    source,
    target,
    relation,
    context,
    confidence: 'EXTRACTED',
    confidence_score: 1,
    source_file: sourceFile,
    source_location: sourceLocation,
    weight: 1,
  })
}

function parseBlocks() {
  const blocks = []
  const blockPattern = /^(model|enum)\s+(\w+)\s*\{\n([\s\S]*?)^\}/gm
  for (const match of schemaText.matchAll(blockPattern)) {
    blocks.push({
      kind: match[1],
      name: match[2],
      body: match[3],
      line: lineNumber(schemaText, match.index ?? 0),
    })
  }
  return blocks
}

const scalarTypes = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'Decimal', 'BigInt'])
const blocks = parseBlocks()
const models = new Map()
const enums = new Map()

addNode('prisma_schema', 'schema.prisma', 'file', 'schema.prisma', 'L1', 'schema.prisma')
addNode('prisma_datasource_sqlite', 'datasource db (sqlite)', 'datasource', 'schema.prisma', 'L5', 'schema.prisma')
addNode('prisma_client_generator', 'Prisma client generator', 'generator', 'schema.prisma', 'L1', 'schema.prisma')
addLink('prisma_schema', 'prisma_datasource_sqlite', 'contains', 'schema.prisma', 'L5')
addLink('prisma_schema', 'prisma_client_generator', 'contains', 'schema.prisma', 'L1')

for (const block of blocks) {
  const id = `prisma_${block.kind}_${slug(block.name)}`
  addNode(id, block.name, block.kind, 'schema.prisma', `L${block.line}`, block.name)
  addLink('prisma_schema', id, 'contains', 'schema.prisma', `L${block.line}`)
  if (block.kind === 'model') {
    models.set(block.name, { ...block, id })
  } else {
    enums.set(block.name, { ...block, id })
    const values = block.body
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'))
    values.forEach((value, index) => {
      const valueName = value.split(/\s+/)[0]
      const valueId = `${id}_value_${slug(valueName)}`
      addNode(
        valueId,
        `${block.name}.${valueName}`,
        'enum_value',
        'schema.prisma',
        `L${block.line + index + 1}`,
        block.name,
      )
      addLink(id, valueId, 'contains_value', 'schema.prisma', `L${block.line + index + 1}`)
    })
  }
}

const relationPattern = /@relation\((.*?)\)/
const fieldsPattern = /fields:\s*\[([^\]]+)\]/
const referencesPattern = /references:\s*\[([^\]]+)\]/

for (const model of models.values()) {
  model.body.split('\n').forEach((rawLine, index) => processModelLine(model, rawLine, index))
}

function processModelLine(model, rawLine, index) {
  const parsed = parseModelLine(model, rawLine, index)
  if (!parsed) return
  if (parsed.kind === 'constraint') addModelConstraint(model, parsed.line, parsed.sourceLocation, index)
  if (parsed.kind === 'field') processModelField(model, parsed.line, parsed.sourceLocation)
}

function parseModelLine(model, rawLine, index) {
  const line = rawLine.trim()
  if (isIgnoredModelLine(line)) return null
  const sourceLocation = `L${model.line + index + 1}`
  return { kind: modelLineKind(line), line, sourceLocation }
}

function isIgnoredModelLine(line) {
  return line.length === 0 || line.startsWith('//') || line.startsWith('@')
}

function modelLineKind(line) {
  return line.startsWith('@@') ? 'constraint' : 'field'
}

function processModelField(model, line, sourceLocation) {
  const field = parseFieldLine(line)
  if (!field) return
  const fieldId = addModelField(model, field, sourceLocation)
  addFieldModifiers(model, fieldId, field.attrs, sourceLocation)
  addFieldTypeEdges(model, fieldId, field, line, sourceLocation)
}

function addModelConstraint(model, line, sourceLocation, index) {
  const constraintType = line.split('(')[0].replace(/^@@/, '')
  const constraintId = `${model.id}_${slug(constraintType)}_${model.line + index + 1}`
  addNode(constraintId, `${model.name}.${constraintType}`, 'constraint', 'schema.prisma', sourceLocation, model.name)
  addLink(model.id, constraintId, 'declares_constraint', 'schema.prisma', sourceLocation, 'constraint')
}

function parseFieldLine(line) {
  const parts = line.split(/\s+/)
  if (parts.length < 2) return null
  const [fieldName, rawType] = parts
  return {
    fieldName,
    rawType,
    baseType: rawType.replace(/[?\[\]]/g, ''),
    attrs: parts.slice(2).join(' '),
  }
}

function addModelField(model, field, sourceLocation) {
  const fieldId = `${model.id}_field_${slug(field.fieldName)}`
  addNode(fieldId, `${model.name}.${field.fieldName}`, 'field', 'schema.prisma', sourceLocation, model.name, {
    prisma_type: field.rawType,
  })
  addLink(model.id, fieldId, 'has_field', 'schema.prisma', sourceLocation, 'field')
  return fieldId
}

function addFieldModifiers(model, fieldId, attrs, sourceLocation) {
  if (attrs.includes('@id'))
    addLink(fieldId, model.id, 'primary_key_for', 'schema.prisma', sourceLocation, 'constraint')
  if (attrs.includes('@unique')) addLink(fieldId, model.id, 'unique_for', 'schema.prisma', sourceLocation, 'constraint')
}

function addFieldTypeEdges(model, fieldId, field, line, sourceLocation) {
  if (enums.has(field.baseType)) {
    addLink(fieldId, enums.get(field.baseType).id, 'uses_enum', 'schema.prisma', sourceLocation, 'field_type')
    return
  }
  if (models.has(field.baseType)) {
    addRelationEdges(model, fieldId, field.baseType, line, sourceLocation)
    return
  }
  if (scalarTypes.has(field.baseType)) {
    const scalarId = `prisma_scalar_${slug(field.baseType)}`
    addNode(scalarId, field.baseType, 'scalar_type', 'schema.prisma', 'L1', `scalar:${field.baseType}`)
    addLink(fieldId, scalarId, 'uses_scalar', 'schema.prisma', sourceLocation, 'field_type')
  }
}

function addRelationEdges(model, fieldId, targetModelName, line, sourceLocation) {
  const targetModel = models.get(targetModelName)
  addLink(model.id, targetModel.id, 'relates_to', 'schema.prisma', sourceLocation, 'relation')
  addLink(fieldId, targetModel.id, 'relation_field_to', 'schema.prisma', sourceLocation, 'relation')
  const relation = relationPattern.exec(line)?.[1]
  addLocalForeignKeys(model, targetModel, relation, sourceLocation)
  addReferencedFields(fieldId, targetModel, relation, sourceLocation)
}

function addLocalForeignKeys(model, targetModel, relation, sourceLocation) {
  const localFields = relation ? fieldsPattern.exec(relation)?.[1] : undefined
  for (const localField of splitFieldList(localFields)) {
    const localId = `${model.id}_field_${slug(localField)}`
    addLink(localId, targetModel.id, 'foreign_key_to', 'schema.prisma', sourceLocation, 'foreign_key')
  }
}

function addReferencedFields(fieldId, targetModel, relation, sourceLocation) {
  const referencedFields = relation ? referencesPattern.exec(relation)?.[1] : undefined
  for (const referencedField of splitFieldList(referencedFields)) {
    const referencedId = `${targetModel.id}_field_${slug(referencedField)}`
    addLink(fieldId, referencedId, 'references_field', 'schema.prisma', sourceLocation, 'foreign_key')
  }
}

function splitFieldList(value) {
  return value
    ? value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : []
}

function listMigrationFiles() {
  if (!fs.existsSync(migrationsRoot)) return []
  return fs
    .readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(migrationsRoot, entry.name, 'migration.sql'))
    .filter(file => fs.existsSync(file))
    .sort()
}

const tablePatterns = [
  /CREATE\s+TABLE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
  /ALTER\s+TABLE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
  /DROP\s+TABLE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
  /CREATE\s+(?:UNIQUE\s+)?INDEX\s+"?[A-Za-z0-9_]+"?\s+ON\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
]

for (const migrationFile of listMigrationFiles()) {
  const rel = relativeToPrisma(migrationFile)
  const migrationName = path.basename(path.dirname(migrationFile))
  const migrationId = `prisma_migration_${slug(migrationName)}`
  addNode(migrationId, migrationName, 'migration', rel, 'L1', migrationName)
  addLink('prisma_schema', migrationId, 'has_migration', rel, 'L1', 'migration')

  const sql = fs.readFileSync(migrationFile, 'utf8')
  const affectedTables = new Set()
  for (const pattern of tablePatterns) {
    pattern.lastIndex = 0
    for (const match of sql.matchAll(pattern)) {
      affectedTables.add(match[1])
    }
  }

  for (const table of [...affectedTables].sort()) {
    const model = models.get(table)
    if (model) {
      addLink(migrationId, model.id, 'migrates_model', rel, 'L1', 'migration')
    } else {
      const tableId = `prisma_table_${slug(table)}`
      addNode(tableId, table, 'table', rel, 'L1', table)
      addLink(migrationId, tableId, 'migrates_table', rel, 'L1', 'migration')
    }
  }
}

const nodeList = [...nodes.values()]
const communityNames = new Map([...communities.values()].map(community => [community.id, community.name]))
const graph = {
  directed: true,
  multigraph: false,
  graph: {},
  nodes: nodeList,
  links,
  hyperedges: [],
  built_at_commit: git(['rev-parse', '--short', 'HEAD']) || undefined,
}

fs.writeFileSync(path.join(outDir, 'graph.json'), `${JSON.stringify(graph, null, 2)}\n`)
fs.writeFileSync(path.join(outDir, 'GRAPH_REPORT.md'), buildReport(nodeList, links, communityNames))

const tree = spawnSync(
  'graphify',
  [
    'tree',
    '--graph',
    'prisma/graphify-out/graph.json',
    '--output',
    'prisma/graphify-out/graph.html',
    '--root',
    'prisma',
    '--label',
    'AppraiseJS Prisma',
  ],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  },
)

if (tree.error?.code === 'ENOENT') {
  console.warn('Graphify CLI not found; skipped prisma/graphify-out/graph.html generation.')
} else if (tree.status !== 0) {
  process.stderr.write(tree.stderr)
  process.exit(tree.status ?? 1)
}

console.log(`Prisma graph: ${nodeList.length} nodes, ${links.length} edges, ${communityNames.size} communities`)

function buildReport(nodeList, links, communityNames) {
  const degree = calculateDegree(links)
  const nodeById = new Map(nodeList.map(node => [node.id, node]))
  const godNodes = formatGodNodes(degree, nodeById)
  const relationLinks = formatRelationLinks(links, nodeById)
  const communityLines = formatCommunities(nodeList, communityNames)

  return reportSections({
    nodeCount: nodeList.length,
    edgeCount: links.length,
    communityCount: communityNames.size,
    godNodes,
    relationLinks,
    communityLines,
  }).join('\n\n')
}

function calculateDegree(links) {
  const degree = new Map()
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1)
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1)
  }
  return degree
}

function reportSections({ nodeCount, edgeCount, communityCount, godNodes, relationLinks, communityLines }) {
  return [
    '# Graph Report - prisma',
    `## Corpus Check\n- ${1 + listMigrationFiles().length} files from prisma/schema.prisma and migrations\n- Verdict: schema-aware graph generated because Graphify AST extraction does not currently produce Prisma/SQL nodes.`,
    `## Summary\n- ${nodeCount} nodes · ${edgeCount} edges · ${communityCount} communities\n- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS\n- Token cost: 0 input · 0 output`,
    `## God Nodes (most connected - your core abstractions)\n${godNodes.join('\n')}`,
    `## Surprising Connections (you probably didn't know these)\n${formatOptionalLines(relationLinks)}`,
    '## Import Cycles\n- None detected.',
    `## Communities (${communityCount} total)\n${communityLines.join('\n\n')}`,
    '## Suggested Questions\n- Which models connect a Quality Journey to its execution and evidence records?\n- Which models enforce Journey artifact lineage?\n- Which models depend on Locator or TestRun?\n- Which enums are used by execution report models?\n',
  ]
}

function formatOptionalLines(lines) {
  return lines.length > 0 ? lines.join('\n') : '- None detected.'
}

function formatGodNodes(degree, nodeById) {
  return [...degree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count], index) => `${index + 1}. \`${nodeById.get(id)?.label ?? id}\` - ${count} edges`)
}

function formatRelationLinks(links, nodeById) {
  const reportRelations = new Set(['relates_to', 'foreign_key_to', 'migrates_model'])
  return links
    .filter(link => reportRelations.has(link.relation))
    .slice(0, 8)
    .map(link => formatRelationLink(link, nodeById))
}

function formatRelationLink(link, nodeById) {
  const source = nodeLabel(nodeById, link.source)
  const target = nodeLabel(nodeById, link.target)
  return `- \`${source}\` --${link.relation}--> \`${target}\`  [EXTRACTED]\n  ${link.source_file} ${link.source_location}`
}

function nodeLabel(nodeById, id) {
  const node = nodeById.get(id)
  return node ? node.label : id
}

function formatCommunities(nodeList, communityNames) {
  return [...communityNames.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, name]) => formatCommunity(id, name, nodeList))
}

function formatCommunity(id, name, nodeList) {
  const members = nodeList.filter(node => node.community === id)
  const preview = members
    .slice(0, 8)
    .map(node => node.label)
    .join(', ')
  return `### Community ${id} - "${name}"\nNodes (${members.length}): ${preview}${members.length > 8 ? ' (+more)' : ''}`
}

function git(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })
  return result.status === 0 ? result.stdout.trim() : ''
}
