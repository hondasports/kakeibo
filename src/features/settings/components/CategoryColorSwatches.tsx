import { IconButton, Stack, Tooltip } from "@mui/material";
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
                  width: 28,
                  height: 28,
                  bgcolor: option.value,
                  border: "2px solid",
                  borderColor: selected ? "text.primary" : "transparent",
                  "&:hover": { bgcolor: option.value, opacity: 0.85 },
                  "&.Mui-disabled": { bgcolor: option.value, opacity: 0.4 },
                }}
              >
                {selected ? <CheckIcon fontSize="small" htmlColor="#FFFFFF" /> : null}
              </IconButton>
            </span>
          </Tooltip>
        );
      })}
    </Stack>
  );
}
