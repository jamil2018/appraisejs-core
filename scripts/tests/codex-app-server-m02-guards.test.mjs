import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  createGatewayFixture,
  ScriptedResponses,
  executionUnavailable,
  adversarialCasePlan,
} from './fixtures/codex-app-server-m02/gateway-fixture.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixturePath = fileURLToPath(new URL('./fixtures/codex-app-server-m02/probe.py', import.meta.url))
const policy = JSON.parse(readFileSync(new URL('./fixtures/codex-app-server-m02/policy.json', import.meta.url), 'utf8'))
const roles = ['REQUIREMENT_ANALYZER', 'SCOUT', 'RESOURCE_EXPLORER', 'TEST_SCENARIO_DESIGNER', 'AUTOMATOR', 'TRIAGER']

// Only a Python unit-test interpreter is launched. The imported module has no runtime adapter.
function python(body) {
  const prelude = `import importlib.util,json,sys,copy\nspec=importlib.util.spec_from_file_location('b0',sys.argv[1])\np=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(p)\npolicy=p.load_policy()\nwritten=[]\ntime=[0]\ndef sink(data):\n written.append(data)\n return p.digest(data)\nj=p.BudgetJournal(policy,sink,lambda:time[0])\ndef blocked(fn):\n try: fn()\n except p.Blocked: return\n raise AssertionError('expected refusal')\n`
  const outcome = spawnSync('python3', ['-B', '-c', prelude + body, fixturePath], { encoding: 'utf8', timeout: 10000 })
  assert.equal(outcome.status, 0, outcome.stderr)
  return outcome.stdout.trim() ? JSON.parse(outcome.stdout) : undefined
}

