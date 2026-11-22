import HelpOutlinedIcon from "@mui/icons-material/HelpOutlined";
import { Box, Button, Container, List, ListItem, Paper, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

type GuideSectionProps = {
  title: string;
  children: React.ReactNode;
};

function GuideSection({ title, children }: GuideSectionProps) {
  return (
    <Paper
      component="section"
      aria-labelledby={`${title}-heading`}
      variant="outlined"
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      <Typography component="h2" id={`${title}-heading`} variant="h6" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

function GuideSteps({ children }: { children: React.ReactNode }) {
  return (
    <List
      component="ol"
      dense
      disablePadding
      sx={{
        listStyle: "decimal",
        listStylePosition: "inside",
        pl: 2,
        "& .MuiListItem-root": { display: "list-item", px: 0 },
      }}
    >
      {children}
    </List>
  );
}

export function GuidePage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 5 }, pb: { xs: 12, md: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <HelpOutlinedIcon color="primary" />
            <Typography component="h1" variant="h4">
              使い方
            </Typography>
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Suzumemoの基本操作を、短い手順で確認できます。まずは支出を1件記録してみましょう。
          </Typography>
        </Box>

        <GuideSection title="まずやること">
          <GuideSteps>
            <ListItem disableGutters>「入力」から支出または収入を選びます。</ListItem>
            <ListItem disableGutters>日付、支払先、金額、カテゴリを入力して保存します。</ListItem>
            <ListItem disableGutters>
              「履歴」で週や月の合計を、「検索」で過去の明細を振り返ります。
            </ListItem>
          </GuideSteps>
          <Button
            component={RouterLink}
            to="/weeks/current/input"
            variant="contained"
            sx={{ mt: 1 }}
          >
            入力を始める
          </Button>
        </GuideSection>

        <GuideSection title="支出・収入を入力する">
          <Typography color="text.secondary" variant="body2">
            支出は店名と金額、収入は支払先の代わりに内容を入力します。メモは必要なときだけ追加できます。
          </Typography>
          <GuideSteps>
            <ListItem disableGutters>入力日を選び、支出または収入を切り替えます。</ListItem>
            <ListItem disableGutters>金額とカテゴリを確認し、「保存」します。</ListItem>
            <ListItem disableGutters>続けて記録するか、ホームへ戻ります。</ListItem>
          </GuideSteps>
        </GuideSection>

        <GuideSection title="レシートから入力する">
          <Typography color="text.secondary" variant="body2">
            レシート画像を使うと、店名・日付・金額などの候補を下書きとして作成できます。
          </Typography>
          <GuideSteps>
            <ListItem disableGutters>入力画面の「レシート入力」から画像を選びます。</ListItem>
            <ListItem disableGutters>AI下書きの候補を確認し、必要な項目を修正します。</ListItem>
            <ListItem disableGutters>
              内容を確認してから登録します。候補は自動確定されません。
            </ListItem>
          </GuideSteps>
        </GuideSection>

        <GuideSection title="月次サマリーを見る">
          <Typography color="text.secondary" variant="body2">
            月次サマリーでは、選択した月の支出・収入、カテゴリ別集計、日別の支出カレンダー、明細を確認できます。
          </Typography>
          <GuideSteps>
            <ListItem disableGutters>週次・年次サマリーやダッシュボードから月を開きます。</ListItem>
            <ListItem disableGutters>月の切り替えで、前後の月を確認します。</ListItem>
            <ListItem disableGutters>
              カレンダーやカテゴリ別の金額から、使いすぎに気づいた項目を振り返ります。
            </ListItem>
          </GuideSteps>
        </GuideSection>

        <GuideSection title="履歴を検索する">
          <Typography color="text.secondary" variant="body2">
            「検索」では、期間・キーワード・カテゴリなどの条件で過去の明細を探せます。
          </Typography>
          <GuideSteps>
            <ListItem disableGutters>期間やキーワード、カテゴリを選んで検索します。</ListItem>
            <ListItem disableGutters>条件に合った明細の一覧と合計を確認できます。</ListItem>
          </GuideSteps>
          <Button component={RouterLink} to="/search" variant="outlined" sx={{ mt: 1 }}>
            検索を開く
          </Button>
        </GuideSection>

        <GuideSection title="週次サマリーを見る">
          <Typography color="text.secondary" variant="body2">
            「履歴」では、選択した週の支出・収入、カテゴリ別集計、週別推移、明細を確認できます。
          </Typography>
          <GuideSteps>
            <ListItem disableGutters>週の切り替えで、前後の週を確認します。</ListItem>
            <ListItem disableGutters>
              カテゴリ別の金額から、使いすぎに気づいた項目を振り返ります。
            </ListItem>
            <ListItem disableGutters>明細の編集ボタンから、登録内容を修正します。</ListItem>
          </GuideSteps>
        </GuideSection>

        <GuideSection title="年次サマリーを見る">
          <Typography color="text.secondary" variant="body2">
            年次サマリーでは、月ごとの支出・収入の折れ線と、カテゴリ別の積み上げ面グラフで1年の流れを振り返れます。
          </Typography>
          <GuideSteps>
            <ListItem disableGutters>ダッシュボードや週次・月次サマリーから年を開きます。</ListItem>
            <ListItem disableGutters>年の切り替えで、過去の季節ごとの傾向を確認します。</ListItem>
            <ListItem disableGutters>
              月ごとの合計から、気になる月の月次サマリーへ進めます。
            </ListItem>
          </GuideSteps>
        </GuideSection>

        <GuideSection title="カテゴリと設定を管理する">
          <Typography color="text.secondary" variant="body2">
            設定では、カテゴリの追加・変更・無効化、週の開始曜日、グループの管理を行えます。
          </Typography>
          <Button component={RouterLink} to="/settings" variant="outlined" sx={{ mt: 1 }}>
            設定を開く
          </Button>
        </GuideSection>

        <GuideSection title="グループで共有する">
          <Typography color="text.secondary" variant="body2">
            グループを作成してメンバーを招待すると、同じ家計データを共有できます。所属グループが複数ある場合は、対象を切り替えて利用します。
          </Typography>
          <GuideSteps>
            <ListItem disableGutters>
              設定の「グループ」からグループを作成または選択します。
            </ListItem>
            <ListItem disableGutters>
              オーナーはメール招待を送り、参加後にメンバーと記録を共有します。
            </ListItem>
            <ListItem disableGutters>
              共有範囲を確認し、不要なグループは設定から管理します。
            </ListItem>
          </GuideSteps>
        </GuideSection>

        <Box sx={{ textAlign: "center" }}>
          <Button component={RouterLink} to="/" variant="text">
            ホームへ戻る
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
