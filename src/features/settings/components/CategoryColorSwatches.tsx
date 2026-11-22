import { Box, IconButton, Stack, Tooltip } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { designTokens } from "../../../designTokens";

export const CATEGORY_COLOR_SWATCHES: { value: string; label: string }[] = [
  { value: designTokens.color.category.default, label: "ブラウン" },
  { value: designTokens.color.brand.leaf, label: "葉色" },
  { value: designTokens.color.brand.coral, label: "コーラル" },
  { value: designTokens.color.brand.mist, label: "ミスト" },
];

type Props = {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
};

export function CategoryColorSwatches({ value, onChange, disabled = false }: Props) {
  return (
    <Stack direction="row" spacing={1} role="group" aria-label="カテゴリ色の候補">
      {CATEGORY_COLOR_SWATCHES.map((option) => {
        const selected = value.toLowerCase() === option.value.toLowerCase();
        return (
          <Tooltip key={option.value} title={option.label}>
            <span>
              <IconButton
                aria-label={option.label}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onChange(option.value)}
                size="small"
                sx={{
                  // SPはテーマの44pxタップ対象が効く。見た目の丸は内側の28pxで維持する
                  width: 28,
                  height: 28,
                  p: 0,
                  opacity: 1,
                  "&:hover": { opacity: 0.85 },
                  "&.Mui-disabled": { opacity: 0.4 },
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    bgcolor: option.value,
                    border: "2px solid",
                    borderColor: selected ? "text.primary" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selected ? <CheckIcon fontSize="small" htmlColor="#FFFFFF" /> : null}
                </Box>
              </IconButton>
            </span>
          </Tooltip>
        );
      })}
    </Stack>
  );
}
