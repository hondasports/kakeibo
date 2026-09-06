# Suzumemo Agent OS v1

Agent OSは、既存のAgent Loop v12を置き換えるものではない。

`.loop/process.yaml` が **「どう完了まで進めるか」** を定義するworkflow contractなのに対し、`.loop/agent-os.yaml` は **「この依頼では何を実行してよく、どのroute/roleで進めるか」** を決めるdecision/routing layerである。

```text
User request
  ↓
Instruction priority
  ↓
Effect classification
  ↓
Task classification
  ├─ type
  └─ complexity
  ↓
Existing Risk / Required Controls
  ↓
Route selection
  ├─ read_only
  ├─ fast
  ├─ standard
  └─ deep
  ↓
Role assignment
  ↓
.loop/process.yaml
  ↓
VERIFY / REVIEW / DELIVER / AFTERCARE
```

## なぜ追加するか

v12はRisk-based / event-driven loopとして、次の点ですでに強い。

- compact contractによるContext削減
- cheap → expensiveのfail-fast verification
- AC/IV/TCのforward/reverse coverage
- RiskとRequired Controlsの分離
- concrete triggerに束縛されたHuman Gate
- shared diffは原則1 writer
- subagentは速度または独立coverageへmaterialに効く時だけ利用

一方、依頼の大きさに関係なく同じDefault pathを入口として解釈すると、tinyな修正でもPREPARE/REVIEWの意味を毎回再判断する必要がある。

Agent OS v1では、既存contractの前に軽量なclassifier/routerを置くことで、**小さいtaskを短く、大きいtaskを必要十分に深く**処理する。

## 1. Effect model

Effectは「この操作に追加Human Gateが必要か」を判定するための分類である。

代表例:

| Effect | 例 | 追加Human Gate |
| --- | --- | --- |
| `ro_repository` | repo / Issue / PR / CIの調査 | 不要 |
| `ro_public` | 公式docs / Web調査 | 不要 |
| `repo_write` | branch上のcode/docs変更 | 不要 |
| `git_write` | branch / commit / push / requested PR | 不要 |
| `external_reversible_write` | scope内のreversible外部変更 | 原則不要 + service ops control |
| `preview_deploy` | DEV/PREVIEW deploy | 原則不要 + service ops control |
| `production_write` | productionへ直接write | 必要 |
| `irreversible_or_bulk_state` | rollback困難な削除/bulk mutation | 必要 |
| `production_secret_or_credential` | production credential rotation | 必要 |
| `production_dns_or_domain` | production DNS/domain cutover | 必要 |
| `money_movement` | 本番での実際の金銭移動 | 必要 |

重要なのは、`additional_human_gate: false` が「好きに実行してよい」を意味しない点である。

常にcurrent explicit user instructionまたは強く含意されたdelivery intentのscope内で実行する。

また、production系effectを含むtaskでも、そこで最初から停止しない。read-only discovery、reversible code変更、test、review、PRなどを可能な限り先に終え、**gate対象operationの直前だけ止める**。

## 2. Task classifier

taskを次の3軸で分類する。

### Task type

- investigation
- docs
- bugfix
- feature
- refactor
- test
- dependency
- architecture
- ops
- process

Task typeは実装手段ではなく、ユーザーが求める成果物で決める。

### Complexity

- `tiny` — 単一local surface、既知pattern、cross-cutting impactなし
- `small` — 少数の関連surface、bounded verification
- `medium` — 複数surface/caller、nontrivial state/contract、control/reviewが絡む
- `large` — architecture/cross-cutting、複数独立workstream、impactがdiscoveryまでboundedでない

Complexityは工数見積りではなくroute選択用の粗いlabelである。

### Risk

RiskはAgent OSでは再定義しない。

`.loop/process.yaml` の既存Risk modelを唯一の正本として参照する。

これにより「Task complexity」と「Failure impact」を混ぜない。

## 3. Routes

### `read_only`

調査だけでwrite effectが無いtask。

```text
PREPARE(minimal)
  ↓
read-only discovery
  ↓
claim verification when needed
  ↓
DONE
```

### `fast`

主にtiny/small + R0/R1 + distinct controlなし。

```text
PREPARE(minimal)
  ↓
IMPLEMENT
  ↓
targeted VERIFY
  ↓
DELIVER
  ↓
AFTERCARE
```

独立reviewをdefaultで追加しない。

### `standard`

medium、R2、またはRequired Controlがindependent reviewを要求するtask。

```text
PREPARE
  ↓
IMPLEMENT
  ↓
VERIFY
  ↓
REVIEW? (required時のみ)
  ↓
DELIVER
  ↓
AFTERCARE
```

### `deep`

large、R3/R4、cross-cutting、複数独立workstreamなど。

```text
parallel read-only discovery when useful
  ↓
PREPARE / PLAN
  ↓
IMPLEMENT (shared diff writer = 1)
  ↓
VERIFY
  ↓
independent REVIEW
  ↓
DELIVER
  ↓
AFTERCARE
```

R4というlabelだけではHuman Gateを追加しない。Human Gateは既存process contractまたはEffect modelの具体的triggerに従う。

## 4. Roles

Agent OSでは固定の「5人チーム」を作らない。

Roleは責務境界として定義し、必要な時だけ割り当てる。

- `root_orchestrator` — classifier / router / compact contract / result integration
- `researcher` — read-only discovery
- `planner` — PREPARE補助、AC/IV/Coverage/Controls整理
- `implementer` — shared diffの唯一のwriter
- `verifier` — Evidence / gap分類
- `reviewer` — omission-first independent review
- `specialist` — materially distinctなRequired Controlが要求する時だけ

### Writer rule

同じshared diffに対するwriterは原則1体。

subagentを増やしても、同じファイル群を複数agentで同時編集しない。

### Parallel rule

並列化候補:

- sourceが明確に分割できるread-only discovery
- path-disjoint analysis
- required independent review

並列化しないもの:

- simple search
- cheap sequential work
- same Evidenceの再確認
- 同じ情報の再要約
- reviewer同士の討論

## 5. Compact packet

Roleへ全履歴を渡さない。

例:

```text
implementer
  Goal
  AC/IV IDs
  implementation surfaces
  Risk / Controls
  Coverage Map
```

```text
reviewer
  AC/IV IDs
  relevant dimensions
  material assumptions
  Risk / Controls
  behavior diff
  Evidence
  open Finding IDs
  revision
```

既存v12のContext disciplineをrouting層にも適用する。

## 6. Route escalation

routeは一度決めたら固定ではない。

次のEvidenceが出た時だけ上位routeへ昇格する。

- new material scope
- Risk escalation
- newly required control
- cross-cutting impact発見
- 複数独立workstream発見
- verification/reviewでunbounded gap発見

昇格してもloop全体をrestartしない。

unaffected contractとsame-content Evidenceを保持し、必要なstage deltaだけ再実行する。

## 7. State

current task instanceの`.loop/state/<task-id>.yaml`に、次をcompactに保持する。

- task type
- complexity
- required effects
- selected route
- route reasons
- role assignments
- gated effects
- route history

tracked templateはschemaのみで、task固有値を入れない。

## 8. Non-goals

Agent OS v1では次をしない。

- LRF等の新DSL導入
- model/vendor固定routing
- 全taskのmulti-agent化
- reviewer人数を増やして品質を担保する設計
- Risk modelの二重化
- production operationの自動承認

狙いはあくまで、**既存v12の品質contractを保ったままroute選択を適応化し、不要な工程・context・agent invocationを減らすこと**である。
