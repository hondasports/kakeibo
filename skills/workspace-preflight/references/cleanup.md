# マージ済みworktreeの後片付け

`SKILL.md` から分けた、worktreeを消すときの条件と手順。

マージ済みのworktreeは、ユーザーが削除を依頼したときだけ消す。候補を探すだけの依頼なら、一覧を返して止める。依頼が対象を名指ししていなければ（「不要なものを消して」等）、下の条件をすべて満たした候補と消えるローカルデータを示し、対象の承認を得てから消す（`AGENTS.md` の不可逆操作の契約）。

1. `git fetch origin` の後、`git worktree list --porcelain` で候補を挙げる。clone元と、`preview` branchのworktree（`.env.local` の正本を持つ）は候補にしない。大きさや古さは優先度の目安で、削除してよい根拠ではない。
2. 候補ごとに次をすべて確かめる。1つでも満たさなければ、その候補は残して理由を報告する。
   - `git status --porcelain` が空
   - branchのHEADが、マージ済みPRの最終HEADと一致する（`gh pr list --head <branch> --state merged --json number,headRefOid`）
   - そのworktreeをcwdにしているprocessが無い（`lsof -a -d cwd | grep <path>`。権限等で確かめられなければ「未確認」として残す）
3. `git status --ignored --short` でignoredファイルを確かめる。`.env.local` の正本は `docs/development-process.md` の「3. `.env.local` とローカル環境」の決め方に従う。正本が候補のworktreeの中にあるなら、その候補は消さない。それ以外は正本と `cmp` で比べ、同じなら退避しない。違えば（local Convexを選んだ設定等）退避するか、ユーザーに確認する。`.convex/` 等のローカルデータは、残すかどうかが依頼から読めなければユーザー判断待ちで止める。
4. `git worktree remove <path>` で消す。branchは、削除も依頼されたときだけ `git branch -d <branch>` で消す。
5. `git worktree list --porcelain` から消えたこと、clone元の `git status` が変わっていないことを確認する。
