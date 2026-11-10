import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalSharedResourceJson, sharedResourceBounds } from './shared-resource-contract'
import {
  assertBootstrapInventory,
  bootstrapDirectJourneyIdModels,
  bootstrapDirectTargetProjectIdModels,
  bootstrapExtractorIds,
  bootstrapGuardCoverageDigest,
  bootstrapGuardSetBeforeDigest,
  bootstrapIndirectJourneyModels,
  bootstrapQueryIds,
  bootstrapReconciliationDigest,
  bootstrapResourceSetDigest,
  bootstrapRowsDigest,
  bootstrapSourceUniverseDigest,
  bootstrapZeroPredicateIds,
  orderBootstrapDomainEpochs,
  orderBootstrapEdges,
  orderBootstrapModelSummaries,
  sharedResourceBootstrapBounds,
  sharedResourceBootstrapDomainOrder,
  sharedResourceBootstrapInventoryCounts,
  sharedResourceBootstrapProofKind,
  sharedResourceBootstrapProtocolVersion,
  type BootstrapDomainEpoch,
  type BootstrapEdgeSummary,
  type BootstrapGuardSummary,
  type BootstrapProofInput,
  type BootstrapSourceUniverseInput,
} from './shared-resource-bootstrap-contract'

const a = 'a'.repeat(64)
const b = 'b'.repeat(64)
const key = (value: string) => [{ field: 'id', value }]
const vector = (epoch: number): BootstrapDomainEpoch[] =>
  sharedResourceBootstrapDomainOrder.map(kind => ({ kind, epoch }))
const sourceInput = (): BootstrapSourceUniverseInput => ({
  protocolVersion: 1, proofKind: 'JOURNEY_FREE_V1', targetProjectId: 'independent-project',
  sourceBuildDigest: a, schemaDigest: a, queryInventoryDigest: a, parserInventoryDigest: a,
  censusSchemaDigest: a, sourceCensusDigest: a,
  sourceModelSummaries: [
    { model: 'Module', classification: 'RESOURCE_ROOT', rowCount: 1,
      rowsDigest: bootstrapRowsDigest('Module', [{ key: key('module-1'), projectionDigest: a }]) },
  ],
  typedEdgeSummaries: [], selectedResourceSetDigest: a, selectedDescriptorDigest: a,
  zeroPredicateSummaries: bootstrapZeroPredicateIds.map(predicateId => ({ predicateId, count: 0, projectionDigest: a })),
})
const proofInput = (): BootstrapProofInput => ({
  protocolVersion: 1, proofKind: 'JOURNEY_FREE_V1', targetProjectId: 'independent-project',
  writerClosureDigest: a, readerClosureDigest: a, sourceUniverseDigest: a,
  sourceBuildDigest: a, queryInventoryDigest: a, parserInventoryDigest: a,
  domainEpochVectorBefore: vector(7), domainEpochVectorAfter: vector(8),
  selectedGuardSetBeforeDigest: a, completedAt: '2026-10-24T01:02:03.000Z',
})

