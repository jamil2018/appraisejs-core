// Inert fixture data population only; the caller owns the original database.
export function corruptLedger(db, selected) {
  // Explicit pre-owner fault fixture: replace ONLY the ledger with an unconstrained table.
  // This tests the genuine bounded SQL reader against malformed disk content, not supported admission.
  db.exec(
    'DROP TABLE QualityJourneyProviderSourceLedgerRecord; CREATE TABLE QualityJourneyProviderSourceLedgerRecord(sourceId,sequence,previousHead,head,kind,dataJson,byteCount)',
  )
  const insert = db.prepare('INSERT INTO QualityJourneyProviderSourceLedgerRecord VALUES(?,?,?,?,?,?,?)')
  if (selected === 'ledger-count')
    for (let n = 1; n <= 1025; n++) insert.run('corrupt', n, 'p', 'h', 'CREATED', '{}', 1)
  else if (selected === 'ledger-utf8') insert.run('corrupt', 1, 'p', 'h', 'CREATED', 'é'.repeat(600_000), 1)
  else if (selected === 'ledger-null-utf8') insert.run('corrupt', 1, null, 'h', 'CREATED', 'é'.repeat(600_000), 1)
  else if (selected === 'ledger-type') insert.run('corrupt', 1, new Uint8Array([0, 1]), 'h', 'CREATED', '{}', 1)
  else throw new Error('Unknown malformed ledger fixture')
}