test('preserves every accepted M02-A, frozen M00 and retained M01 artifact', () => {
  for (const [relative, expected] of Object.entries(policy.preservedArtifacts)) {
    const actual = createHash('sha256')
      .update(readFileSync(`${root}${relative}`))
      .digest('hex')
    assert.equal(actual, expected, relative)
  }
})
test('policy has fixed cases and exact aggregate ceilings', () => {
  assert.deepEqual(
    policy.cases.map(c => c.id),
    [...Array.from({ length: 14 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`), 'P00'],
  )
  assert.equal(
    policy.cases.reduce((sum, c) => sum + c.maxTurnStarts, 0),
    14,
  )
  assert.equal(
    policy.cases.reduce((sum, c) => sum + c.maxThreadStarts, 0),
    15,
  )
  assert.equal(
    policy.cases.reduce((sum, c) => sum + c.maxProviderRequests, 0),
    55,
  )
  assert.equal(policy.runtimeExecutionAllowed, false)
  assert.ok(policy.cases.every(c => c.wireRoute === 'UNQUALIFIED'))
})
test('offline Python description cannot execute or create the fixed root', () => {
  const result = python('print(json.dumps(p.planning_manifest(policy)))')
  assert.equal(result.runtimeExecutionAllowed, false)
  assert.equal(result.launches, 0)
  assert.equal(result.sockets, 0)
  assert.equal(result.paths.length, 77)
  python(
    "blocked(lambda:p.execute(policy)); blocked(lambda:p.planning_manifest(policy,existing_root=True)); blocked(lambda:p.planning_manifest(policy,symlink_components=['workspace']))",
  )
  assert.throws(executionUnavailable, /no runtime/)
})
test('refuses modified policy, root, budget and runtime flags', () => {
  python(
    "\nfor field,value in [('root','/elsewhere'),('runtimeExecutionAllowed',True),('scope','run')]:\n changed=copy.deepcopy(policy);changed[field]=value\n blocked(lambda:p.validate_policy(changed))\nchanged=copy.deepcopy(policy);changed['ceilings']['turnStarts']=15\nblocked(lambda:p.validate_policy(changed))\nchanged=copy.deepcopy(policy);changed['cases'][0]['role']='TRIAGER'\nblocked(lambda:p.validate_policy(changed))",
  )
})
test('configuration has no ambient env/auth, no retries, and isolated asking-only placeholder', () => {
  const result = python("print(json.dumps([p.case_configuration(policy,c) for c in ['B01','B14']]))")
  for (const c of result) {
    assert.deepEqual(Object.keys(c.environment).sort(), ['CODEX_HOME', 'HOME', 'LANG', 'PATH', 'RUST_LOG', 'TMPDIR'])
    assert.match(c.configTemplate, /requires_openai_auth=false/)
    assert.match(c.configTemplate, /request_max_retries=0/)
    assert.match(c.configTemplate, /stream_max_retries=0/)
    assert.match(c.configTemplate, /<assigned-port>/)
    assert.equal(c.mcpTransportAdapter, 'NOT_IMPLEMENTED')
    assert.equal(c.runtimeExecutionAllowed, false)
    assert.equal(c.askingExceptionAuthorized, false)
  }
  assert.equal(result[0].experimentalApi, false)
  assert.equal(result[1].experimentalApi, true)
  assert.match(result[1].configTemplate, /sandbox_approval=false/)
  assert.match(result[1].configTemplate, /request_permissions=true/)
})
test('budget persists reserved intent before any possible send and cannot overlap cases', () => {
  python(
    "j.begin('B01'); j.reserve('threadStarts','thread-1')\nassert json.loads(written[-1])['state']['counts']['threadStarts']==1\nassert json.loads(written[-1])['state']['pending']['requestId']=='thread-1'\nblocked(lambda:j.begin('B02')); blocked(lambda:j.reserve('threadStarts','thread-2'))\nj.acknowledge('thread-1');j.reserve('turnStarts','turn-1');j.acknowledge('turn-1')\nj.finish('synthetic-accepted');blocked(lambda:j.begin('B01'))",
  )
})
test('lost start reply and restored unfinished journal are UNKNOWN and never resent', () => {
  python(
    "j.begin('B01');j.reserve('threadStarts','thread-1')\nrestored=p.BudgetJournal(policy,sink,lambda:time[0],snapshot=written[-1])\nassert restored.state['counts']['threadStarts']==1\nblocked(lambda:restored.reserve('threadStarts','repeat'))\nblocked(lambda:j.unknown('withheld-ack'));blocked(lambda:j.reserve('threadStarts','repeat'))",
  )
})
test('durability failure consumes the reservation and fences subsequent requests', () => {
  python(
    "j.begin('B01')\ndef fail(data):raise OSError('synthetic write loss')\nj.sink=fail\nblocked(lambda:j.reserve('threadStarts','thread-1'))\nassert j.state['counts']['threadStarts']==1\nblocked(lambda:j.reserve('threadStarts','repeat'))",
  )
})
test('fences foreign acknowledgements, deadlines and malformed retained state', () => {
  python(
    "j.begin('B01');j.reserve('threadStarts','thread-1');blocked(lambda:j.acknowledge('foreign'))\nnew=p.BudgetJournal(policy,sink,lambda:time[0]);new.begin('B02');new.reserve('threadStarts','thread-2');time[0]=60\nblocked(lambda:new.acknowledge('thread-2'))\nraw=json.loads(written[0]);raw['state']['counts']['threadStarts']=999\nblocked(lambda:p.BudgetJournal(policy,sink,lambda:0,snapshot=json.dumps(raw).encode()))",
  )
})
test('P00 cannot consume a turn or provider request', () => {
  python(
    "j.begin('P00');j.reserve('threadStarts','p00');j.acknowledge('p00',rejected=True)\nblocked(lambda:j.reserve('turnStarts','turn'));blocked(lambda:j.reserve('providerRequests','provider'))\nj.finish('thread-start-rejected');assert j.state['counts']['turnStarts']==0",
  )
})
test('enforces all fourteen single-turn and fifty-five provider-request slots', () => {
  python(
    "\nfor c in policy['cases']:\n j.begin(c['id']);j.reserve('threadStarts',c['id']+'-thread');j.acknowledge(c['id']+'-thread',rejected=c['id']=='P00')\n if c['id']=='P00':j.finish('thread-start-rejected');continue\n j.reserve('turnStarts',c['id']+'-turn');j.acknowledge(c['id']+'-turn')\n blocked(lambda:j.reserve('turnStarts',c['id']+'-extra'))\n for i in range(c['maxProviderRequests']):\n  rid=c['id']+'-provider-'+str(i);j.reserve('providerRequests',rid);j.acknowledge(rid)\n blocked(lambda:j.reserve('providerRequests',c['id']+'-overflow'))\n j.finish('synthetic-accepted' if c['kind']=='scoped-role' else 'unreached')\nassert j.state['counts']=={'threadStarts':15,'turnStarts':14,'providerRequests':55}",
  )
})
test('inspects both standard and Responses Lite namespace manifests without retaining payloads', () => {
  const result = python(
    "body={'tools':[{'type':'function','name':'mcp__worker__read'}],'input':[{'type':'additional_tools','role':'developer','tools':[{'type':'namespace','name':'functions','description':'secret-do-not-retain','tools':[{'type':'custom','name':'exec'}]}]},{'type':'message','content':'raw-secret'}]}\nprint(json.dumps(p.inspect_manifest(body)))",
  )
  assert.deepEqual(result.locations, ['tools', 'input[0].additional_tools'])
  assert.deepEqual(
    result.tools.map(t => t.name),
    ['mcp__worker__read', 'functions.exec'],
  )
  assert.doesNotMatch(JSON.stringify(result), /secret-do-not-retain|raw-secret/)
})
test('manifest gate refuses extra/missing tools, missing locations and unknown Code Mode routing', () => {
  python(
    "body={'tools':[{'type':'function','name':'mcp__worker__read'}]}\nblocked(lambda:p.manifest_gate(body,p.inspect_manifest(body)))\nblocked(lambda:p.manifest_gate(body,['missing'],route='OFFLINE_SYNTHETIC'))\nblocked(lambda:p.inspect_manifest({}))\nblocked(lambda:p.inspect_manifest({'tools':{}}))\nblocked(lambda:p.inspect_manifest({'input':[{'type':'additional_tools','role':'user','tools':[]}]}))\nassert p.manifest_gate(body,p.inspect_manifest(body),route='OFFLINE_SYNTHETIC')['containmentQualified'] is False",
  )
})
test('only B14 permits a correlated synthetic empty-denial reply; no grant or imported exception', () => {
  const result = python(
    "b={'threadId':'t','turnId':'u','itemId':'i'};f={'id':4,'method':'item/permissions/requestApproval','params':b}\nblocked(lambda:p.denial_reply('B01',f,b))\nblocked(lambda:p.denial_reply('B14',{**f,'params':{**b,'itemId':'foreign'}},b))\nprint(json.dumps(p.denial_reply('B14',f,b)))",
  )
  assert.deepEqual(result, { id: 4, result: { permissions: {}, scope: 'turn' } })
})
test('unexpected requests deny without exposing request contents', () => {
  const reply = python(
    "print(json.dumps(p.denial_reply('B01',{'id':'r','method':'unknown-secret-request','params':{'secret':'do-not-retain'}},{})))",
  )
  assert.equal(reply.error.code, -32601)
  assert.doesNotMatch(JSON.stringify(reply), /secret|do-not-retain/)
})
test('evidence projection admits only bounded counters/digests and never qualifies M02', () => {
  const result = python(
    "print(json.dumps(p.evidence_projection('B10','unreached',{'turnStarts':1,'threadStarts':1,'providerRequests':2,'credential':'secret'},'a'*64)))",
  )
  assert.equal(result.M02Complete, false)
  assert.equal(result.containmentQualified, false)
  assert.doesNotMatch(JSON.stringify(result), /secret|credential/)
})

for (const role of roles)
  test(`${role}: offline MCP framing exercises frozen reads and canonical packet schemas`, async () => {
    const fixture = createGatewayFixture(role)
    const tools = await fixture.mcpFrame({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    assert.deepEqual(
      tools.result.tools.map(t => t.name),
      fixture.profile.tools.map(t => t.name),
    )
    assert.deepEqual((await fixture.mcpFrame({ jsonrpc: '2.0', id: 2, method: 'resources/list' })).result.resources, [])
    for (const [index, step] of fixture.logicalScript.entries()) {
      const reply = await fixture.mcpFrame({
        jsonrpc: '2.0',
        id: index + 3,
        method: 'tools/call',
        params: { name: step.toolName, arguments: step.arguments },
      })
      assert.equal(reply.result.isError, undefined)
      assert.doesNotMatch(JSON.stringify(reply), /secretMetadata|assignmentSecret|credentials/)
    }
    const snapshot = fixture.snapshot()
    assert.equal(snapshot.syntheticOnly, true)
    assert.equal(snapshot.artifacts.length, 1)
    assert.equal(snapshot.receipts.length, 1)
    assert.equal(snapshot.receipts[0][1].operation, fixture.profile.tools.at(-1).name)
    const repeat = fixture.logicalScript.at(-1)
    await fixture.mcpFrame({
      jsonrpc: '2.0',
      id: 99,
      method: 'tools/call',
      params: { name: repeat.toolName, arguments: repeat.arguments },
    })
    assert.equal(fixture.snapshot().artifacts.length, 1)
  })
test('B07 fixed matrix and B08-B13 native tools cannot reach the fixture submission adapter', async () => {
  const fixture = createGatewayFixture()
  for (const entry of policy.cases.find(c => c.id === 'B07').rejections) {
    // Complementary offline role fixtures exercise the intended layer, not just unregistration.
    const selected =
      entry === 'result.role'
        ? createGatewayFixture('TEST_SCENARIO_DESIGNER')
        : entry === 'foreign-receipt'
          ? createGatewayFixture('TRIAGER')
          : fixture
    let params
    if (entry.startsWith('quality_')) params = { name: entry, arguments: {} }
    else if (entry === 'foreign-receipt')
      params = {
        name: 'quality_journey_triage_evidence_read',
        arguments: { receiptId: 'foreign', artifactKind: 'log', offset: 0, limit: 4096 },
      }
    else {
      const args = structuredClone(selected.logicalScript.at(-1).arguments)
      if (entry === 'result.role') args.result.role = 'AUTOMATOR'
      else args[entry] = 'forged'
      params = { name: selected.profile.tools.at(-1).name, arguments: args }
    }
    const reply = await selected.mcpFrame({ jsonrpc: '2.0', id: entry, method: 'tools/call', params })
    assert.ok(reply.error || reply.result.isError)
    if (entry === 'result.role' || entry === 'foreign-receipt') {
      assert.equal(reply.error, undefined)
      assert.equal(reply.result.isError, true)
    }
    assert.equal(selected.snapshot().artifacts.length, 0)
  }
  for (const name of ['exec_command', 'apply_patch', 'read_file', 'read_credentials', 'web_search', 'other_mcp']) {
    const reply = await fixture.mcpFrame({
      jsonrpc: '2.0',
      id: name,
      method: 'tools/call',
      params: { name, arguments: {} },
    })
    assert.equal(reply.error.code, -32601)
  }
  assert.equal(fixture.snapshot().artifacts.length, 0)
})
test('lost acknowledgement retains committed synthetic identities; lookup cannot synthesize another receipt', async () => {
  const fixture = createGatewayFixture()
  fixture.loseReply()
  const step = fixture.logicalScript.at(-1)
  const reply = await fixture.mcpFrame({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: step.toolName, arguments: step.arguments },
  })
  assert.equal(reply.result.isError, true)
  const stored = fixture.snapshot().receipts[0][1]
  assert.equal(fixture.snapshot().artifacts.length, 1)
  const lookup = {
    binding: { assignmentId: stored.assignmentId, attemptId: stored.attemptId },
    toolName: stored.operation,
    idempotencyKey: stored.idempotencyKey,
    requestHash: stored.requestHash,
  }
  assert.deepEqual(
    await fixture.reconcile(lookup),
    Object.fromEntries(Object.entries(stored).filter(([k]) => k !== 'fixturePayloadHash')),
  )
  assert.equal(await fixture.reconcile({ ...lookup, requestHash: `sha256:${'b'.repeat(64)}` }), null)
  assert.equal(await fixture.reconcile({ ...lookup, toolName: 'wrong-role' }), null)
})
test('scripted Responses frames require exact manifest, correlation and local synthetic routing', () => {
  const fixture = createGatewayFixture()
  const manifest = {
    tools: fixture.profile.tools.map(t => ({ type: 'function', name: t.name, parameters: t.inputSchema })),
  }
  const scripted = new ScriptedResponses(fixture.logicalScript, manifest, 4)
  let previousOutput
  for (let i = 0; i < fixture.logicalScript.length + 1; i++) {
    const events = scripted.next({ manifestBody: manifest, route: 'OFFLINE_SYNTHETIC', previousOutput })
    const item = events.find(e => e.item)?.item
    previousOutput = item ? { callId: item.call_id, ok: true } : undefined
  }
  assert.throws(() => scripted.next({ manifestBody: manifest, route: 'OFFLINE_SYNTHETIC' }), /terminal/)
  for (const bad of [
    { route: 'UNQUALIFIED' },
    { route: 'OFFLINE_SYNTHETIC', authorizationPresent: true },
    {
      route: 'OFFLINE_SYNTHETIC',
      manifestBody: { tools: [...manifest.tools, { type: 'custom', name: 'functions.exec' }] },
    },
  ]) {
    const s = new ScriptedResponses(fixture.logicalScript, manifest, 4)
    assert.throws(() => s.next({ manifestBody: manifest, ...bad }), /blocked/)
  }
  const missing = new ScriptedResponses(fixture.logicalScript, manifest, 4)
  missing.next({ manifestBody: manifest, route: 'OFFLINE_SYNTHETIC' })
  assert.throws(() => missing.next({ manifestBody: manifest, route: 'OFFLINE_SYNTHETIC' }), /missing/)
})

test('manifest schema drift, duplicate callable identity and continued denial requests fail closed', () => {
  python(
    "body={'tools':[{'type':'function','name':'fixture','parameters':{'type':'object','properties':{}}}]}\nexpected=p.inspect_manifest(body)\nchanged=copy.deepcopy(body);changed['tools'][0]['parameters']['properties']['extra']={'type':'string'}\nblocked(lambda:p.manifest_gate(changed,expected,route='OFFLINE_SYNTHETIC'))\nblocked(lambda:p.inspect_manifest({'tools':body['tools']*2}))\nb={'threadId':'t','turnId':'u','itemId':'i'};f={'id':4,'method':'item/permissions/requestApproval','params':b}\ng=p.DenialGuard('B14',b);assert g.receive(f)['result']['permissions']=={}\nblocked(lambda:g.receive(f))\nblocked(lambda:p.denial_reply('B14',{**f,'id':{'credential':'hidden'}},b))",
  )
})

test('negative case plans contain only fixed synthetic targets and never promote unregistered to OS denial', () => {
  for (const caseId of ['B07', 'B08', 'B09', 'B10', 'B11', 'B12', 'B13', 'B14']) {
    const plan = adversarialCasePlan(caseId, policy)
    assert.equal(plan.runtimeExecutionAllowed, false)
    assert.equal(plan.wireRoute, 'UNQUALIFIED')
    assert.equal(plan.containmentQualified, false)
    assert.equal(plan.classificationIfHandlerUnavailable, 'unreached')
    assert.ok(plan.attempts.length <= policy.cases.find(c => c.id === caseId).maxToolCalls)
  }
})

test('B0 source has no executable, socket or provider adapter and cannot import M01 launchers', () => {
  const py = readFileSync(new URL('./fixtures/codex-app-server-m02/probe.py', import.meta.url), 'utf8')
  const js = readFileSync(new URL('./fixtures/codex-app-server-m02/gateway-fixture.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(py, /(?:^|\n)(?:import|from) (?:subprocess|socket|http|requests|threading|ctypes|importlib)/)
  assert.doesNotMatch(py, /(?:Popen|check_output|create_connection|urlopen|os\.system|eval|exec)\(/)
  assert.doesNotMatch(js, /node:(?:child_process|net|http|https|worker_threads)|native-provider-probe/)
  assert.throws(() => adversarialCasePlan('B10', { ...policy, root: '/foreign' }), /policy changed/)
})

test('blocker diagnostics drop unrecognized error text and reject impossible observed budgets', () => {
  python(
    "j.begin('B01');blocked(lambda:j.unknown('raw-credential-value'))\nassert b'raw-credential-value' not in written[-1]\nblocked(lambda:p.evidence_projection('B01','unreached',{'turnStarts':999,'threadStarts':1,'providerRequests':2},'a'*64))",
  )
})

test('same-name schema and namespace drift block inside the Responses encoder before any event', () => {
  const direct = { tools: [{ type: 'function', name: 'read', parameters: { type: 'object', properties: {} } }] }
  const altered = structuredClone(direct)
  altered.tools[0].parameters.properties.target = { type: 'string' }
  const encoder = new ScriptedResponses([{ toolName: 'read', arguments: {} }], direct, 2)
  assert.throws(() => encoder.next({ manifestBody: altered, route: 'OFFLINE_SYNTHETIC' }), /blocked/)
  assert.equal(encoder.index, 0)
  const namespace = {
    input: [
      {
        type: 'additional_tools',
        role: 'developer',
        tools: [
          {
            type: 'namespace',
            name: 'fixture',
            description: 'pinned',
            tools: [{ type: 'function', name: 'read', parameters: {} }],
          },
        ],
      },
    ],
  }
  const drift = structuredClone(namespace)
  drift.input[0].tools[0].description = 'changed'
  const nested = new ScriptedResponses([{ toolName: 'fixture.read', arguments: {} }], namespace, 2)
  assert.throws(() => nested.next({ manifestBody: drift, route: 'OFFLINE_SYNTHETIC' }), /blocked/)
  assert.equal(nested.index, 0)
  python(
    "body={'input':[{'type':'additional_tools','role':'developer','tools':[{'type':'namespace','name':'fixture','description':'pinned','tools':[{'type':'function','name':'read','parameters':{}}]}]}]}\nexpected=p.inspect_manifest(body)\nchanged=copy.deepcopy(body);changed['input'][0]['tools'][0]['description']='changed'\nblocked(lambda:p.manifest_gate(changed,expected,route='OFFLINE_SYNTHETIC'))",
  )
})
