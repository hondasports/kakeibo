import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { jaJP } from "@mui/x-date-pickers/locales";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { MotionConfig } from "framer-motion";
import "dayjs/locale/ja";
import "./index.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "./features/app-shell";
import { theme } from "./theme.ts";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!clerkPublishableKey) {
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY is required. Add it to .env.local before starting the app.",
  );
}

if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL is required. Add it to .env.local before starting the app.");
}

const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ThemeProvider theme={theme}>
          <LocalizationProvider
            adapterLocale="ja"
            dateAdapter={AdapterDayjs}
            localeText={jaJP.components.MuiLocalizationProvider.defaultProps.localeText}
          >
            <CssBaseline />
            <MotionConfig reducedMotion="user">
              <AppErrorBoundary>
                <App />
              </AppErrorBoundary>
            </MotionConfig>
          </LocalizationProvider>
        </ThemeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
);
