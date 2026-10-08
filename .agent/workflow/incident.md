# INCIDENT

原因不明・反復失敗・local/CI不一致を通常の実装ループから分離して切り分ける。

CI失敗で `reproduction.result=not_reproduced`（ローカル再現不可）もここへ来る。推測での修正pushはしない。記録済みの ciFailure record（check/runUrl/artifactUrl/failedTests）と再現試行の証跡を引き継ぎ、CI環境固有の原因（バイナリ・秘密情報・リソース・並行性）を切り分ける。

事実と仮説を分離し、再現条件・証拠・既に試したこと・原因仮説・次の最小実験を記録する。base側の失敗も必要なら確認する。

原因と復旧方針が特定できたら `resolved`。検証手段がない、要求が矛盾する、権限・情報不足など外部判断が必要なら `decision_required`。
