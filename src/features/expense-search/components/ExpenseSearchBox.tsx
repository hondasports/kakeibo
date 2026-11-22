import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import SearchIcon from "@mui/icons-material/Search";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import {
  EMPTY_EXPENSE_SEARCH_FORM,
  expenseSearchPath,
  readExpenseSearchFormState,
} from "../lib/searchParams";

export function ExpenseSearchBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentQuery =
    location.pathname === "/search" ? readExpenseSearchFormState(searchParams).shopQuery : "";
  const [urlQuery, setUrlQuery] = useState(currentQuery);
  const [shopQuery, setShopQuery] = useState(currentQuery);

  if (currentQuery !== urlQuery) {
    setUrlQuery(currentQuery);
    setShopQuery(currentQuery);
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current =
      location.pathname === "/search"
        ? readExpenseSearchFormState(searchParams)
        : EMPTY_EXPENSE_SEARCH_FORM;
    navigate(expenseSearchPath({ ...current, shopQuery }));
  };

  return (
    <form aria-label="履歴検索" className="app-header-search" onSubmit={handleSubmit}>
      <TextField
        fullWidth
        label="履歴を検索"
        name="q"
        placeholder="店名・品名・銀行名・メモで検索"
        size="small"
        type="search"
        value={shopQuery}
        slotProps={{
          htmlInput: { "data-testid": "expense-search-input" },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton aria-label="検索する" edge="end" type="submit">
                  <SearchIcon />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        onChange={(event) => setShopQuery(event.target.value)}
      />
    </form>
  );
}
