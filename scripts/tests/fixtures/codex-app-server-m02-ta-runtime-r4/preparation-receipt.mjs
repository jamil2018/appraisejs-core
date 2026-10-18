/** Exclusive, fsynced preparation receipts inside the journal-owned supervisor. */
import fs from 'node:fs'
import { join } from 'node:path'
import { T1_ROOT } from './journal.mjs'

const allowed = new Set(['module-stage.json', 'preparation-error.json'])
const fail = () => {
  throw new Error('T1 preparation receipt identity changed')
}

export function writeT1PreparationReceipt({ journal, name, value, phaseRoot = T1_ROOT, io = fs }) {
  if (!allowed.has(name) || !journal?.parentStats || journal.parentStats.length !== 2)
    throw new Error('T1 preparation receipt contract missing')
  const supervisor = join(phaseRoot, 'supervisor')
  const parents = [phaseRoot, supervisor]
  const check = () => {
    for (let index = 0; index < parents.length; index++) {
      const stat = io.lstatSync(parents[index])
      const expected = journal.parentStats[index]
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid() ||
        (stat.mode & 0o777) !== 0o700 ||
        stat.dev !== expected.dev ||
        stat.ino !== expected.ino
      )
        fail()
    }
  }
  check()
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  if (bytes.length > 4096) throw new Error('T1 preparation receipt bound')
  const path = join(supervisor, name)
  const fd = io.openSync(
    path,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  let written
  try {
    written = io.fstatSync(fd)
    if (
      !written.isFile() ||
      written.isSymbolicLink() ||
      written.uid !== process.getuid() ||
      (written.mode & 0o777) !== 0o600
    )
      fail()
    io.writeFileSync(fd, bytes)
    io.fsyncSync(fd)
  } finally {
    io.closeSync(fd)
  }
  check()
  const after = io.lstatSync(path)
  if (
    !after.isFile() ||
    after.isSymbolicLink() ||
    after.uid !== process.getuid() ||
    (after.mode & 0o777) !== 0o600 ||
    after.dev !== written.dev ||
    after.ino !== written.ino ||
    after.size !== bytes.length
  )
    fail()
  const directory = io.openSync(supervisor, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    const opened = io.fstatSync(directory)
    if (opened.dev !== journal.parentStats[1].dev || opened.ino !== journal.parentStats[1].ino) fail()
    io.fsyncSync(directory)
  } finally {
    io.closeSync(directory)
  }
  check()
  return path
}
