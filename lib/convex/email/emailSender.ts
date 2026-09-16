import type { EmailSender } from "../../domain/email/runner";
import { getEmailProvider } from "./emailProvider";

const DEFAULT_FROM_ADDRESS = "Suzumemo <noreply@example.com>";

export function createEmailSender(): EmailSender {
  return {
    async send(input) {
      const provider = getEmailProvider();
      return await provider.send({
        ...input,
        from: process.env.RESEND_FROM_ADDRESS ?? DEFAULT_FROM_ADDRESS,
      });
    },
  };
}
