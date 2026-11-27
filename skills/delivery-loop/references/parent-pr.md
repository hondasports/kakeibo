# 親PR方式の手順

`SKILL.md` の「PRの分け方」で親PR方式を選んだときの手順。

1. 分割決定時に `origin/preview` から親branchを作りpush。最初の子の統合後に親PR（base `preview`）を作り、更新履歴を書く。
2. 子branchは親から作り、子PRのbaseは親。子のCI・E2Eは走らないためローカルゲート、CIは親PR。
3. 子の統合は `merged` と別。`merge_ready` でもゲート通過後にmerge commitで親へ入れてよい（子PRをマージ、または `git merge --no-ff` 後に親branchをpush）。
4. 途中で見つけた挙動変更は親に積まず個別PR（`skills/codebase-audit` と同じ基準）。

