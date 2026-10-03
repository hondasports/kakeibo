import { Link as RouterLink } from "react-router-dom";
import { Button, Card, CardActions, CardContent, Grid, Typography } from "@mui/material";
import { SystemAdminPageFrame } from "./SystemAdminPageFrame";

export function SystemAdminHomePage() {
  return (
    <SystemAdminPageFrame
      description="対象を検索して、所属・ロール・招待状態などの管理情報を確認します。"
      title="管理トップ"
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <AdminLinkCard
            description="表示名、メールアドレス、userIdから対象ユーザーを探します。"
            label="ユーザーを検索"
            to="/admin/users"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <AdminLinkCard
            description="家計内容を見ずに、失敗したグループ削除ジョブを監視・再開します。"
            label="グループ削除ジョブ"
            to="/admin/group-deletion"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <AdminLinkCard
            description="グループ名またはgroupIdから対象グループを探します。"
            label="グループを検索"
            to="/admin/groups"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <AdminLinkCard
            description="管理者の付与・再付与・剥奪と状態を管理します。"
            label="システム管理者を管理"
            to="/admin/system-admins"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <AdminLinkCard
            description="通知種別・チャネルごとの全体配信設定を変更します。"
            label="通知設定"
            to="/admin/notifications"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <AdminLinkCard
            description="管理コンソールの操作履歴を期間・操作・対象で絞り込みます。"
            label="監査ログを確認"
            to="/admin/audit-logs"
          />
        </Grid>
      </Grid>
      <Typography color="text.secondary" variant="body2">
        家計データは表示されません。管理操作はすべて監査ログに記録されます。
      </Typography>
    </SystemAdminPageFrame>
  );
}

function AdminLinkCard({
  description,
  label,
  to,
}: {
  description: string;
  label: string;
  to: string;
}) {
  return (
    <Card sx={{ height: "100%" }} variant="outlined">
      <CardContent>
        <Typography component="h3" variant="h6">
          {label}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {description}
        </Typography>
      </CardContent>
      <CardActions>
        <Button component={RouterLink} to={to}>
          開く
        </Button>
      </CardActions>
    </Card>
  );
}