describe('inert JOURNEY_FREE_V1 metadata contract', () => {
  it('pins the bootstrap version and the finite census and extractor inventory', () => {
    expect(sharedResourceBootstrapProtocolVersion).toBe(1)
    expect(sharedResourceBootstrapProofKind).toBe('JOURNEY_FREE_V1')
    expect(sharedResourceBootstrapInventoryCounts).toEqual({ directJourneyId: 47, directTargetProjectId: 55, indirectJourney: 13 })
    expect(bootstrapQueryIds).toHaveLength(14)
    expect(bootstrapQueryIds).toContain('Q5_UNFILTERED_INCOMING_EDGES')
    expect(bootstrapExtractorIds).toHaveLength(17)
    expect(bootstrapExtractorIds).toContain('PROVIDER_LINEAGE_METADATA_ONLY')
  })

  it('requires the complete exact 47/55/13 identities, including opaque exceptions and indirect provider lineage', () => {
    const census = { directJourneyIdModels: bootstrapDirectJourneyIdModels,
      directTargetProjectIdModels: bootstrapDirectTargetProjectIdModels,
      indirectJourneyModels: bootstrapIndirectJourneyModels }
    expect(census.directJourneyIdModels).toHaveLength(47)
    expect(census.directTargetProjectIdModels).toHaveLength(55)
    expect(census.indirectJourneyModels).toHaveLength(13)
    expect(census.directJourneyIdModels).toContain('StepDefinitionSearchReceipt')
    expect(census.directJourneyIdModels).toContain('StepDefinitionTelemetryEvent')
    expect(census.directJourneyIdModels).toContain('QualityJourneyAnalysisAnswer')
    expect(census.directTargetProjectIdModels).toContain('QualityJourneySharedResourceCoverage')
    expect(census.indirectJourneyModels).toContain('QualityJourneyAutomationMaterializationBinding')
    expect(census.indirectJourneyModels).toContain('QualityJourneyProviderSourceLedgerRecord')
    expect(() => assertBootstrapInventory(census)).not.toThrow()
    expect(() => assertBootstrapInventory({ ...census,
      directJourneyIdModels: [...census.directJourneyIdModels].reverse() })).not.toThrow()
    expect(() => assertBootstrapInventory({ ...census,
      directTargetProjectIdModels: census.directTargetProjectIdModels.slice(1) })).toThrow('BOOTSTRAP_INVENTORY')
    expect(() => assertBootstrapInventory({ ...census,
      directJourneyIdModels: [...census.directJourneyIdModels.slice(1), census.directJourneyIdModels[1]],
    })).toThrow('BOOTSTRAP_INVENTORY')
    expect(() => assertBootstrapInventory({ ...census,
      indirectJourneyModels: [...census.indirectJourneyModels.slice(1), 'QualityJourneyNewUnreviewedModel'],
    })).toThrow('BOOTSTRAP_INVENTORY')
  })

  it('binds ordered actual primary keys and distinguishes equal-count row substitutions', () => {
    const first = { key: key('module-a'), projectionDigest: a }
    const second = { key: key('module-b'), projectionDigest: b }
    const digest = bootstrapRowsDigest('Module', [first, second])
    expect(bootstrapRowsDigest('Module', [second, first])).toBe(digest)
    expect(bootstrapRowsDigest('Module', [first, { ...second, key: key('module-c') }])).not.toBe(digest)
    expect(bootstrapRowsDigest('Module', [first, { ...second, projectionDigest: a }])).not.toBe(digest)
    expect(() => bootstrapRowsDigest('Module', [first, first])).toThrow('BOOTSTRAP_DUPLICATE')
    expect(() => bootstrapRowsDigest('QualityJourneyScenarioRevision', [
      { key: [{ field: 'scenarioRevisionId', value: 'unique-alias' }], projectionDigest: a },
    ])).toThrow('BOOTSTRAP_IDENTITY')
    expect(() => bootstrapRowsDigest('QualityJourneyWorkAttemptSessionBinding', [
      { key: key('not-its-primary-key'), projectionDigest: a },
    ])).toThrow('BOOTSTRAP_IDENTITY')
    const rows = [10, 2].map(sequence => ({
      key: [{ field: 'sourceId', value: 'lineage-source' }, { field: 'sequence', value: sequence }],
      projectionDigest: a,
    }))
    const encoded = '{"model":"QualityJourneyProviderSourceLedgerRecord","rows":[' +
      '{"key":[{"field":"sourceId","value":"lineage-source"},{"field":"sequence","value":2}],"projectionDigest":"' + a + '"},' +
      '{"key":[{"field":"sourceId","value":"lineage-source"},{"field":"sequence","value":10}],"projectionDigest":"' + a + '"}]}'
    expect(bootstrapRowsDigest('QualityJourneyProviderSourceLedgerRecord', rows)).toBe(
      createHash('sha256').update('M06_SHARED_BOOTSTRAP_ROWS_V1\n').update(encoded).digest('hex'),
    )
  })

  it('retains unsupported coverage identities in metadata so an extra protocol cannot disappear', () => {
    const row = (protocolVersion: number) => ({ key: [
      { field: 'targetProjectId', value: 'independent-project' },
      { field: 'kind', value: 'LOCATOR' }, { field: 'protocolVersion', value: protocolVersion },
    ], projectionDigest: a })
    expect(bootstrapRowsDigest('QualityJourneySharedResourceCoverage', [row(1), row(2)]))
      .not.toBe(bootstrapRowsDigest('QualityJourneySharedResourceCoverage', [row(1)]))
  })

  it('sorts typed edge tuples, binds both endpoints and preserves explicit absent values', () => {
    const first: BootstrapEdgeSummary = { sourceKind: 'EXECUTION_CYCLE',
      source: { model: 'QualityJourneyExecutionCycle', key: key('cycle-a') }, field: 'testCaseId',
      destination: { model: 'TestCase', key: key('case-a') }, classification: 'SOURCE_REFERENCE', projectionDigest: a }
    const second: BootstrapEdgeSummary = { ...first, field: 'testSuiteId',
      destination: { model: 'TestSuite', key: key('suite-a') } }
    expect(orderBootstrapEdges([second, first])).toEqual([first, second])
    expect(() => orderBootstrapEdges([first, { ...first, projectionDigest: b }])).toThrow('BOOTSTRAP_DUPLICATE')
    const original = sourceInput()
    const digest = bootstrapSourceUniverseDigest({ ...original, typedEdgeSummaries: [first, second] })
    expect(bootstrapSourceUniverseDigest({ ...original, typedEdgeSummaries: [second, first] })).toBe(digest)
    expect(bootstrapSourceUniverseDigest({ ...original, typedEdgeSummaries: [first,
      { ...second, destination: { model: 'TestSuite', key: key('suite-b') } }] })).not.toBe(digest)
    expect(bootstrapSourceUniverseDigest({ ...original, typedEdgeSummaries: [{ ...first, sourceKind: null }] }))
      .not.toBe(bootstrapSourceUniverseDigest({ ...original, typedEdgeSummaries: [first] }))
    expect(() => orderBootstrapEdges([{ ...first, destination: undefined } as unknown as BootstrapEdgeSummary]))
      .toThrow('BOOTSTRAP_SHAPE')
  })

  it('sorts resource and guard sets while refusing duplicate keys and malformed historical metadata', () => {
    const resources = ['b', 'a'].map(resourceId => ({ kind: 'MODULE' as const, resourceId, dependencyDigest: a }))
    expect(bootstrapResourceSetDigest(resources)).toBe(bootstrapResourceSetDigest([...resources].reverse()))
    expect(() => bootstrapResourceSetDigest([resources[0], resources[0]])).toThrow('BOOTSTRAP_DUPLICATE')
    const guard: BootstrapGuardSummary = { kind: 'MODULE', resourceId: 'a', epoch: 4,
      coverageState: 'UNKNOWN', coverageDigest: null, resourceState: 'LIVE',
      createdAt: '2026-10-24T00:00:00.000Z', deletedAt: null }
    expect(bootstrapGuardSetBeforeDigest([guard])).not.toBe(bootstrapGuardSetBeforeDigest([{ ...guard, epoch: 5 }]))
    expect(() => bootstrapGuardSetBeforeDigest([{ ...guard, coverageDigest: a }])).toThrow('BOOTSTRAP_GUARD_STATE')
    expect(() => bootstrapGuardSetBeforeDigest([{ ...guard, createdAt: '2026-02-30T00:00:00.000Z' }]))
      .toThrow('BOOTSTRAP_DATE')
    expect(() => bootstrapGuardSetBeforeDigest([{ ...guard, resourceState: 'DELETED' }]))
      .toThrow('BOOTSTRAP_GUARD_STATE')
  })

  it('requires all five exactly-once domain increments and an exact canonical completion time', () => {
    const proof = proofInput()
    expect(orderBootstrapDomainEpochs([...proof.domainEpochVectorBefore].reverse()))
      .toEqual(proof.domainEpochVectorBefore)
    const digest = bootstrapReconciliationDigest(proof)
    expect(bootstrapReconciliationDigest({ ...proof,
      domainEpochVectorBefore: [...proof.domainEpochVectorBefore].reverse(),
      domainEpochVectorAfter: [...proof.domainEpochVectorAfter].reverse(),
    })).toBe(digest)
    for (const after of [vector(7), vector(9), vector(8).slice(1),
      [vector(8)[0], vector(8)[0], ...vector(8).slice(2)]])
      expect(() => bootstrapReconciliationDigest({ ...proof, domainEpochVectorAfter: after }))
        .toThrow('BOOTSTRAP_EPOCH_VECTOR')
    expect(() => bootstrapReconciliationDigest({ ...proof,
      domainEpochVectorBefore: vector(sharedResourceBounds.epoch), domainEpochVectorAfter: vector(sharedResourceBounds.epoch),
    })).toThrow('EPOCH_EXHAUSTED')
    for (const completedAt of ['2026-10-24T01:02:03Z', '2026-10-24T01:02:03.000+00:00', 'invalid'])
      expect(() => bootstrapReconciliationDigest({ ...proof, completedAt })).toThrow('BOOTSTRAP_DATE')
  })

  it('uses the accepted proof formulas and domain separation, binding every immutable digest', () => {
    const proof = proofInput()
    const expected = createHash('sha256').update('M06_SHARED_JOURNEY_FREE_PROOF_V1\n')
      .update(canonicalSharedResourceJson(proof)).digest('hex')
    expect(bootstrapReconciliationDigest(proof)).toBe(expected)
    for (const field of ['writerClosureDigest', 'readerClosureDigest', 'sourceUniverseDigest', 'sourceBuildDigest',
      'queryInventoryDigest', 'parserInventoryDigest', 'selectedGuardSetBeforeDigest'] as const)
      expect(bootstrapReconciliationDigest({ ...proof, [field]: b })).not.toBe(expected)
    const source = sourceInput()
    const sourceDigest = bootstrapSourceUniverseDigest(source)
    for (const field of ['sourceBuildDigest', 'schemaDigest', 'queryInventoryDigest', 'parserInventoryDigest',
      'censusSchemaDigest', 'sourceCensusDigest', 'selectedResourceSetDigest', 'selectedDescriptorDigest'] as const)
      expect(bootstrapSourceUniverseDigest({ ...source, [field]: b })).not.toBe(sourceDigest)
    const guard = { protocolVersion: 1 as const, targetProjectId: 'independent-project', kind: 'MODULE' as const,
      resourceId: 'module-a', sourceUniverseDigest: a, reconciliationDigest: a, dependencyDigest: a }
    const guardDigest = bootstrapGuardCoverageDigest(guard)
    expect(guardDigest).toBe(createHash('sha256').update('M06_SHARED_JOURNEY_FREE_GUARD_V1\n')
      .update(canonicalSharedResourceJson(guard)).digest('hex'))
    for (const field of ['sourceUniverseDigest', 'reconciliationDigest', 'dependencyDigest'] as const)
      expect(bootstrapGuardCoverageDigest({ ...guard, [field]: b })).not.toBe(guardDigest)
    expect(guardDigest).not.toBe(expected)
  })

  it('refuses malformed IDs, hashes, missing/extra fields and incomplete zero predicates', () => {
    const source = sourceInput()
    for (const targetProjectId of ['', 'x'.repeat(129), 'contains\nnewline', 'non-ascii-\u00e9'])
      expect(() => bootstrapSourceUniverseDigest({ ...source, targetProjectId })).toThrow('BOOTSTRAP_IDENTITY')
    for (const sourceBuildDigest of ['', 'A'.repeat(64), 'sha256:' + a, 'a'.repeat(63), 'g'.repeat(64)])
      expect(() => bootstrapSourceUniverseDigest({ ...source, sourceBuildDigest })).toThrow('BOOTSTRAP_DIGEST')
    expect(() => bootstrapSourceUniverseDigest({ ...source, extra: a } as BootstrapSourceUniverseInput))
      .toThrow('BOOTSTRAP_SHAPE')
    expect(() => bootstrapSourceUniverseDigest({ ...source, sourceCensusDigest: undefined } as unknown as BootstrapSourceUniverseInput)).toThrow('BOOTSTRAP_DIGEST')
    expect(() => bootstrapSourceUniverseDigest({ ...source,
      zeroPredicateSummaries: source.zeroPredicateSummaries.slice(1) })).toThrow('BOOTSTRAP_ZERO_PREDICATE')
    expect(() => bootstrapSourceUniverseDigest({ ...source,
      zeroPredicateSummaries: source.zeroPredicateSummaries.map((value, index) => index ? value : { ...value, count: 1 }) as unknown as BootstrapSourceUniverseInput['zeroPredicateSummaries'],
    })).toThrow('BOOTSTRAP_ZERO_PREDICATE')
    expect(() => bootstrapSourceUniverseDigest({ ...source, zeroPredicateSummaries: [
      source.zeroPredicateSummaries[0], ...source.zeroPredicateSummaries.slice(0, -1),
    ] })).toThrow('BOOTSTRAP_DUPLICATE')
    const sparse: BootstrapDomainEpoch[] = new Array(5)
    expect(() => orderBootstrapDomainEpochs(sparse)).toThrow('BOOTSTRAP_SHAPE')
  })

  it('enforces aggregate record/resource ceilings and the shared complete-envelope node ceiling', () => {
    const summaries = [
      { model: 'TestCase' as const, classification: 'RESOURCE_ROOT' as const, rowCount: 1, rowsDigest: a },
      { model: 'Module' as const, classification: 'RESOURCE_ROOT' as const, rowCount: 0, rowsDigest: b },
    ]
    expect(orderBootstrapModelSummaries(summaries).map(value => value.model)).toEqual(['Module', 'TestCase'])
    expect(() => orderBootstrapModelSummaries([summaries[0], summaries[0]])).toThrow('BOOTSTRAP_DUPLICATE')
    expect(() => orderBootstrapModelSummaries([
      { model: 'Module', classification: 'RESOURCE_ROOT', rowCount: 65_536, rowsDigest: a },
      { model: 'TestCase', classification: 'RESOURCE_ROOT', rowCount: 1, rowsDigest: a },
    ])).toThrow('BOOTSTRAP_COUNT')
    const resources = Array.from({ length: sharedResourceBootstrapBounds.resourceKeys + 1 }, (_, index) => ({
      kind: 'MODULE' as const, resourceId: String(index), dependencyDigest: a,
    }))
    expect(() => bootstrapResourceSetDigest(resources)).toThrow('BOOTSTRAP_BOUNDS')
    const rows = Array.from({ length: 12_000 }, (_, index) => ({ key: key(String(index)), projectionDigest: a }))
    expect(() => bootstrapRowsDigest('Module', rows)).toThrow(/DESCRIPTOR_(SHAPE|BYTES)/)
    expect(() => bootstrapRowsDigest('Module', Array.from({ length: 65_537 }, () => rows[0])))
      .toThrow('BOOTSTRAP_BOUNDS')
  })
})
