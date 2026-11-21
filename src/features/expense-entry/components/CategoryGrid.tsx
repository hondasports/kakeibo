import { Box, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useRef, type KeyboardEvent } from "react";
import { getListboxTargetIndex } from "../../../utils/listboxNavigation";
import type { ExpenseEntryCategory } from "../types/types";

// 列数の正本。sx の gridTemplateColumns とキーボード移動の両方が参照するため App.css には書かない
const CATEGORY_GRID_COLUMNS = { xs: 2, md: 5 } as const;

export function CategoryGrid({
  ariaLabel,
  categories,
  selectedCategoryId,
  onSelect,
  compact = false,
}: {
  ariaLabel: string;
  categories: ExpenseEntryCategory[];
  selectedCategoryId?: string;
  onSelect: (categoryId: string) => void;
  compact?: boolean;
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const columnCount = isDesktop ? CATEGORY_GRID_COLUMNS.md : CATEGORY_GRID_COLUMNS.xs;
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedIndex = categories.findIndex((category) => category._id === selectedCategoryId);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const category = categories[index];
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(category._id);
      return;
    }
    const targetIndex = getListboxTargetIndex({
      columnCount,
      currentIndex: index,
      itemCount: categories.length,
      key: event.key,
    });
    if (targetIndex === null) {
      return;
    }
    event.preventDefault();
    if (targetIndex !== index) {
      onSelect(categories[targetIndex]._id);
    }
    const target = gridRef.current?.children[targetIndex];
    if (target instanceof HTMLElement) {
      target.focus();
    }
  };

  return (
    <Box
      ref={gridRef}
      className="category-grid"
      aria-label={ariaLabel}
      role="listbox"
      sx={{
        gridTemplateColumns: {
          xs: `repeat(${CATEGORY_GRID_COLUMNS.xs}, minmax(0, 1fr))`,
          md: `repeat(${CATEGORY_GRID_COLUMNS.md}, minmax(0, 1fr))`,
        },
      }}
    >
      {categories.map((category, index) => {
        const isSelected = selectedCategoryId === category._id;
        return (
          <Box
            key={category._id}
            aria-label={`${category.name}${isSelected ? " 選択中" : ""}`}
            aria-selected={isSelected}
            className="category-button"
            role="option"
            tabIndex={index === tabbableIndex ? 0 : -1}
            onClick={() => onSelect(category._id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            sx={{
              border: "1px solid",
              borderColor: isSelected ? "primary.main" : "divider",
              borderRadius: 1,
              bgcolor: isSelected ? "primary.main" : "background.paper",
              color: isSelected ? "primary.contrastText" : "text.primary",
              px: 1,
              py: compact ? 0.75 : 1,
              textAlign: "center",
              cursor: "pointer",
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: "2px",
              },
            }}
          >
            {compact ? (
              <Typography variant="caption">{category.name}</Typography>
            ) : (
              <span>{category.name}</span>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
