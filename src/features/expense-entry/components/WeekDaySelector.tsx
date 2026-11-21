import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useRef, type KeyboardEvent } from "react";
import { getListboxTargetIndex } from "../../../utils/listboxNavigation";
import { generateWeekDays } from "../../week";

// 列数の正本。sx の gridTemplateColumns とキーボード移動の両方が参照するため App.css には書かない
const WEEK_DAY_GRID_COLUMNS = { xs: 4, md: 7 } as const;

export function WeekDaySelector({
  weekStartDate,
  weekEndDate,
  selectedDate,
  onSelectDate,
}: {
  weekStartDate: string;
  weekEndDate: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const columnCount = isDesktop ? WEEK_DAY_GRID_COLUMNS.md : WEEK_DAY_GRID_COLUMNS.xs;
  const gridRef = useRef<HTMLDivElement>(null);
  const weekDays = generateWeekDays(weekStartDate, weekEndDate);
  const selectedIndex = weekDays.findIndex((day) => day.isoDate === selectedDate);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const day = weekDays[index];
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectDate(day.isoDate);
      return;
    }
    const targetIndex = getListboxTargetIndex({
      columnCount,
      currentIndex: index,
      itemCount: weekDays.length,
      key: event.key,
    });
    if (targetIndex === null) {
      return;
    }
    event.preventDefault();
    if (targetIndex !== index) {
      onSelectDate(weekDays[targetIndex].isoDate);
    }
    const target = gridRef.current?.children[targetIndex];
    if (target instanceof HTMLElement) {
      target.focus();
    }
  };

  return (
    <Box
      ref={gridRef}
      className="week-day-grid"
      aria-label="週内の日付候補"
      role="listbox"
      sx={{
        gridTemplateColumns: {
          xs: `repeat(${WEEK_DAY_GRID_COLUMNS.xs}, minmax(0, 1fr))`,
          md: `repeat(${WEEK_DAY_GRID_COLUMNS.md}, minmax(0, 1fr))`,
        },
      }}
    >
      {weekDays.map((day, index) => {
        const isSelected = selectedDate === day.isoDate;
        return (
          <Box
            aria-label={`${day.label}曜日 ${day.date}${isSelected ? " 選択中" : ""}`}
            aria-selected={isSelected}
            className="week-day-button"
            key={day.isoDate}
            onClick={() => onSelectDate(day.isoDate)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="option"
            tabIndex={index === tabbableIndex ? 0 : -1}
            sx={{
              border: "1px solid",
              borderColor: isSelected ? "primary.main" : "divider",
              borderRadius: 1,
              bgcolor: isSelected ? "primary.main" : "background.paper",
              color: isSelected ? "primary.contrastText" : "text.primary",
              px: 1,
              py: 1,
              textAlign: "center",
              cursor: "pointer",
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: "2px",
              },
            }}
          >
            <span>{day.label}</span>
            <small>{day.date}</small>
          </Box>
        );
      })}
    </Box>
  );
}
