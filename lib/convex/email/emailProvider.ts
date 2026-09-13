import { Resend } from "resend";
import type { EmailProvider } from "../../email/model";
import { createResendEmailProvider } from "../../email/providers/resendEmailProvider";

export function mockEmailProvider(): EmailProvider {
  return {
    async send({ idempotencyKey }) {
      return {
        ok: true,
        providerMessageId: `mock-${idempotencyKey}`,
      };
    },
  };
}

export function getEmailProvider(): EmailProvider {
  const appEnv = process.env.APP_ENV ?? "development";
  if (appEnv !== "production") {
    return mockEmailProvider();
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_ADDRESS;

  const shouldMock =
    apiKey === undefined ||
    apiKey === "re_change_me" ||
    apiKey === "" ||
    from === undefined ||
    from === "";

  if (shouldMock) {
    return mockEmailProvider();
  }

  const resend = new Resend(apiKey);
  return createResendEmailProvider({ from, sendEmail: resend.emails.send.bind(resend.emails) });
}
